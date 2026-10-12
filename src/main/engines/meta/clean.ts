import exifr from 'exifr'
import { unzipSync, zipSync, type Zippable } from 'fflate'
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import sharp from 'sharp'
import { EngineError } from '../../errors'

export interface CleanResult {
  bytes: Uint8Array
  note: string | null
}

const JPEG_KEEP = new Set([0xe0, 0xee])

export function stripJpeg(input: Buffer): Buffer {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) throw new EngineError('unreadable', 'Das ist kein gültiges JPEG')
  const parts: Buffer[] = [input.subarray(0, 2)]
  let offset = 2
  while (offset + 4 <= input.length) {
    if (input[offset] !== 0xff) throw new EngineError('unreadable', 'Das JPEG ist beschädigt')
    let marker = input[offset + 1] ?? 0
    while (marker === 0xff) {
      offset += 1
      marker = input[offset + 1] ?? 0
    }
    if (marker === 0xda) {
      parts.push(input.subarray(offset))
      return Buffer.concat(parts)
    }
    if (marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(input.subarray(offset, offset + 2))
      offset += 2
      continue
    }
    const length = input.readUInt16BE(offset + 2)
    const end = offset + 2 + length
    if (end > input.length) throw new EngineError('unreadable', 'Das JPEG ist beschädigt')
    const segment = input.subarray(offset, end)
    const isIcc = marker === 0xe2 && segment.subarray(4, 16).toString('latin1') === 'ICC_PROFILE\u0000'
    const keep = !(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe ? true : JPEG_KEEP.has(marker) || isIcc
    if (keep) parts.push(segment)
    offset = end
  }
  parts.push(input.subarray(offset))
  return Buffer.concat(parts)
}

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'])

export function stripPng(input: Buffer): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (input.length < 8 || !input.subarray(0, 8).equals(signature)) throw new EngineError('unreadable', 'Das ist kein gültiges PNG')
  const parts: Buffer[] = [signature]
  let offset = 8
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset)
    const type = input.subarray(offset + 4, offset + 8).toString('latin1')
    const end = offset + 12 + length
    if (end > input.length) throw new EngineError('unreadable', 'Das PNG ist beschädigt')
    if (!PNG_DROP.has(type)) parts.push(input.subarray(offset, end))
    offset = end
    if (type === 'IEND') break
  }
  return Buffer.concat(parts)
}

const EMPTY_CORE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>'
const EMPTY_APP =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>'

export function stripOffice(input: Uint8Array): Uint8Array {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(input)
  } catch {
    throw new EngineError('unreadable', 'Die Datei ist beschädigt oder kein gültiges Office-Dokument')
  }
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const result: Zippable = {}
  for (const [name, data] of Object.entries(files)) {
    if (name === 'docProps/custom.xml' || name.startsWith('docProps/thumbnail')) continue
    if (name === 'docProps/core.xml') {
      result[name] = encoder.encode(EMPTY_CORE)
    } else if (name === 'docProps/app.xml') {
      result[name] = encoder.encode(EMPTY_APP)
    } else if (name === '_rels/.rels') {
      const text = decoder.decode(data).replace(/<Relationship\b[^>]*Target="(?:\/)?docProps\/(?:custom\.xml|thumbnail[^"]*)"[^>]*\/>/g, '')
      result[name] = encoder.encode(text)
    } else if (name === '[Content_Types].xml') {
      const text = decoder.decode(data).replace(/<Override\b[^>]*PartName="\/docProps\/custom\.xml"[^>]*\/>/g, '')
      result[name] = encoder.encode(text)
    } else {
      const media = /\.(jpe?g|png|gif|mp4|mp3|zip)$/i.test(name)
      result[name] = [data, { level: media ? 0 : 6 }]
    }
  }
  return zipSync(result)
}

export async function stripPdf(input: Buffer): Promise<Uint8Array> {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(input, { updateMetadata: false })
  } catch (error) {
    if (error instanceof Error && /encrypted/i.test(error.message)) throw new EngineError('password', 'Die Datei ist verschlüsselt')
    throw new EngineError('unreadable', 'Das ist kein gültiges PDF')
  }
  doc.context.trailerInfo.Info = doc.context.register(PDFDict.withContext(doc.context))
  doc.catalog.delete(PDFName.of('Metadata'))
  doc.catalog.delete(PDFName.of('PieceInfo'))
  for (const page of doc.getPages()) {
    page.node.delete(PDFName.of('Metadata'))
    page.node.delete(PDFName.of('PieceInfo'))
  }
  return doc.save({ useObjectStreams: true })
}

async function reencode(input: Buffer, extension: string): Promise<CleanResult> {
  try {
    let pipeline = sharp(input, { failOn: 'none' }).rotate()
    if (extension === 'jpg' || extension === 'jpeg') pipeline = pipeline.jpeg({ quality: 93, mozjpeg: true })
    else if (extension === 'webp') pipeline = pipeline.webp({ quality: 92 })
    else if (extension === 'avif') pipeline = pipeline.avif({ quality: 80 })
    else if (extension === 'tif' || extension === 'tiff') pipeline = pipeline.tiff({ compression: 'lzw' })
    else if (extension === 'png') pipeline = pipeline.png({ compressionLevel: 9 })
    else throw new EngineError('unsupported', `Dateityp .${extension} wird nicht unterstützt`)
    const out = await pipeline.toBuffer()
    return { bytes: new Uint8Array(out.buffer, out.byteOffset, out.byteLength), note: 'Das Bild wurde neu kodiert' }
  } catch (error) {
    if (error instanceof EngineError) throw error
    throw new EngineError('unreadable', 'Das Bild konnte nicht gelesen werden')
  }
}

export async function cleanBytes(input: Buffer, extension: string): Promise<CleanResult> {
  if (extension === 'jpg' || extension === 'jpeg') {
    let orientation = 1
    try {
      orientation = (await exifr.orientation(input)) ?? 1
    } catch {
      orientation = 1
    }
    if (orientation > 1) return reencode(input, extension)
    const stripped = stripJpeg(input)
    return { bytes: new Uint8Array(stripped.buffer, stripped.byteOffset, stripped.byteLength), note: null }
  }
  if (extension === 'png') {
    const stripped = stripPng(input)
    return { bytes: new Uint8Array(stripped.buffer, stripped.byteOffset, stripped.byteLength), note: null }
  }
  if (extension === 'webp' || extension === 'avif' || extension === 'tif' || extension === 'tiff') return reencode(input, extension)
  if (extension === 'pdf') return { bytes: await stripPdf(input), note: null }
  if (extension === 'docx' || extension === 'xlsx' || extension === 'pptx') return { bytes: stripOffice(new Uint8Array(input)), note: null }
  throw new EngineError('unsupported', `Dateityp .${extension} wird nicht unterstützt`)
}
