import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { ToolId } from '@shared/tools'
import type { JobErrorCode, JobStatus, JobUpdate, StartJob } from '@shared/types'
import { CancelledError, EngineError } from './errors'
import type { HistoryStore } from './history'
import type { ToolOutcome, ToolRunner } from './tools/types'

export type Emit = (update: JobUpdate) => void

export function makeUpdate(id: string, status: JobStatus, percent: number, extra: Partial<JobUpdate> = {}): JobUpdate {
  return {
    id,
    status,
    percent,
    step: null,
    outputPath: null,
    outputSize: null,
    outputs: [],
    errorCode: null,
    detail: null,
    data: null,
    ...extra
  }
}

async function sizeOf(path: string): Promise<number | null> {
  try {
    const info = await stat(path)
    return info.isFile() ? info.size : null
  } catch {
    return null
  }
}

async function totalSize(paths: string[]): Promise<number | null> {
  let total = 0
  for (const path of paths) {
    const size = await sizeOf(path)
    if (size === null) return null
    total += size
  }
  return total
}

function describeInput(paths: string[]): string {
  const first = basename(paths[0] ?? '')
  return paths.length > 1 ? `${first} und ${paths.length - 1} weitere` : first
}

export async function runJob(
  tool: ToolId,
  job: StartJob,
  options: unknown,
  runner: ToolRunner,
  history: HistoryStore | null,
  signal: AbortSignal,
  emit: Emit
): Promise<void> {
  emit(makeUpdate(job.id, 'running', 0))
  let lastPercent = 0
  const progress = (percent: number, step: string | null = null) => {
    lastPercent = Math.max(lastPercent, Math.min(99, Math.round(percent)))
    emit(makeUpdate(job.id, 'running', lastPercent, { step }))
  }

  let outcome: ToolOutcome
  try {
    if (signal.aborted) throw new CancelledError()
    outcome = await runner(job, options, { signal, progress })
  } catch (error) {
    if (error instanceof CancelledError || signal.aborted) {
      emit(makeUpdate(job.id, 'cancelled', 0))
      return
    }
    const code: JobErrorCode = error instanceof EngineError ? error.code : 'unknown'
    emit(makeUpdate(job.id, 'error', 0, { errorCode: code, detail: error instanceof Error ? error.message : String(error) }))
    return
  }

  const status = outcome.status ?? 'done'
  const first = outcome.outputs[0] ?? null
  const outputSize = outcome.outputSize !== undefined ? outcome.outputSize : first ? await sizeOf(first) : null

  if (status === 'done' && first && outcome.history !== false && history) {
    await history.add({
      id: job.id,
      tool,
      time: Date.now(),
      inputName: describeInput(job.paths),
      inputSize: await totalSize(job.paths),
      outputPath: first,
      outputSize,
      summary: outcome.summary ?? ''
    })
  }

  emit(
    makeUpdate(job.id, status, 100, {
      outputPath: first,
      outputs: outcome.outputs,
      outputSize,
      detail: outcome.detail ?? null,
      data: outcome.data ?? null
    })
  )
}

export class JobRunner {
  private readonly controllers = new Map<string, AbortController>()

  constructor(
    private readonly runners: Partial<Record<ToolId, ToolRunner>>,
    private readonly history: HistoryStore | null,
    private readonly concurrency: (tool: ToolId) => number
  ) {}

  async start(tool: ToolId, jobs: StartJob[], options: unknown, emit: Emit): Promise<void> {
    const runner = this.runners[tool]
    for (const job of jobs) {
      this.controllers.set(job.id, new AbortController())
      emit(makeUpdate(job.id, 'waiting', 0))
    }
    if (!runner) {
      for (const job of jobs) {
        emit(makeUpdate(job.id, 'error', 0, { errorCode: 'unsupported', detail: 'Dieses Werkzeug ist nicht verfügbar' }))
        this.controllers.delete(job.id)
      }
      return
    }
    const queue = [...jobs]
    const count = Math.max(1, Math.min(this.concurrency(tool), jobs.length))
    const workers = Array.from({ length: count }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const controller = this.controllers.get(job.id)
        if (!controller || controller.signal.aborted) {
          emit(makeUpdate(job.id, 'cancelled', 0))
        } else {
          await runJob(tool, job, options, runner, this.history, controller.signal, emit)
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
