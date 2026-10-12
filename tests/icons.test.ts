import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('App-Symbol', () => {
  it('liefert eine gültige ICO-Datei mit allen Größen als PNG', () => {
    const ico = readFileSync(join(root, 'build', 'icon.ico'))
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    const count = ico.readUInt16LE(4)
    expect(count).toBe(7)
    const sizes: number[] = []
    for (let index = 0; index < count; index += 1) {
      const entry = 6 + index * 16
      const width = ico.readUInt8(entry) || 256
      const length = ico.readUInt32LE(entry + 8)
      const offset = ico.readUInt32LE(entry + 12)
      expect(ico.subarray(offset, offset + 8).equals(PNG)).toBe(true)
      expect(offset + length).toBeLessThanOrEqual(ico.length)
      sizes.push(width)
    }
    expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256])
  })

  it('bringt PNGs in 512 und 1024 Pixeln mit', () => {
    for (const [name, size] of [['icon.png', 512], ['icon-1024.png', 1024]] as const) {
      const data = readFileSync(join(root, 'build', name))
      expect(data.subarray(0, 8).equals(PNG)).toBe(true)
      expect(data.readUInt32BE(16)).toBe(size)
      expect(data.readUInt32BE(20)).toBe(size)
    }
  })
})
