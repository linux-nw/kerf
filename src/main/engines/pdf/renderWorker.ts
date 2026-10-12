import { parentPort, workerData } from 'node:worker_threads'
import { EngineError } from '../../errors'
import { PdfRenderer, type RenderOptions } from './renderCore'

interface Request {
  id: number
  op: 'info' | 'render' | 'text' | 'find' | 'close'
  page?: number
  options?: RenderOptions
  patterns?: string[]
  flags?: string
}

const port = parentPort
if (!port) throw new Error('Worker ohne Elternkanal gestartet')

const opened = PdfRenderer.open((workerData as { bytes: Uint8Array }).bytes)
opened.catch(() => undefined)

function fail(id: number, error: unknown): void {
  if (error instanceof EngineError) port?.postMessage({ id, ok: false, code: error.code, message: error.message })
  else port?.postMessage({ id, ok: false, code: 'unknown', message: error instanceof Error ? error.message : String(error) })
}

port.on('message', (request: Request) => {
  void (async () => {
    try {
      const renderer = await opened
      if (request.op === 'info') {
        port.postMessage({ id: request.id, ok: true, result: await renderer.info() })
      } else if (request.op === 'render') {
        const page = await renderer.render(request.page ?? 1, request.options ?? {})
        port.postMessage({ id: request.id, ok: true, result: page }, [page.data.buffer as ArrayBuffer])
      } else if (request.op === 'text') {
        port.postMessage({ id: request.id, ok: true, result: await renderer.text(request.page ?? 1) })
      } else if (request.op === 'find') {
        port.postMessage({ id: request.id, ok: true, result: await renderer.find(request.patterns ?? [], request.flags ?? 'gi') })
      } else {
        await renderer.close()
        port.postMessage({ id: request.id, ok: true, result: null })
      }
    } catch (error) {
      fail(request.id, error)
    }
  })()
})
