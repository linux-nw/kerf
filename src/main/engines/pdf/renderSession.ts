import { Worker } from 'node:worker_threads'
import type { JobErrorCode, PdfInfo } from '@shared/types'
import { EngineError } from '../../errors'
import workerPath from './renderWorker?modulePath'
import type { FoundBox, PdfDocLike, RenderOptions, RenderedPage } from './renderCore'

interface Reply {
  id: number
  ok: boolean
  result?: unknown
  code?: JobErrorCode
  message?: string
}

export async function openPdfInWorker(bytes: Uint8Array): Promise<PdfDocLike> {
  const worker = new Worker(workerPath, { workerData: { bytes: new Uint8Array(bytes) } })
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  let counter = 0
  let dead: Error | null = null

  worker.on('message', (reply: Reply) => {
    const entry = pending.get(reply.id)
    if (!entry) return
    pending.delete(reply.id)
    if (reply.ok) entry.resolve(reply.result)
    else entry.reject(new EngineError(reply.code ?? 'unknown', reply.message ?? 'Unbekannter Fehler'))
  })
  worker.on('error', (error: Error) => {
    dead = new EngineError('unknown', error.message)
    for (const entry of pending.values()) entry.reject(dead)
    pending.clear()
  })
  worker.on('exit', () => {
    dead ??= new EngineError('unknown', 'Der PDF-Prozess wurde beendet')
    for (const entry of pending.values()) entry.reject(dead)
    pending.clear()
  })

  const call = <T>(message: Record<string, unknown>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      if (dead) {
        reject(dead)
        return
      }
      counter += 1
      const id = counter
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      worker.postMessage({ id, ...message })
    })

  const session: PdfDocLike = {
    info: () => call<PdfInfo>({ op: 'info' }),
    render: (page: number, options: RenderOptions) => call<RenderedPage>({ op: 'render', page, options }),
    text: (page: number) => call<string>({ op: 'text', page }),
    find: (patterns: string[], flags: string) => call<FoundBox[]>({ op: 'find', patterns, flags }),
    close: async () => {
      try {
        await call<null>({ op: 'close' })
      } catch {
        dead ??= new Error('closed')
      }
      await worker.terminate()
    }
  }
  try {
    await session.info()
  } catch (error) {
    await worker.terminate()
    throw error
  }
  return session
}
