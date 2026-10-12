import { unzipSync, zipSync, type Zippable } from 'fflate'
import sharp from 'sharp'
import { CancelledError, EngineError } from '../../errors'
import type { Attempt } from '../pdf/presets'

const MEDIA = /^(word|ppt|xl)\/media\/[^/]+\.(jpe?g|png)$/i

export async function compressOfficeBytes(
  input: Uint8Array,
  attempt: Attempt,
  report: (fraction: number, step: string) => void,
  signal: AbortSignal
): Promise<Uint8Array> {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(input)
  } catch {
    throw new EngineError('unreadable', 'Die Datei ist beschädigt oder kein gültiges Office-Dokument')
  }
  const names = Object.keys(files)
  const media = names.filter((name) => MEDIA.test(name))
  const result: Zippable = {}
  let done = 0
  for (const name of names) {
    if (signal.aborted) throw new CancelledError()
    const data = files[name]
    if (!data) continue
    if (MEDIA.test(name)) {
      const lower = name.toLowerCase()
      let replaced: Uint8Array = data
      try {
        let pipeline = sharp(data, { failOn: 'none' }).rotate().resize({ width: attempt.dpi, height: attempt.dpi, fit: 'inside', withoutEnlargement: true })
        pipeline = lower.endsWith('.png')
          ? pipeline.png({ palette: attempt.quality < 80, quality: attempt.quality, compressionLevel: 9, effort: 7 })
          : pipeline.jpeg({ quality: attempt.quality, mozjpeg: true })
        const out = await pipeline.toBuffer()
        if (out.length < data.length) replaced = new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
      } catch {
        replaced = data
      }
      result[name] = [replaced, { level: 0 }]
      done += 1
      report(done / Math.max(1, media.length), 'Bilder im Dokument werden gerechnet')
    } else {
      result[name] = [data, { level: name.endsWith('.xml') || name.endsWith('.rels') ? 9 : 6 }]
    }
  }
  return zipSync(result)
}
