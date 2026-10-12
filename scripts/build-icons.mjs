import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = await readFile(join(root, 'build', 'icon.svg'))
const sizes = [16, 24, 32, 48, 64, 128, 256]

const render = (size) => sharp(source, { density: Math.max(72, (size / 1024) * 72 * 4) }).resize(size, size).png({ compressionLevel: 9 }).toBuffer()

const images = await Promise.all(sizes.map(async (size) => ({ size, data: await render(size) })))
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)
const entries = []
let offset = 6 + images.length * 16
for (const image of images) {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(image.size >= 256 ? 0 : image.size, 0)
  entry.writeUInt8(image.size >= 256 ? 0 : image.size, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(image.data.length, 8)
  entry.writeUInt32LE(offset, 12)
  entries.push(entry)
  offset += image.data.length
}
await writeFile(join(root, 'build', 'icon.ico'), Buffer.concat([header, ...entries, ...images.map((image) => image.data)]))
await writeFile(join(root, 'build', 'icon.png'), await render(512))
await writeFile(join(root, 'build', 'icon-1024.png'), await render(1024))
console.log(`Symbole geschrieben: ${sizes.join(', ')} px als ICO, dazu icon.png (512) und icon-1024.png`)
