import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { HashAlgorithm, HashOptions } from '@shared/types'
import { CancelledError, EngineError } from '../errors'
import { withDefaults, type ToolRunner } from './types'

export interface HashResult {
  name: string
  size: number
  hashes: Record<string, string>
}

const defaults: HashOptions = { algorithms: ['sha256'] }
const ALLOWED: HashAlgorithm[] = ['md5', 'sha1', 'sha256', 'sha512']

export async function hashFile(
  path: string,
  algorithms: HashAlgorithm[],
  onProgress: (fraction: number) => void,
  signal: AbortSignal
): Promise<HashResult> {
  let size: number
  try {
    const info = await stat(path)
    if (!info.isFile()) throw new EngineError('unsupported', 'Ordner können nicht geprüft werden')
    size = info.size
  } catch (error) {
    if (error instanceof EngineError) throw error
    throw new EngineError('missing', 'Die Datei wurde nicht gefunden')
  }
  const hashers = algorithms.map((algorithm) => [algorithm, createHash(algorithm)] as const)
  let read = 0
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path, { highWaterMark: 1 << 20 })
    const onAbort = () => {
      stream.destroy()
      reject(new CancelledError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    stream.on('data', (chunk) => {
      for (const [, hasher] of hashers) hasher.update(chunk)
      read += chunk.length
      onProgress(size === 0 ? 1 : read / size)
    })
    stream.on('error', () => reject(new EngineError('unreadable', 'Die Datei konnte nicht gelesen werden')))
    stream.on('end', () => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    })
  })
  const hashes: Record<string, string> = {}
  for (const [algorithm, hasher] of hashers) hashes[algorithm] = hasher.digest('hex')
  return { name: basename(path), size, hashes }
}

export const hashTool: ToolRunner = async (job, rawOptions, ctx) => {
  const options = withDefaults(defaults, rawOptions)
  const algorithms = options.algorithms.filter((algorithm) => ALLOWED.includes(algorithm))
  if (algorithms.length === 0) throw new EngineError('unsupported', 'Kein Verfahren gewählt')
  const path = job.paths[0]
  if (!path) throw new EngineError('missing', 'Keine Datei angegeben')
  const result = await hashFile(path, algorithms, (fraction) => ctx.progress(fraction * 100, 'Prüfsumme wird berechnet'), ctx.signal)
  return { outputs: [], data: result, history: false }
}
