import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CompressOptions, JobErrorCode, JobStatus, JobUpdate, StartJob } from '@shared/types'
import {
  CancelledError,
  EngineError,
  type PdfCompressHooks,
  type PdfCompressSettings,
  type PdfCompressStats
} from './engines/pdf/compress'
import { decideOutcome, nextOutputPath } from './engines/pdf/output'
import { PRESETS, TARGET_LADDER, type Attempt } from './engines/pdf/presets'

export type CompressFn = (
  input: Uint8Array,
  settings: PdfCompressSettings,
  hooks: PdfCompressHooks
) => Promise<{ bytes: Uint8Array; stats: PdfCompressStats }>

export type Emit = (update: JobUpdate) => void

function update(id: string, status: JobStatus, percent: number, extra: Partial<JobUpdate> = {}): JobUpdate {
  return {
    id,
    status,
    percent,
    step: null,
    outputPath: null,
    outputSize: null,
    errorCode: null,
    detail: null,
    ...extra
  }
}

function attemptsFor(options: CompressOptions): Attempt[] {
  if (options.preset === 'target') return options.targetBytes ? TARGET_LADDER : [PRESETS.standard]
  return [PRESETS[options.preset]]
}

export async function processJob(
  job: StartJob,
  options: CompressOptions,
  compress: CompressFn,
  signal: AbortSignal,
  emit: Emit
): Promise<void> {
  emit(update(job.id, 'running', 0, { step: 'Datei wird gelesen' }))

  let input: Buffer
  try {
    input = await readFile(job.path)
  } catch {
    emit(update(job.id, 'error', 0, { errorCode: 'missing', detail: 'Die Datei wurde nicht gefunden' }))
    return
  }

  const attempts = attemptsFor(options)
  const wantsTarget = options.preset === 'target' && options.targetBytes !== null
  let best: Uint8Array | null = null
  let reachedTarget = false

  try {
    for (const [index, attempt] of attempts.entries()) {
      if (signal.aborted) throw new CancelledError()
      const result = await compress(
        input,
        { dpi: attempt.dpi, quality: attempt.quality, stripMetadata: options.stripMetadata },
        {
          signal,
          onProgress: (fraction, step) => {
            const percent = Math.min(99, Math.round(((index + fraction) / attempts.length) * 100))
            const label = attempts.length > 1 ? `${step} (Versuch ${index + 1} von ${attempts.length})` : step
            emit(update(job.id, 'running', percent, { step: label }))
          }
        }
      )
      best = result.bytes
      if (wantsTarget && options.targetBytes !== null && best.length <= options.targetBytes) {
        reachedTarget = true
        break
      }
      if (!wantsTarget) break
    }
  } catch (error) {
    if (error instanceof CancelledError) {
      emit(update(job.id, 'cancelled', 0))
      return
    }
    const code: JobErrorCode = error instanceof EngineError ? error.code : 'unknown'
    emit(update(job.id, 'error', 0, { errorCode: code, detail: error instanceof Error ? error.message : String(error) }))
    return
  }

  if (!best) {
    emit(update(job.id, 'error', 0, { errorCode: 'unknown', detail: 'Kein Ergebnis erzeugt' }))
    return
  }

  const outcome = decideOutcome(input.length, best.length)
  if (outcome !== 'done') {
    emit(update(job.id, outcome, 100, { outputSize: best.length }))
    return
  }

  try {
    const outputPath = nextOutputPath(job.path, options.outputDir, existsSync)
    await mkdir(dirname(outputPath), { recursive: true })
    const partial = `${outputPath}.part`
    await writeFile(partial, best)
    await rename(partial, outputPath)
    const missedTarget = wantsTarget && !reachedTarget
    emit(
      update(job.id, 'done', 100, {
        outputPath,
        outputSize: best.length,
        detail: missedTarget ? 'Zielgröße nicht erreicht' : null
      })
    )
  } catch (error) {
    emit(update(job.id, 'error', 0, { errorCode: 'write', detail: error instanceof Error ? error.message : String(error) }))
  }
}

export class JobRunner {
  private readonly controllers = new Map<string, AbortController>()

  constructor(
    private readonly compress: CompressFn,
    private readonly concurrency: number
  ) {}

  async start(jobs: StartJob[], options: CompressOptions, emit: Emit): Promise<void> {
    for (const job of jobs) {
      this.controllers.set(job.id, new AbortController())
      emit(update(job.id, 'waiting', 0))
    }
    const queue = [...jobs]
    const workers = Array.from({ length: Math.max(1, Math.min(this.concurrency, jobs.length)) }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const controller = this.controllers.get(job.id)
        if (!controller || controller.signal.aborted) {
          emit(update(job.id, 'cancelled', 0))
        } else {
          await processJob(job, options, this.compress, controller.signal, emit)
        }
        this.controllers.delete(job.id)
      }
    })
    await Promise.all(workers)
  }

  cancel(id: string): void {
    this.controllers.get(id)?.abort()
  }

  cancelAll(): void {
    for (const controller of this.controllers.values()) controller.abort()
  }
}
