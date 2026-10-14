export type CompressLevel = 'kompakt' | 'winzig'

export interface LevelProfile {
  pdfDpi: number
  pdfQuality: number
  perceptual: boolean
  minQuality: number
  minSimilarity: number
  detectGray: boolean
  detectBilevel: boolean
  subsetFonts: boolean
  effort: number
  officeMaxEdge: number
  imageMaxEdge: number
  imageQuality: number
}

export const LEVELS: Record<CompressLevel, LevelProfile> = {
  kompakt: {
    pdfDpi: 150,
    pdfQuality: 78,
    perceptual: false,
    minQuality: 78,
    minSimilarity: 1,
    detectGray: false,
    detectBilevel: true,
    subsetFonts: true,
    effort: 0,
    officeMaxEdge: 2400,
    imageMaxEdge: 4096,
    imageQuality: 80
  },
  winzig: {
    pdfDpi: 130,
    pdfQuality: 78,
    perceptual: true,
    minQuality: 30,
    minSimilarity: 0.94,
    detectGray: true,
    detectBilevel: true,
    subsetFonts: true,
    effort: 100,
    officeMaxEdge: 1800,
    imageMaxEdge: 3000,
    imageQuality: 78
  }
}
