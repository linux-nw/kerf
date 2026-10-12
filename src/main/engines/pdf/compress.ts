import { deflateSync, inflateSync } from 'node:zlib'
import {
  EncryptedPDFError,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  type PDFObject
} from 'pdf-lib'
import sharp from 'sharp'
import { CancelledError, EngineError } from '../../errors'

export { CancelledError, EngineError }

export interface PdfCompressSettings {
  dpi: number
  quality: number
  stripMetadata: boolean
}

export interface PdfCompressStats {
  images: number
  recompressed: number
}

export interface PdfCompressHooks {
  onProgress?: (fraction: number, step: string) => void
  signal?: AbortSignal
}

interface ImageTarget {
  ref: PDFRef
  maxPixels: number
}

interface ImageDescription {
  width: number
  height: number
  components: 1 | 3
  filter: 'raw' | 'flate' | 'dct'
  predictor: number
  hasSoftMask: boolean
}

const name = (value: string) => PDFName.of(value)

function asNumber(value: PDFObject | undefined): number | undefined {
  return value instanceof PDFNumber ? value.asNumber() : undefined
}

function isEncryptedError(error: unknown): boolean {
  if (error instanceof EncryptedPDFError) return true
  return error instanceof Error && /is encrypted/i.test(error.message)
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new CancelledError()
}

function collectImageTargets(doc: PDFDocument, dpi: number): Map<string, ImageTarget> {
  const context = doc.context
  const targets = new Map<string, ImageTarget>()

  const visitResources = (resources: PDFDict | undefined, pagePoints: number, seen: Set<string>) => {
    if (!resources) return
    const xobjects = context.lookupMaybe(resources.get(name('XObject')), PDFDict)
    if (!xobjects) return
    for (const [, value] of xobjects.entries()) {
      if (!(value instanceof PDFRef)) continue
      const object = context.lookup(value)
      if (!(object instanceof PDFRawStream)) continue
      const subtype = context.lookup(object.dict.get(name('Subtype')))
      const subtypeName = subtype instanceof PDFName ? subtype.decodeText() : ''
      if (subtypeName === 'Image') {
        const maxPixels = Math.max(1, Math.ceil((pagePoints / 72) * dpi))
        const existing = targets.get(value.tag)
        if (!existing || existing.maxPixels < maxPixels) targets.set(value.tag, { ref: value, maxPixels })
      } else if (subtypeName === 'Form' && !seen.has(value.tag)) {
        seen.add(value.tag)
        visitResources(context.lookupMaybe(object.dict.get(name('Resources')), PDFDict), pagePoints, seen)
      }
    }
  }

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    visitResources(page.node.Resources(), Math.max(width, height), new Set())
  }
  return targets
}

function filterNames(doc: PDFDocument, dict: PDFDict): string[] | null {
  const value = doc.context.lookup(dict.get(name('Filter')))
  if (value === undefined) return []
  if (value instanceof PDFName) return [value.decodeText()]
  if (value instanceof PDFArray) {
    const names: string[] = []
    for (let index = 0; index < value.size(); index += 1) {
      const entry = doc.context.lookup(value.get(index))
      if (!(entry instanceof PDFName)) return null
      names.push(entry.decodeText())
    }
    return names
  }
  return null
}

function componentCount(doc: PDFDocument, dict: PDFDict): 1 | 3 | null {
  const value = doc.context.lookup(dict.get(name('ColorSpace')))
  if (value instanceof PDFName) {
    const label = value.decodeText()
    if (label === 'DeviceRGB') return 3
    if (label === 'DeviceGray') return 1
    return null
  }
  if (value instanceof PDFArray) {
    const head = doc.context.lookup(value.get(0))
    if (head instanceof PDFName && head.decodeText() === 'ICCBased') {
      const profile = doc.context.lookup(value.get(1))
      if (profile instanceof PDFRawStream) {
        const count = asNumber(doc.context.lookup(profile.dict.get(name('N'))))
        if (count === 1 || count === 3) return count
      }
    }
  }
  return null
}

function predictorOf(doc: PDFDocument, dict: PDFDict): number | null {
  const parms = doc.context.lookup(dict.get(name('DecodeParms')))
  let source: PDFDict | undefined
  if (parms instanceof PDFDict) source = parms
  else if (parms instanceof PDFArray && parms.size() === 1) {
    const first = doc.context.lookup(parms.get(0))
    if (first instanceof PDFDict) source = first
  } else if (parms === undefined) return 1
  if (!source) return null
  return asNumber(doc.context.lookup(source.get(name('Predictor')))) ?? 1
}

