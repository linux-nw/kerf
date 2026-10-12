import sharp from 'sharp'
import { EngineError } from '../../errors'

export const DEFAULT_ICO_SIZES = [16, 32, 48, 256]

export async function encodeIco(source: Buffer, sizes: number[]): Promise<Buffer> {
  const unique = [...new Set(sizes.filter((size) => Number.isInteger(size) && size >= 8 && size <= 256))].sort((a, b) => a - b)
  if (unique.length === 0) throw new EngineError('unsupported', 'Mindestens eine Größe zwischen 8 und 256 wählen')
  const images: { size: number; data: Buffer }[] = []
  for (const size of unique) {
    const data = await sharp(source, { failOn: 'none' })
      .rotate()
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .png({ compressionLevel: 9 })
      .toBuffer()
    images.push({ size, data })
  }
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const entries = Buffer.alloc(16 * images.length)
  let offset = 6 + entries.length
  images.forEach((image, index) => {
    const base = index * 16
    entries[base] = image.size === 256 ? 0 : image.size
    entries[base + 1] = image.size === 256 ? 0 : image.size
    entries[base + 2] = 0
    entries[base + 3] = 0
    entries.writeUInt16LE(1, base + 4)
    entries.writeUInt16LE(32, base + 6)
    entries.writeUInt32LE(image.data.length, base + 8)
    entries.writeUInt32LE(offset, base + 12)
    offset += image.data.length
  })
  return Buffer.concat([header, entries, ...images.map((image) => image.data)])
}

export interface IcoEntry {
  width: number
  height: number
  bpp: number
  data: Buffer
}

export function parseIco(input: Buffer): IcoEntry[] {
  if (input.length < 22 || input.readUInt16LE(0) !== 0 || input.readUInt16LE(2) !== 1) throw new EngineError('unreadable', 'Das ist keine gültige ICO-Datei')
  const count = input.readUInt16LE(4)
  const entries: IcoEntry[] = []
  for (let index = 0; index < count; index += 1) {
    const base = 6 + index * 16
    if (base + 16 > input.length) break
    const width = input[base] || 256
    const height = input[base + 1] || 256
    const bpp = input.readUInt16LE(base + 6)
    const size = input.readUInt32LE(base + 8)
    const offset = input.readUInt32LE(base + 12)
    if (offset + size > input.length) continue
    entries.push({ width, height, bpp, data: input.subarray(offset, offset + size) })
  }
  if (entries.length === 0) throw new EngineError('unreadable', 'Die ICO-Datei enthält keine Bilder')
  return entries
}

export function dibToRgba(dib: Buffer, declaredWidth: number): { width: number; height: number; data: Buffer } {
  const headerSize = dib.readUInt32LE(0)
  const width = dib.readInt32LE(4)
  const rawHeight = dib.readInt32LE(8)
  const height = Math.abs(rawHeight) / 2
  const bpp = dib.readUInt16LE(14)
  const compression = dib.readUInt32LE(16)
  let colors = dib.readUInt32LE(32)
  if (compression !== 0 && compression !== 3) throw new EngineError('unsupported', 'Dieses ICO-Format wird nicht unterstützt')
  if (width <= 0 || height <= 0 || width > 1024 || height > 1024) throw new EngineError('unreadable', 'Das ICO ist beschädigt')
  if (colors === 0 && bpp <= 8) colors = 1 << bpp
  const paletteOffset = headerSize
  const pixelsOffset = paletteOffset + (bpp <= 8 ? colors * 4 : 0)
  const rowBytes = Math.floor((width * bpp + 31) / 32) * 4
  const maskRowBytes = Math.floor((width + 31) / 32) * 4
  const maskOffset = pixelsOffset + rowBytes * height
  const rgba = Buffer.alloc(width * height * 4)
  let hasAlpha = false
  for (let y = 0; y < height; y += 1) {
    const sourceRow = pixelsOffset + (height - 1 - y) * rowBytes
    for (let x = 0; x < width; x += 1) {
      const out = (y * width + x) * 4
      let r = 0
      let g = 0
      let b = 0
      let a = 255
      if (bpp === 32) {
        const p = sourceRow + x * 4
        b = dib[p] ?? 0
        g = dib[p + 1] ?? 0
        r = dib[p + 2] ?? 0
        a = dib[p + 3] ?? 255
        if (a !== 0) hasAlpha = true
      } else if (bpp === 24) {
        const p = sourceRow + x * 3
        b = dib[p] ?? 0
        g = dib[p + 1] ?? 0
        r = dib[p + 2] ?? 0
      } else if (bpp === 8 || bpp === 4 || bpp === 1) {
        const bitIndex = x * bpp
        const byte = dib[sourceRow + (bitIndex >> 3)] ?? 0
        const shift = 8 - bpp - (bitIndex & 7)
        const index = (byte >> shift) & ((1 << bpp) - 1)
        const p = paletteOffset + index * 4
        b = dib[p] ?? 0
        g = dib[p + 1] ?? 0
        r = dib[p + 2] ?? 0
      } else {
        throw new EngineError('unsupported', 'Dieses ICO-Format wird nicht unterstützt')
      }
      rgba[out] = r
      rgba[out + 1] = g
      rgba[out + 2] = b
      rgba[out + 3] = a
    }
  }
  if (bpp !== 32 || !hasAlpha) {
    for (let y = 0; y < height; y += 1) {
      const maskRow = maskOffset + (height - 1 - y) * maskRowBytes
      for (let x = 0; x < width; x += 1) {
        const bit = ((dib[maskRow + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1
        const out = (y * width + x) * 4
        rgba[out + 3] = bit === 1 ? 0 : 255
      }
    }
  }
  void declaredWidth
  return { width, height, data: rgba }
}

export async function icoToPng(input: Buffer): Promise<Buffer> {
  const entries = parseIco(input)
  const best = [...entries].sort((a, b) => b.width * b.height - a.width * a.height)[0]
  if (!best) throw new EngineError('unreadable', 'Die ICO-Datei enthält keine Bilder')
  const isPng = best.data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (isPng) return best.data
  const { width, height, data } = dibToRgba(best.data, best.width)
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer()
}
