import sharp, { type Sharp } from 'sharp'
import { EngineError } from '../../errors'
import { LEVELS, type CompressLevel, type LevelProfile } from '../pdf/profiles'
import { lowestAcceptableQuality, ssimLuma } from './perceptual'

type Encoder = (pipeline: Sharp, quality: number) => Sharp

const PALETTE_MIN_SIMILARITY = 0.97

export const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'gif'])

async function lumaOf(pipeline: Sharp): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await pipeline.removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

async function similarityTo(reference: { data: Buffer; width: number; height: number }, candidate: Uint8Array): Promise<number> {
  const decoded = await lumaOf(sharp(candidate, { failOn: 'none' }))
  if (decoded.width !== reference.width || decoded.height !== reference.height) return 0
  return ssimLuma(reference.data, decoded.data, decoded.width, decoded.height)
}

async function encodeLossy(base: Sharp, encoder: Encoder, maxQuality: number, profile: LevelProfile): Promise<Buffer> {
  const encode = (quality: number) => encoder(base.clone(), quality).toBuffer()
  if (!profile.perceptual) return encode(maxQuality)
  const reference = await lumaOf(base.clone())
  const result = await lowestAcceptableQuality(
    { encode, similarity: (bytes) => similarityTo(reference, bytes) },
    maxQuality,
    Math.min(profile.minQuality, maxQuality),
    profile.minSimilarity
  )
  return Buffer.from(result.bytes)
}

async function encodePng(base: Sharp, profile: LevelProfile): Promise<Buffer> {
  const lossless = await base.clone().png({ compressionLevel: 9, effort: 10, adaptiveFiltering: true }).toBuffer()
  if (!profile.perceptual) return lossless
  const palette = await base.clone().png({ palette: true, quality: 95, effort: 10, colours: 256, compressionLevel: 9 }).toBuffer()
  if (palette.length >= lossless.length) return lossless
  const reference = await lumaOf(base.clone())
  const similarity = await similarityTo(reference, palette)
  return similarity >= PALETTE_MIN_SIMILARITY ? palette : lossless
}

export async function compressImageBytes(
  input: Uint8Array,
  extension: string,
  level: CompressLevel,
  stripMetadata: boolean,
  maxEdge?: number
): Promise<Uint8Array> {
  const profile = LEVELS[level]
  try {
    const animated = extension === 'gif'
    let base = sharp(input, { failOn: 'none', animated }).rotate()
    if (!animated) base = base.resize({ width: maxEdge ?? profile.imageMaxEdge, height: maxEdge ?? profile.imageMaxEdge, fit: 'inside', withoutEnlargement: true })
    base = stripMetadata ? base : base.keepMetadata()

    let buffer: Buffer
    if (extension === 'jpg' || extension === 'jpeg') {
      buffer = await encodeLossy(base, (pipeline, quality) => pipeline.jpeg({ quality, mozjpeg: true }), profile.imageQuality, profile)
    } else if (extension === 'webp') {
      buffer = await encodeLossy(base, (pipeline, quality) => pipeline.webp({ quality, effort: 6 }), profile.imageQuality, profile)
    } else if (extension === 'avif') {
      buffer = await encodeLossy(
        base,
        (pipeline, quality) => pipeline.avif({ quality: Math.round(quality * 0.7), effort: 5 }),
        profile.imageQuality,
        profile
      )
    } else if (extension === 'png') {
      buffer = await encodePng(base, profile)
    } else if (extension === 'tif' || extension === 'tiff') {
      buffer = await base.tiff({ compression: 'deflate', predictor: 'horizontal' }).toBuffer()
    } else if (extension === 'gif') {
      buffer = await base.gif({ effort: 10 }).toBuffer()
    } else {
      throw new EngineError('unsupported', `Bildformat .${extension} wird nicht unterstützt`)
    }
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  } catch (error) {
    if (error instanceof EngineError) throw error
    throw new EngineError('unreadable', 'Das Bild konnte nicht gelesen werden')
  }
}
