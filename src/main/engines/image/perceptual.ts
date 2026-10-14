const WINDOW = 8
const C1 = (0.01 * 255) ** 2
const C2 = (0.03 * 255) ** 2

export function ssimLuma(reference: Uint8Array, candidate: Uint8Array, width: number, height: number): number {
  if (reference.length !== candidate.length || reference.length < width * height) return 0
  if (width < WINDOW || height < WINDOW) {
    let total = 0
    for (let index = 0; index < width * height; index += 1) total += Math.abs((reference[index] ?? 0) - (candidate[index] ?? 0))
    return 1 - total / (width * height * 255)
  }
  let sum = 0
  let count = 0
  const area = WINDOW * WINDOW
  for (let y = 0; y + WINDOW <= height; y += WINDOW) {
    for (let x = 0; x + WINDOW <= width; x += WINDOW) {
      let meanA = 0
      let meanB = 0
      for (let dy = 0; dy < WINDOW; dy += 1) {
        const row = (y + dy) * width + x
        for (let dx = 0; dx < WINDOW; dx += 1) {
          meanA += reference[row + dx] ?? 0
          meanB += candidate[row + dx] ?? 0
        }
      }
      meanA /= area
      meanB /= area
      let varA = 0
      let varB = 0
      let covariance = 0
      for (let dy = 0; dy < WINDOW; dy += 1) {
        const row = (y + dy) * width + x
        for (let dx = 0; dx < WINDOW; dx += 1) {
          const a = (reference[row + dx] ?? 0) - meanA
          const b = (candidate[row + dx] ?? 0) - meanB
          varA += a * a
          varB += b * b
          covariance += a * b
        }
      }
      varA /= area - 1
      varB /= area - 1
      covariance /= area - 1
      const value = ((2 * meanA * meanB + C1) * (2 * covariance + C2)) / ((meanA * meanA + meanB * meanB + C1) * (varA + varB + C2))
      sum += value
      count += 1
    }
  }
  return count === 0 ? 1 : sum / count
}

export interface QualityProbe {
  encode: (quality: number) => Promise<Uint8Array>
  similarity: (encoded: Uint8Array) => Promise<number>
}

export async function lowestAcceptableQuality(
  probe: QualityProbe,
  maxQuality: number,
  minQuality: number,
  minSimilarity: number
): Promise<{ quality: number; bytes: Uint8Array }> {
  let high = maxQuality
  let best = await probe.encode(high)
  let bestQuality = high
  let low = minQuality
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const encoded = await probe.encode(middle)
    const similarity = await probe.similarity(encoded)
    if (similarity >= minSimilarity) {
      best = encoded
      bestQuality = middle
      high = middle
    } else {
      low = middle + 1
    }
  }
  return { quality: bestQuality, bytes: best }
}
