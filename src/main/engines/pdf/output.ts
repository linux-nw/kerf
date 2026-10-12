import { basename, dirname, extname, join } from 'node:path'

export function uniquePath(directory: string, base: string, extension: string, exists: (path: string) => boolean, avoid: string | null = null): string {
  let candidate = join(directory, `${base}${extension}`)
  let counter = 2
  while (candidate === avoid || exists(candidate)) {
    candidate = join(directory, `${base}-${counter}${extension}`)
    counter += 1
  }
  return candidate
}

export function nextOutputPath(
  inputPath: string,
  outputDir: string | null,
  exists: (path: string) => boolean,
  suffix = 'klein',
  extension: string | null = null
): string {
  const directory = outputDir ?? dirname(inputPath)
  const base = basename(inputPath, extname(inputPath))
  const ext = extension ?? (extname(inputPath).toLowerCase() || '.pdf')
  let candidate = join(directory, `${base}.${suffix}${ext}`)
  let counter = 2
  while (candidate === inputPath || exists(candidate)) {
    candidate = join(directory, `${base}.${suffix}-${counter}${ext}`)
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
