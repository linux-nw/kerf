import { parentPort, workerData } from 'node:worker_threads'
import { CancelledError, EngineError, compressPdfBytes, type PdfCompressSettings } from './compress'

interface WorkerInput {
  bytes: Uint8Array
  settings: PdfCompressSettings
}

const port = parentPort
if (!port) throw new Error('Worker ohne Elternkanal gestartet')

const { bytes, settings } = workerData as WorkerInput

compressPdfBytes(bytes, settings, {
  onProgress: (fraction, step) => port.postMessage({ type: 'progress', fraction, step })
})
  .then((result) => {
    port.postMessage({ type: 'result', bytes: result.bytes, stats: result.stats }, [result.bytes.buffer as ArrayBuffer])
  })
  .catch((error: unknown) => {
    if (error instanceof CancelledError) {
      port.postMessage({ type: 'error', code: 'cancelled', message: 'cancelled' })
      return
    }
    if (error instanceof EngineError) {
      port.postMessage({ type: 'error', code: error.code, message: error.message })
      return
    }
    port.postMessage({ type: 'error', code: 'unknown', message: error instanceof Error ? error.message : String(error) })
  })