function describeImage(doc: PDFDocument, stream: PDFRawStream): ImageDescription | null {
  const dict = stream.dict
  const lookup = (key: string) => doc.context.lookup(dict.get(name(key)))
  const imageMask = lookup('ImageMask')
  if (imageMask !== undefined && String(imageMask) === 'true') return null
  if (lookup('Mask') !== undefined) return null
  const width = asNumber(lookup('Width'))
  const height = asNumber(lookup('Height'))
  if (!width || !height) return null
  const components = componentCount(doc, dict)
  if (components === null) return null

  const filters = filterNames(doc, dict)
  if (filters === null || filters.length > 1) return null
  const filter = filters[0]
  const softMask = lookup('SMask')
  if (softMask instanceof PDFRawStream && softMask.dict.get(name('Matte')) !== undefined) return null

  if (filter === 'DCTDecode') {
    return { width, height, components, filter: 'dct', predictor: 1, hasSoftMask: softMask !== undefined }
  }
  if (filter !== undefined && filter !== 'FlateDecode') return null
  const bits = asNumber(lookup('BitsPerComponent'))
  if (bits !== 8) return null
  const predictor = predictorOf(doc, dict)
  if (predictor === null || (predictor !== 1 && predictor < 10)) return null
  return {
    width,
    height,
    components,
    filter: filter === 'FlateDecode' ? 'flate' : 'raw',
    predictor,
    hasSoftMask: softMask !== undefined
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft
  const distanceLeft = Math.abs(estimate - left)
  const distanceUp = Math.abs(estimate - up)
  const distanceUpLeft = Math.abs(estimate - upLeft)
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left
  return distanceUp <= distanceUpLeft ? up : upLeft
}

export function unfilterPng(data: Buffer, rowBytes: number, bytesPerPixel: number, rows: number): Buffer | null {
  if (data.length < rows * (rowBytes + 1)) return null
  const output = Buffer.alloc(rows * rowBytes)
  for (let row = 0; row < rows; row += 1) {
    const type = data[row * (rowBytes + 1)]
    const input = row * (rowBytes + 1) + 1
    const current = row * rowBytes
    const previous = current - rowBytes
    for (let index = 0; index < rowBytes; index += 1) {
      const raw = data[input + index] ?? 0
      const left = index >= bytesPerPixel ? (output[current + index - bytesPerPixel] ?? 0) : 0
      const up = row > 0 ? (output[previous + index] ?? 0) : 0
      const upLeft = row > 0 && index >= bytesPerPixel ? (output[previous + index - bytesPerPixel] ?? 0) : 0
      let value: number
      switch (type) {
        case 0:
          value = raw
          break
        case 1:
          value = raw + left
          break
        case 2:
          value = raw + up
          break
        case 3:
          value = raw + ((left + up) >> 1)
          break
        case 4:
          value = raw + paeth(left, up, upLeft)
          break
        default:
          return null
      }
      output[current + index] = value & 0xff
    }
  }
  return output
}

export function filterPngUp(raw: Buffer, rowBytes: number, rows: number): Buffer {
  const output = Buffer.alloc(rows * (rowBytes + 1))
  for (let row = 0; row < rows; row += 1) {
    const target = row * (rowBytes + 1)
    const source = row * rowBytes
    output[target] = 2
    for (let index = 0; index < rowBytes; index += 1) {
      const up = row > 0 ? (raw[source - rowBytes + index] ?? 0) : 0
      output[target + 1 + index] = ((raw[source + index] ?? 0) - up) & 0xff
    }
  }
  return output
}

function scaledSize(width: number, height: number, maxPixels: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxPixels) return { width, height }
  const factor = maxPixels / longest
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) }
}

interface Replacement {
  bytes: Uint8Array
  filter: 'DCTDecode' | 'FlateDecode'
  width: number
  height: number
  predictorColumns: number | null
}

async function replaceDct(
  stream: PDFRawStream,
  description: ImageDescription,
  maxPixels: number,
  quality: number
): Promise<Replacement | null> {
  const original = Buffer.from(stream.contents)
  const meta = await sharp(original, { failOn: 'none' }).metadata()
  if (!meta.width || !meta.height || (meta.channels !== 1 && meta.channels !== 3)) return null
  if (meta.channels !== description.components) return null
  const size = scaledSize(meta.width, meta.height, maxPixels)
  let pipeline = sharp(original, { failOn: 'none' })
  if (size.width !== meta.width) pipeline = pipeline.resize(size.width, size.height, { fit: 'fill', kernel: 'lanczos3' })
  const encoded = await pipeline
    .keepIccProfile()
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: meta.channels === 3 ? '4:2:0' : '4:4:4' })
    .toBuffer()
  if (encoded.length >= original.length * 0.92) return null
  return { bytes: encoded, filter: 'DCTDecode', width: size.width, height: size.height, predictorColumns: null }
}

