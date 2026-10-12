import { Worker } from 'node:worker_threads'
import type { JobErrorCode } from '@shared/types'
import workerPath from './worker?modulePath'
import { CancelledError, EngineError, type PdfCompressHooks, type PdfCompressSettings, type PdfCompressStats } from './compress'

type WorkerMessage =
  | { type: 'progress'; fraction: number; step: string }
  | { type: 'result'; bytes: Uint8Array; stats: PdfCompressStats }
  | { type: 'error'; code: JobErrorCode | 'cancelled'; message: string }

export function compressInWorker(
  input: Uint8Array,
  settings: PdfCompressSettings,
  hooks: PdfCompressHooks = {}
): Promise<{ bytes: Uint8Array; stats: PdfCompressStats }> {
  return new Promise((resolve, reject) => {
    if (hooks.signal?.aborted) {
      reject(new CancelledError())
      return
    }
    const copy = new Uint8Array(input)
    const worker = new Worker(workerPath, { workerData: { bytes: copy, settings } })
    let finished = false

    const finish = (action: () => void) => {
      if (finished) return
      finished = true
      hooks.signal?.removeEventListener('abort', onAbort)
      action()
    }

    const onAbort = () => {
      void worker.terminate()
      finish(() => reject(new CancelledError()))
    }
    hooks.signal?.addEventListener('abort', onAbort, { once: true })

    worker.on('message', (message: WorkerMessage) => {
      if (message.type === 'progress') {
        hooks.onProgress?.(message.fraction, message.step)
        return
      }
      if (message.type === 'result') {
        finish(() => resolve({ bytes: message.bytes, stats: message.stats }))
        void worker.terminate()
        return
      }
      void worker.terminate()
      finish(() => {
        if (message.code === 'cancelled') reject(new CancelledError())
        else reject(new EngineError(message.code, message.message))
      })
    })
    worker.on('error', (error: Error) => finish(() => reject(new EngineError('unknown', error.message))))
    worker.on('exit', (code) => {
      if (code !== 0) finish(() => reject(new EngineError('unknown', `Worker beendet mit Code ${code}`)))
    })
  })
}
