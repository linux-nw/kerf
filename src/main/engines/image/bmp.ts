import sharp from 'sharp'
import { EngineError } from '../../errors'

export async function encodeBmp(source: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(source, { failOn: 'none' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const width = info.width
  const height = info.height
  const rowBytes = Math.ceil((width * 3) / 4) * 4
  const imageSize = rowBytes * height
  const header = Buffer.alloc(54)
  header.write('BM', 0, 'latin1')
  header.writeUInt32LE(54 + imageSize, 2)
  header.writeUInt32LE(54, 10)
  header.writeUInt32LE(40, 14)
  header.writeInt32LE(width, 18)
  header.writeInt32LE(height, 22)
  header.writeUInt16LE(1, 26)
  header.writeUInt16LE(24, 28)
  header.writeUInt32LE(0, 30)
  header.writeUInt32LE(imageSize, 34)
  header.writeInt32LE(2835, 38)
  header.writeInt32LE(2835, 42)
  const pixels = Buffer.alloc(imageSize)
  for (let y = 0; y < height; y += 1) {
    const sourceRow = (height - 1 - y) * width * 3
    const targetRow = y * rowBytes
    for (let x = 0; x < width; x += 1) {
      pixels[targetRow + x * 3] = data[sourceRow + x * 3 + 2] ?? 0
      pixels[targetRow + x * 3 + 1] = data[sourceRow + x * 3 + 1] ?? 0
      pixels[targetRow + x * 3 + 2] = data[sourceRow + x * 3] ?? 0
    }
  }
  return Buffer.concat([header, pixels])
}

export async function bmpToPng(input: Buffer): Promise<Buffer> {
  if (input.length < 54 || input.toString('latin1', 0, 2) !== 'BM') throw new EngineError('unreadable', 'Das ist keine gültige BMP-Datei')
  const dataOffset = input.readUInt32LE(10)
  const headerSize = input.readUInt32LE(14)
  if (headerSize < 40) throw new EngineError('unsupported', 'Dieses BMP-Format wird nicht unterstützt')
  const width = input.readInt32LE(18)
  const rawHeight = input.readInt32LE(22)
  const height = Math.abs(rawHeight)
  const topDown = rawHeight < 0
  const bpp = input.readUInt16LE(28)
  const compression = input.readUInt32LE(30)
  if (compression !== 0 && compression !== 3) throw new EngineError('unsupported', 'Komprimierte BMP-Dateien werden nicht unterstützt')
  if (width <= 0 || height <= 0 || width > 20000 || height > 20000) throw new EngineError('unreadable', 'Das BMP ist beschädigt')
  let colors = input.readUInt32LE(46)
  if (colors === 0 && bpp <= 8) colors = 1 << bpp
  const paletteOffset = 14 + headerSize
  const rowBytes = Math.floor((width * bpp + 31) / 32) * 4
  const rgba = Buffer.alloc(width * height * 4)
  let anyAlpha = false
  for (let y = 0; y < height; y += 1) {
    const sourceRow = dataOffset + (topDown ? y : height - 1 - y) * rowBytes
    for (let x = 0; x < width; x += 1) {
      const out = (y * width + x) * 4
      let r = 0
      let g = 0
      let b = 0
      let a = 255
      if (bpp === 24) {
        const p = sourceRow + x * 3
        b = input[p] ?? 0
        g = input[p + 1] ?? 0
        r = input[p + 2] ?? 0
      } else if (bpp === 32) {
        const p = sourceRow + x * 4
        b = input[p] ?? 0
        g = input[p + 1] ?? 0
        r = input[p + 2] ?? 0
        a = input[p + 3] ?? 255
        if (a !== 0) anyAlpha = true
      } else if (bpp === 8 || bpp === 4 || bpp === 1) {
        const bitIndex = x * bpp
        const byte = input[sourceRow + (bitIndex >> 3)] ?? 0
        const shift = 8 - bpp - (bitIndex & 7)
        const index = (byte >> shift) & ((1 << bpp) - 1)
        const p = paletteOffset + index * 4
        b = input[p] ?? 0
        g = input[p + 1] ?? 0
        r = input[p + 2] ?? 0
      } else {
        throw new EngineError('unsupported', `BMP mit ${bpp} Bit wird nicht unterstützt`)
      }
      rgba[out] = r
      rgba[out + 1] = g
      rgba[out + 2] = b
      rgba[out + 3] = a
    }
  }
  if (bpp === 32 && !anyAlpha) for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer()
}
