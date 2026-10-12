import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { CancelledError, EngineError } from '../../errors'

export function ffmpegArgs(input: string, output: string, target: string): string[] {
  const base = ['-hide_banner', '-nostdin', '-y', '-i', input]
  const progress = ['-progress', 'pipe:1', '-nostats']
  switch (target) {
    case 'mp3':
      return [...base, '-vn', '-map_metadata', '0', '-c:a', 'libmp3lame', '-q:a', '2', ...progress, output]
    case 'wav':
      return [...base, '-vn', '-c:a', 'pcm_s16le', ...progress, output]
    case 'flac':
      return [...base, '-vn', '-c:a', 'flac', ...progress, output]
    case 'ogg':
      return [...base, '-vn', '-c:a', 'libvorbis', '-q:a', '5', ...progress, output]
    case 'm4a':
      return [...base, '-vn', '-c:a', 'aac', '-b:a', '192k', ...progress, output]
    case 'mp4':
      return [...base, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', ...progress, output]
    case 'mkv':
      return [...base, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', ...progress, output]
    case 'webm':
      return [...base, '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '128k', ...progress, output]
    case 'gif':
      return [...base, '-an', '-vf', 'fps=12,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', '-loop', '0', ...progress, output]
    default:
      throw new EngineError('unsupported', `Zielformat .${target} wird für Audio und Video nicht unterstützt`)
  }
}

export function parseDuration(text: string): number | null {
  const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) return null
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

export function convertMedia(
  binary: string,
  input: string,
  output: string,
  target: string,
  onProgress: (fraction: number) => void,
  signal: AbortSignal
): Promise<void> {
  const args = ffmpegArgs(input, output, target)
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let duration: number | null = null
    let errors = ''
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      errors = (errors + text).slice(-4000)
      duration ??= parseDuration(errors)
    })
    child.stdout.on('data', (chunk: Buffer) => {
      const matches = [...chunk.toString('utf8').matchAll(/out_time_(?:us|ms)=(\d+)/g)]
      const last = matches.at(-1)
      if (last?.[1] && duration) onProgress(Math.min(0.99, Number(last[1]) / 1_000_000 / duration))
    })
    const onAbort = () => {
      child.kill()
      void rm(output, { force: true })
      reject(new CancelledError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    child.on('error', () => reject(new EngineError('toolmissing', 'FFmpeg konnte nicht gestartet werden')))
    child.on('close', async (code) => {
      signal.removeEventListener('abort', onAbort)
      if (code === 0 && existsSync(output)) {
        resolve()
        return
      }
      await rm(output, { force: true })
      if (/Invalid data found|moov atom not found|could not find codec/i.test(errors)) reject(new EngineError('unreadable', 'Die Datei konnte nicht gelesen werden'))
      else if (/does not contain any stream|Output file does not contain/i.test(errors)) reject(new EngineError('unsupported', 'In der Datei gibt es keine passende Spur'))
      else reject(new EngineError('unknown', 'FFmpeg meldet einen Fehler bei der Umwandlung'))
    })
  })
}
