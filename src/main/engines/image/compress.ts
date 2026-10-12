import sharp from 'sharp'
import { EngineError } from '../../errors'
import type { Attempt } from '../pdf/presets'

export interface ImageAttempt {
  dpi: number
  quality: number
}

export const IMAGE_PRESETS: Record<'email' | 'standard' | 'print', Attempt> = {
  email: { dpi: 1600, quality: 55 },
  standard: { dpi: 2400, quality: 72 },
  print: { dpi: 4000, quality: 86 }
}

export const IMAGE_LADDER: Attempt[] = [
  { dpi: 4000, quality: 86 },
  { dpi: 3200, quality: 80 },
  { dpi: 2400, quality: 72 },
  { dpi: 1800, quality: 65 },
  { dpi: 1400, quality: 58 },
  { dpi: 1000, quality: 50 },
  { dpi: 700, quality: 42 }
]

export async function compressImageBytes(input: Uint8Array, extension: string, attempt: Attempt, stripMetadata: boolean): Promise<Uint8Array> {
  const maxEdge = attempt.dpi
  const quality = attempt.quality
  try {
    let pipeline = sharp(input, { failOn: 'none', animated: false }).rotate()
    pipeline = pipeline.resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    if (!stripMetadata) pipeline = pipeline.keepMetadata()
    if (extension === 'jpg' || extension === 'jpeg') pipeline = pipeline.jpeg({ quality, mozjpeg: true })
    else if (extension === 'png') pipeline = pipeline.png({ palette: quality < 80, quality, compressionLevel: 9, effort: 7 })
    else if (extension === 'webp') pipeline = pipeline.webp({ quality, effort: 5 })
    else if (extension === 'avif') pipeline = pipeline.avif({ quality: Math.round(quality * 0.7), effort: 4 })
    else throw new EngineError('unsupported', `Bildformat .${extension} wird nicht unterstützt`)
    const buffer = await pipeline.toBuffer()
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  } catch (error) {
    if (error instanceof EngineError) throw error
    throw new EngineError('unreadable', 'Das Bild konnte nicht gelesen werden')
  }
}
