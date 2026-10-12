import sharp from 'sharp'
import { EngineError } from '../../errors'

export interface PreparedImage {
  data: Buffer
  width: number
  height: number
}

export type Variant = 'base' | 'alt'

const MIN_WIDTH = 2000
const MAX_WIDTH = 4800

export async function prepareImage(input: Buffer, variant: Variant = 'base'): Promise<PreparedImage> {
  try {
    const upright = sharp(input, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' })
    const meta = await upright.clone().metadata()
    const width = meta.width ?? 0
    const height = meta.height ?? 0
    if (!width || !height) throw new EngineError('unreadable', 'Das Bild konnte nicht gelesen werden')

    const grey = upright.clone().greyscale()
    const stats = await grey.clone().stats()
    const mean = stats.channels[0]?.mean ?? 200
    const dark = mean < 110

    let scale = 1
    if (width < MIN_WIDTH) scale = Math.min(3, MIN_WIDTH / width)
    else if (width > MAX_WIDTH) scale = MAX_WIDTH / width
    if (variant === 'alt') scale = Math.min(3.5, scale * 1.4)

    let pipeline = grey
    if (dark) pipeline = pipeline.negate()
    if (scale !== 1) pipeline = pipeline.resize({ width: Math.round(width * scale), kernel: scale > 1 ? 'lanczos3' : 'lanczos2' })
    pipeline = pipeline.normalise({ lower: 2, upper: 98 })
    if (variant === 'base') pipeline = pipeline.sharpen({ sigma: 0.7 })
    else pipeline = pipeline.median(3).threshold(165)
    const { data, info } = await pipeline.png({ compressionLevel: 1 }).withMetadata({ density: 300 }).toBuffer({ resolveWithObject: true })
    return { data, width: info.width, height: info.height }
  } catch (error) {
    if (error instanceof EngineError) throw error
    throw new EngineError('unreadable', 'Das Bild konnte nicht gelesen werden')
  }
}
