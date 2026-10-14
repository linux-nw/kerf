import { describe, expect, it } from 'vitest'
import { lowestAcceptableQuality, ssimLuma } from '../src/main/engines/image/perceptual'
import { packBits } from '../src/main/engines/pdf/compress'

function gradient(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data[y * width + x] = (x * 3 + y * 5) % 256
  return data
}

describe('ssimLuma', () => {
  it('liefert 1 für identische Bilder', () => {
    const image = gradient(64, 64)
    expect(ssimLuma(image, image, 64, 64)).toBeCloseTo(1, 6)
  })

  it('wird mit zunehmendem Rauschen kleiner', () => {
    const image = gradient(64, 64)
    const slight = image.map((value, index) => (index % 7 === 0 ? Math.min(255, value + 6) : value))
    const heavy = image.map((value, index) => (index % 2 === 0 ? 255 - value : value))
    const high = ssimLuma(image, slight, 64, 64)
    const low = ssimLuma(image, heavy, 64, 64)
    expect(high).toBeGreaterThan(low)
    expect(high).toBeLessThan(1)
  })

  it('liefert 0 bei unterschiedlichen Größen', () => {
    expect(ssimLuma(new Uint8Array(100), new Uint8Array(90), 10, 10)).toBe(0)
  })
})

describe('lowestAcceptableQuality', () => {
  const probe = (threshold: number) => ({
    encode: async (quality: number) => new Uint8Array(quality),
    similarity: async (encoded: Uint8Array) => encoded.length / 100 + threshold
  })

  it('findet die niedrigste Qualität, die noch reicht', async () => {
    const result = await lowestAcceptableQuality(probe(0.2), 78, 30, 0.94)
    expect(result.quality).toBe(74)
    expect(result.bytes.length).toBe(74)
  })

  it('bleibt bei der Höchstqualität, wenn nichts darunter reicht', async () => {
    const result = await lowestAcceptableQuality(probe(0), 78, 30, 0.94)
    expect(result.quality).toBe(78)
  })

  it('geht bis zum Minimum, wenn alles reicht', async () => {
    const result = await lowestAcceptableQuality(probe(1), 78, 30, 0.94)
    expect(result.quality).toBe(30)
  })
})

describe('packBits', () => {
  it('packt Bildpunkte zeilenweise mit höchstem Bit zuerst', () => {
    const gray = new Uint8Array([255, 0, 255, 0, 0, 0, 0, 0, 255, 255, 0, 0, 0, 0, 0, 0])
    const packed = packBits(gray, 8, 2)
    expect(packed.length).toBe(2)
    expect(packed[0]).toBe(0b10100000)
    expect(packed[1]).toBe(0b11000000)
  })

  it('füllt Zeilen auf volle Bytes auf', () => {
    const packed = packBits(new Uint8Array(10 * 3).fill(255), 10, 3)
    expect(packed.length).toBe(6)
    expect(packed[0]).toBe(0xff)
    expect(packed[1]).toBe(0b11000000)
  })
})
