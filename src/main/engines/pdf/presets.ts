export interface Attempt {
  dpi: number
  quality: number
}

export const PRESETS: Record<'email' | 'standard' | 'print', Attempt> = {
  email: { dpi: 96, quality: 55 },
  standard: { dpi: 150, quality: 70 },
  print: { dpi: 300, quality: 85 }
}

export const TARGET_LADDER: Attempt[] = [
  { dpi: 300, quality: 85 },
  { dpi: 200, quality: 78 },
  { dpi: 150, quality: 70 },
  { dpi: 120, quality: 62 },
  { dpi: 96, quality: 55 },
  { dpi: 72, quality: 45 },
  { dpi: 60, quality: 38 }
]
