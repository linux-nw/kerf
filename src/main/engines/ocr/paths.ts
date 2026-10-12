import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { unpackedPath } from '../nodePaths'

export function tessdataDir(): string {
  const fromEnv = process.env['KERF_TESSDATA']
  if (fromEnv) return fromEnv
  const candidates: string[] = []
  let current = typeof __dirname === 'string' ? __dirname : process.cwd()
  for (let depth = 0; depth < 6; depth += 1) {
    candidates.push(join(current, 'resources', 'tessdata'))
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  candidates.push(join(process.cwd(), 'resources', 'tessdata'))
  const found = candidates.map(unpackedPath).find((candidate) => existsSync(candidate))
  return found ?? candidates[0] ?? join(process.cwd(), 'resources', 'tessdata')
}