async function replaceFlate(
  stream: PDFRawStream,
  description: ImageDescription,
  maxPixels: number,
  quality: number
): Promise<Replacement | null> {
  const { width, height, components } = description
  const rowBytes = width * components
  let raw: Buffer
  try {
    const inflated = description.filter === 'flate' ? inflateSync(Buffer.from(stream.contents)) : Buffer.from(stream.contents)
    if (description.predictor >= 10) {
      const plain = unfilterPng(inflated, rowBytes, components, height)
      if (!plain) return null
      raw = plain
    } else {
      raw = inflated
    }
  } catch {
    return null
  }
  if (raw.length !== rowBytes * height) return null
  if (raw.length < 12 * 1024) return null

  const size = scaledSize(width, height, maxPixels)
  let pipeline = sharp(raw, { raw: { width, height, channels: components } })
  if (size.width !== width) pipeline = pipeline.resize(size.width, size.height, { fit: 'fill', kernel: 'lanczos3' })

  const { data: pixels, info } = await pipeline.clone().raw().toBuffer({ resolveWithObject: true })
  const newRowBytes = info.width * components
  const plain = deflateSync(pixels, { level: 9 })
  const predicted = deflateSync(filterPngUp(pixels, newRowBytes, info.height), { level: 9 })
  const lossless = predicted.length < plain.length ? predicted : plain
  const usesPredictor = predicted.length < plain.length

  const jpeg = await pipeline
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: components === 3 ? '4:2:0' : '4:4:4' })
    .toBuffer()

  const jpegWins = jpeg.length < lossless.length * 0.6
  const bytes = jpegWins ? jpeg : lossless
  if (bytes.length >= stream.contents.length * 0.95) return null
  return jpegWins
    ? { bytes, filter: 'DCTDecode', width: info.width, height: info.height, predictorColumns: null }
    : { bytes, filter: 'FlateDecode', width: info.width, height: info.height, predictorColumns: usesPredictor ? info.width : null }
}

function applyReplacement(doc: PDFDocument, ref: PDFRef, stream: PDFRawStream, replacement: Replacement, components: number): void {
  const dict = stream.dict
  dict.set(name('Width'), PDFNumber.of(replacement.width))
  dict.set(name('Height'), PDFNumber.of(replacement.height))
  dict.set(name('BitsPerComponent'), PDFNumber.of(8))
  dict.set(name('Filter'), name(replacement.filter))
  dict.delete(name('DecodeParms'))
  if (replacement.filter === 'FlateDecode' && replacement.predictorColumns !== null) {
    dict.set(
      name('DecodeParms'),
      doc.context.obj({
        Predictor: 15,
        Colors: components,
        BitsPerComponent: 8,
        Columns: replacement.predictorColumns
      })
    )
  }
  doc.context.assign(ref, PDFRawStream.of(dict, replacement.bytes))
}

function stripMetadata(doc: PDFDocument): void {
  doc.catalog.delete(name('Metadata'))
  const trailer = doc.context.trailerInfo as { Info?: PDFObject }
  trailer.Info = undefined
}

export async function compressPdfBytes(
  input: Uint8Array,
  settings: PdfCompressSettings,
  hooks: PdfCompressHooks = {}
): Promise<{ bytes: Uint8Array; stats: PdfCompressStats }> {
  const { onProgress, signal } = hooks
  onProgress?.(0.02, 'Datei wird gelesen')

  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(input, { updateMetadata: false })
  } catch (error) {
    if (isEncryptedError(error)) throw new EngineError('password', 'Die Datei ist passwortgeschützt')
    throw new EngineError('unreadable', error instanceof Error ? error.message : 'Datei nicht lesbar')
  }
  throwIfCancelled(signal)

  const targets = [...collectImageTargets(doc, settings.dpi).values()]
  const stats: PdfCompressStats = { images: targets.length, recompressed: 0 }

  for (const [index, target] of targets.entries()) {
    throwIfCancelled(signal)
    onProgress?.(0.05 + 0.85 * (index / Math.max(1, targets.length)), 'Bilder werden gerechnet')
    const stream = doc.context.lookup(target.ref)
    if (!(stream instanceof PDFRawStream)) continue
    const description = describeImage(doc, stream)
    if (!description) continue
    try {
      const replacement =
        description.filter === 'dct'
          ? await replaceDct(stream, description, target.maxPixels, settings.quality)
          : await replaceFlate(stream, description, target.maxPixels, settings.quality)
      if (!replacement) continue
      applyReplacement(doc, target.ref, stream, replacement, description.components)
      stats.recompressed += 1
    } catch (error) {
      if (error instanceof CancelledError) throw error
      continue
    }
  }

  throwIfCancelled(signal)
  onProgress?.(0.92, 'Datei wird geschrieben')
  if (settings.stripMetadata) stripMetadata(doc)
  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false })
  onProgress?.(1, 'Fertig')
  return { bytes, stats }
}
