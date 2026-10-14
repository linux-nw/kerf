import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { extensionOf } from '@shared/tools'
import type { CompressOptions } from '@shared/types'
import { CancelledError, EngineError } from '../errors'
import type { PdfCompressHooks, PdfCompressSettings, PdfCompressStats } from '../engines/pdf/compress'
import { compressImageBytes, IMAGE_EXTENSIONS } from '../engines/image/compress'
import { compressSvgBytes } from '../engines/image/svg'
import { compressZipDocumentBytes, ZIP_DOCUMENT_EXTENSIONS } from '../engines/office/compress'
import { decideOutcome, nextOutputPath } from '../engines/pdf/output'
import type { CompressLevel } from '../engines/pdf/profiles'
import { withDefaults, type ToolOutcome, type ToolRunner } from './types'

export type CompressFn = (
  input: Uint8Array,
  settings: PdfCompressSettings,
  hooks: PdfCompressHooks
) => Promise<{ bytes: Uint8Array; stats: PdfCompressStats }>

const defaults: CompressOptions = { preset: 'kompakt', stripMetadata: false, outputDir: null }

type Kind = 'pdf' | 'zipdoc' | 'image' | 'svg'

function kindOf(extension: string): Kind | null {
  if (extension === 'pdf') return 'pdf'
  if (extension === 'svg') return 'svg'
  if (ZIP_DOCUMENT_EXTENSIONS.has(extension)) return 'zipdoc'
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  return null
}

export function createCompressTool(compressPdf: CompressFn): ToolRunner {
  return async (job, rawOptions, ctx) => {
    const options = withDefaults(defaults, rawOptions)
    const level: CompressLevel = options.preset === 'winzig' ? 'winzig' : 'kompakt'
    const path = job.paths[0]
    if (!path) throw new EngineError('missing', 'Keine Datei angegeben')
    const extension = extensionOf(path)

    let input: Buffer
    try {
      input = await readFile(path)
    } catch {
      throw new EngineError('missing', 'Die Datei wurde nicht gefunden')
    }

    const kind = kindOf(extension)
    if (!kind) throw new EngineError('unsupported', `Dateityp .${extension} wird nicht unterstützt`)
    if (ctx.signal.aborted) throw new CancelledError()

    const report = (fraction: number, step: string) => ctx.progress(fraction * 100, step)
    let best: Uint8Array
    if (kind === 'pdf') {
      const result = await compressPdf(input, { level, stripMetadata: options.stripMetadata }, { signal: ctx.signal, onProgress: report })
      best = result.bytes
    } else if (kind === 'image') {
      best = await compressImageBytes(input, extension, level, options.stripMetadata)
      report(1, 'Bild wird gerechnet')
    } else if (kind === 'svg') {
      best = compressSvgBytes(input, level)
      report(1, 'SVG wird gekürzt')
    } else {
      best = await compressZipDocumentBytes(input, level, report, ctx.signal)
    }

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
        detail: null,
        summary: 'Komprimiert'
      }
      return result
    } catch (error) {
      throw new EngineError('write', error instanceof Error ? error.message : String(error))
    }
  }
}
