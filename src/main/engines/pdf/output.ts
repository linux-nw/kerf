import { basename, dirname, extname, join } from 'node:path'

export function nextOutputPath(inputPath: string, outputDir: string | null, exists: (path: string) => boolean): string {
  const directory = outputDir ?? dirname(inputPath)
  const base = basename(inputPath, extname(inputPath))
  let candidate = join(directory, `${base}.klein.pdf`)
  let counter = 2
  while (candidate === inputPath || exists(candidate)) {
    candidate = join(directory, `${base}.klein-${counter}.pdf`)
    counter += 1
  }
  return candidate
}

export type Outcome = 'done' | 'nogain' | 'larger'

export function decideOutcome(originalSize: number, resultSize: number): Outcome {
  if (resultSize > originalSize * 1.01) return 'larger'
  if (resultSize >= originalSize * 0.99) return 'nogain'
  return 'done'
}
