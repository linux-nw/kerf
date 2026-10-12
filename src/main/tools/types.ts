import type { JobErrorCode, JobStatus, StartJob } from '@shared/types'

export interface ToolContext {
  signal: AbortSignal
  progress: (percent: number, step?: string | null) => void
}

export interface ToolOutcome {
  status?: Extract<JobStatus, 'done' | 'nogain' | 'larger'>
  outputs: string[]
  outputSize?: number | null
  detail?: string | null
  data?: unknown
  summary?: string
  history?: boolean
}

export type ToolRunner = (job: StartJob, options: unknown, ctx: ToolContext) => Promise<ToolOutcome>

export type { JobErrorCode }

export function withDefaults<T extends object>(defaults: T, options: unknown): T {
  if (typeof options !== 'object' || options === null) return defaults
  const result = { ...defaults } as Record<string, unknown>
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) result[key] = value
  }
  return result as T
}
