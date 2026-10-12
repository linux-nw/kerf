import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'

function noiseImage(width: number, height: number, channels: 3 | 4, seed: number): Buffer {
  const data = Buffer.alloc(width * height * channels)
  let state = seed >>> 0
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels
      const base = (x / width) * 180 + (y / height) * 60
      data[offset] = Math.min(255, base + next() * 50)
      data[offset + 1] = Math.min(255, base * 0.8 + next() * 50)
      data[offset + 2] = Math.min(255, 255 - base * 0.5 + next() * 50)
      if (channels === 4) data[offset + 3] = 255
    }
  }
  return data
}

export async function photoJpeg(width = 3000, height = 2000): Promise<Buffer> {
  return sharp(noiseImage(width, height, 3, 7), { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer()
}

export async function photoPng(width = 1600, height = 1200): Promise<Buffer> {
  return sharp(noiseImage(width, height, 3, 11), { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 6 })
    .toBuffer()
}

export async function logoPng(): Promise<Buffer> {
  const width = 240
  const height = 80
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const inside = x > 10 && x < 230 && y > 10 && y < 70
      data[offset] = 232
      data[offset + 1] = 93
      data[offset + 2] = 12
      data[offset + 3] = inside ? 255 : 0
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

export async function makeSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const jpeg = await doc.embedJpg(await photoJpeg())
  const png = await doc.embedPng(await photoPng())
  const logo = await doc.embedPng(await logoPng())

  const first = doc.addPage([595, 842])
  first.drawImage(jpeg, { x: 20, y: 400, width: 555, height: 370 })
  first.drawImage(logo, { x: 20, y: 20, width: 120, height: 40 })

  const second = doc.addPage([595, 842])
  second.drawImage(png, { x: 20, y: 300, width: 555, height: 416 })

  doc.setTitle('Beispiel')
  doc.setAuthor('Kerf Test')
  return doc.save()
}
