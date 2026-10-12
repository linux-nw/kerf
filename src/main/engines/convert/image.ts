import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { EngineError } from '../../errors'
import { bmpToPng, encodeBmp } from '../image/bmp'
import { DEFAULT_ICO_SIZES, encodeIco, icoToPng } from '../image/ico'

export interface ImageConvertOptions {
  quality: number
  icoSizes: number[]
}

export interface ConvertedFile {
  name: string
  bytes: Uint8Array
}

export type ImageResult = { kind: 'file'; extension: string; bytes: Uint8Array } | { kind: 'folder'; files: ConvertedFile[] }

const toBytes = (buffer: Buffer): Uint8Array => new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)

async function heicToPng(input: Buffer): Promise<Buffer> {
  const module = (await import('heic-decode')) as unknown as { default?: unknown }
  const decode = (module.default ?? module) as (options: { buffer: Buffer }) => Promise<{ width: number; height: number; data: Uint8ClampedArray }>
  let decoded
  try {
    decoded = await decode({ buffer: input })
  } catch {
    throw new EngineError('unreadable', 'Das HEIC-Foto konnte nicht gelesen werden')
  }
  return sharp(Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength), {
    raw: { width: decoded.width, height: decoded.height, channels: 4 }
  })
    .png()
    .toBuffer()
}

export async function normalizeImage(input: Buffer, extension: string): Promise<Buffer> {
  if (extension === 'ico') return icoToPng(input)
  if (extension === 'bmp') return bmpToPng(input)
  if (extension === 'heic' || extension === 'heif') {
    try {
      const probe = await sharp(input, { failOn: 'none' }).metadata()
      if (probe.format === 'heif' && probe.compression === 'av1') return input
    } catch {
      return heicToPng(input)
    }
    return heicToPng(input)
  }
  return input
}

function open(input: Buffer, extension: string, animated: boolean) {
  const options = extension === 'svg' ? { density: 300, failOn: 'none' as const } : { failOn: 'none' as const, animated }
  const pipeline = sharp(input, options)
  return extension === 'svg' ? pipeline.resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true }) : pipeline
}

export async function imageToPdf(png: Buffer): Promise<Uint8Array> {
  const meta = await sharp(png, { failOn: 'none' }).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (!width || !height) throw new EngineError('unreadable', 'Das Bild konnte nicht gelesen werden')
  const flat = await sharp(png, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer()
  const rotated = await sharp(flat).metadata()
  const doc = await PDFDocument.create()
  const embedded = await doc.embedJpg(flat)
  const pageWidth = ((rotated.width ?? width) * 72) / 150
  const pageHeight = ((rotated.height ?? height) * 72) / 150
  const page = doc.addPage([pageWidth, pageHeight])
  page.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight })
  doc.setCreator('Kerf')
  doc.setProducer('Kerf')
  return doc.save()
}

async function faviconSet(source: Buffer, baseName: string): Promise<ConvertedFile[]> {
  const png = async (size: number, flatten: boolean) => {
    let pipeline = sharp(source, { failOn: 'none' }).rotate().resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    if (flatten) pipeline = pipeline.flatten({ background: '#ffffff' })
    return toBytes(await pipeline.png({ compressionLevel: 9 }).toBuffer())
  }
  const manifest = JSON.stringify(
    {
      name: baseName,
      short_name: baseName,
      icons: [
        { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
      ],
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone'
    },
    null,
    2
  )
  const snippet = [
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
    ''
  ].join('\n')
  const encoder = new TextEncoder()
  return [
    { name: 'favicon.ico', bytes: toBytes(await encodeIco(source, [16, 32, 48])) },
    { name: 'favicon-16x16.png', bytes: await png(16, false) },
    { name: 'favicon-32x32.png', bytes: await png(32, false) },
    { name: 'apple-touch-icon.png', bytes: await png(180, true) },
    { name: 'android-chrome-192x192.png', bytes: await png(192, false) },
    { name: 'android-chrome-512x512.png', bytes: await png(512, false) },
    { name: 'site.webmanifest', bytes: encoder.encode(manifest) },
    { name: 'html-einbindung.txt', bytes: encoder.encode(snippet) }
  ]
}

export async function convertImage(raw: Buffer, sourceExtension: string, target: string, baseName: string, options: ImageConvertOptions): Promise<ImageResult> {
  const input = await normalizeImage(raw, sourceExtension)
  const extension = sourceExtension === 'ico' || sourceExtension === 'bmp' || sourceExtension === 'heic' || sourceExtension === 'heif' ? 'png' : sourceExtension
  const animated = extension === 'gif' && (target === 'webp' || target === 'gif')
  const quality = Math.min(100, Math.max(1, Math.round(options.quality)))
  try {
    if (target === 'ico') return { kind: 'file', extension: 'ico', bytes: toBytes(await encodeIco(input, options.icoSizes.length > 0 ? options.icoSizes : DEFAULT_ICO_SIZES)) }
    if (target === 'favicon') return { kind: 'folder', files: await faviconSet(input, baseName) }
    if (target === 'bmp') return { kind: 'file', extension: 'bmp', bytes: toBytes(await encodeBmp(input)) }
    if (target === 'pdf') {
      const png = await open(input, extension, false).png().toBuffer()
      return { kind: 'file', extension: 'pdf', bytes: await imageToPdf(png) }
    }
    let pipeline = open(input, extension, animated).rotate()
    if (target === 'png') pipeline = pipeline.png({ compressionLevel: 9 })
    else if (target === 'jpg') pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true })
    else if (target === 'webp') pipeline = pipeline.webp({ quality })
    else if (target === 'avif') pipeline = pipeline.avif({ quality: Math.round(quality * 0.7), effort: 4 })
    else if (target === 'gif') pipeline = pipeline.gif()
    else if (target === 'tiff') pipeline = pipeline.tiff({ compression: 'lzw' })
    else throw new EngineError('unsupported', `Zielformat ${target} wird für Bilder nicht unterstützt`)
    return { kind: 'file', extension: target === 'jpg' ? 'jpg' : target, bytes: toBytes(await pipeline.toBuffer()) }
  } catch (error) {
    if (error instanceof EngineError) throw error
    throw new EngineError('unreadable', 'Das Bild konnte nicht gelesen oder umgewandelt werden')
  }
}
