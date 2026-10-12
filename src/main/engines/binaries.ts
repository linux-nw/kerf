import { chmodSync, existsSync } from 'node:fs'
import { sep } from 'node:path'

function unpacked(path: string): string {
  const packed = `app.asar${sep}`
  if (path.includes(packed)) {
    const candidate = path.replace(packed, `app.asar.unpacked${sep}`)
    if (existsSync(candidate)) return candidate
  }
  return path
}

let sevenZipPath: string | null | undefined
let ffmpegPath: string | null | undefined

export async function sevenZipBinary(): Promise<string | null> {
  if (sevenZipPath !== undefined) return sevenZipPath
  try {
    const module = (await import('7zip-bin')) as { path7za?: string; default?: { path7za?: string } }
    const raw = module.path7za ?? module.default?.path7za
    const path = raw ? unpacked(raw) : null
    sevenZipPath = path && existsSync(path) ? path : null
    if (sevenZipPath && process.platform !== 'win32') {
      try {
        chmodSync(sevenZipPath, 0o755)
      } catch {
        return sevenZipPath
      }
    }
  } catch {
    sevenZipPath = null
  }
  return sevenZipPath
}

export async function ffmpegBinary(): Promise<string | null> {
  if (ffmpegPath !== undefined) return ffmpegPath
  const fromEnv = process.env['KERF_FFMPEG']
  if (fromEnv && existsSync(fromEnv)) {
    ffmpegPath = fromEnv
    return ffmpegPath
  }
  try {
    const module = (await import('ffmpeg-static')) as unknown as { default?: string | null }
    const raw = module.default ?? null
    const path = raw ? unpacked(raw) : null
    ffmpegPath = path && existsSync(path) ? path : null
  } catch {
    ffmpegPath = null
  }
  return ffmpegPath
}
