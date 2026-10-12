import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { extensionOf } from '@shared/tools'
import type { CompressOptions } from '@shared/types'
import { CancelledError, EngineError } from '../errors'
import type { PdfCompressHooks, PdfCompressSettings, PdfCompressStats } from '../engines/pdf/compress'
import { compressImageBytes, IMAGE_LADDER, IMAGE_PRESETS } from '../engines/image/compress'
import { compressOfficeBytes } from '../engines/office/compress'
import { decideOutcome, nextOutputPath } from '../engines/pdf/output'
import { PRESETS, TARGET_LADDER, type Attempt } from '../engines/pdf/presets'
import { withDefaults, type ToolOutcome, type ToolRunner } from './types'

export type CompressFn = (
  input: Uint8Array,
  settings: PdfCompressSettings,
  hooks: PdfCompressHooks
) => Promise<{ bytes: Uint8Array; stats: PdfCompressStats }>

const defaults: CompressOptions = { preset: 'standard', targetBytes: null, stripMetadata: false, outputDir: null }

const OFFICE = new Set(['docx', 'pptx', 'xlsx'])
const IMAGES = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif'])

function attemptsFor(options: CompressOptions, ladder: Attempt[], presets: Record<'email' | 'standard' | 'print', Attempt>): Attempt[] {
  if (options.preset === 'target') return options.targetBytes ? ladder : [presets.standard]
  return [presets[options.preset]]
}

export function createCompressTool(compressPdf: CompressFn): ToolRunner {
  return async (job, rawOptions, ctx) => {
    const options = withDefaults(defaults, rawOptions)
    const path = job.paths[0]
    if (!path) throw new EngineError('missing', 'Keine Datei angegeben')
    const extension = extensionOf(path)

    let input: Buffer
    try {
      input = await readFile(path)
    } catch {
      throw new EngineError('missing', 'Die Datei wurde nicht gefunden')
    }

    const kind = extension === 'pdf' ? 'pdf' : OFFICE.has(extension) ? 'office' : IMAGES.has(extension) ? 'image' : null
    if (!kind) throw new EngineError('unsupported', `Dateityp .${extension} wird nicht unterstützt`)

    const ladder = kind === 'image' || kind === 'office' ? IMAGE_LADDER : TARGET_LADDER
    const presets = kind === 'image' || kind === 'office' ? IMAGE_PRESETS : PRESETS
    const attempts = attemptsFor(options, ladder, presets)
    const wantsTarget = options.preset === 'target' && options.targetBytes !== null
    let best: Uint8Array | null = null
    let reached = false

    for (const [index, attempt] of attempts.entries()) {
      if (ctx.signal.aborted) throw new CancelledError()
      const report = (fraction: number, step: string) => {
        const percent = ((index + fraction) / attempts.length) * 100
        ctx.progress(percent, attempts.length > 1 ? `${step} (Versuch ${index + 1} von ${attempts.length})` : step)
      }
      if (kind === 'pdf') {
        const result = await compressPdf(
          input,
          { dpi: attempt.dpi, quality: attempt.quality, stripMetadata: options.stripMetadata },
          { signal: ctx.signal, onProgress: report }
        )
        best = result.bytes
      } else if (kind === 'image') {
        best = await compressImageBytes(input, extension, attempt, options.stripMetadata)
        report(1, 'Bild wird gerechnet')
      } else {
        best = await compressOfficeBytes(input, attempt, report, ctx.signal)
      }
      if (wantsTarget && options.targetBytes !== null && best.length <= options.targetBytes) {
        reached = true
        break
      }
      if (!wantsTarget) break
    }

    if (!best) throw new EngineError('unknown', 'Kein Ergebnis erzeugt')

    const outcome = decideOutcome(input.length, best.length)
    if (outcome !== 'done') {
      return { status: outcome, outputs: [], outputSize: best.length }
    }

    try {
      const outputPath = nextOutputPath(path, options.outputDir, existsSync, 'klein', `.${extension === 'jpeg' ? 'jpeg' : extension}`)
      await mkdir(dirname(outputPath), { recursive: true })
      const partial = `${outputPath}.part`
      await writeFile(partial, best)
      await rename(partial, outputPath)
      const result: ToolOutcome = {
        status: 'done',
        outputs: [outputPath],
        outputSize: best.length,
        detail: wantsTarget && !reached ? 'Zielgröße nicht erreicht' : null,
        summary: 'Komprimiert'
      }
      return result
    } catch (error) {
      throw new EngineError('write', error instanceof Error ? error.message : String(error))
    }
  }
}
