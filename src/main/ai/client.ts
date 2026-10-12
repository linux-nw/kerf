import type { AiModel, AiProvider, AiPullUpdate, AiStatus } from '@shared/types'
import { isAllowedAiHost } from './hosts'

export type AiErrorCode = 'host' | 'unreachable' | 'status' | 'timeout' | 'invalid' | 'cancelled'

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string
  ) {
    super(message)
  }
}

export interface AiConnection {
  provider: AiProvider
  baseUrl: string
  apiKey: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function rootUrl(connection: AiConnection): string {
  const raw = connection.baseUrl.trim().replace(/\/+$/, '')
  if (connection.provider === 'ollama') return raw.replace(/\/(api|v1)$/, '')
  return /^https?:\/\/[^/]+$/.test(raw) ? `${raw}/v1` : raw
}

function headers(connection: AiConnection, json: boolean): Record<string, string> {
  const result: Record<string, string> = {}
  if (json) result['Content-Type'] = 'application/json'
  if (connection.apiKey) result['Authorization'] = `Bearer ${connection.apiKey}`
  return result
}

async function call(connection: AiConnection, path: string, init: { method?: string; body?: unknown }, signal: AbortSignal | undefined, timeoutMs: number): Promise<Response> {
  const base = rootUrl(connection)
  if (!isAllowedAiHost(base)) throw new AiError('host', 'Kerf spricht nur mit Programmen auf diesem Rechner oder im eigenen Netzwerk')
  if (signal?.aborted) throw new AiError('cancelled', 'Abgebrochen')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new AiError('timeout', 'Das Modell hat zu lange gebraucht')), timeoutMs)
  const onAbort = () => controller.abort(new AiError('cancelled', 'Abgebrochen'))
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const response = await fetch(`${base}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: headers(connection, init.body !== undefined),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal
    })
    if (!response.ok) {
      let detail = ''
      try {
        const parsed: unknown = JSON.parse(await response.text())
        const message = (parsed as { error?: unknown }).error
        detail = typeof message === 'string' ? message : typeof (message as { message?: unknown } | undefined)?.message === 'string' ? String((message as { message: string }).message) : ''
      } catch {
        detail = ''
      }
      throw new AiError('status', detail !== '' ? detail : `Antwort ${response.status}`)
    }
    return response
  } catch (error) {
    if (error instanceof AiError) throw error
    const reason = controller.signal.reason
    if (reason instanceof AiError) throw reason
    throw new AiError('unreachable', 'Keine Verbindung. Läuft das Programm und stimmt die Adresse?')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function modelSize(value: unknown): number | null {
  return typeof value === 'number' && value > 0 ? value : null
}

export async function aiStatus(connection: AiConnection): Promise<AiStatus> {
  const empty: AiStatus = { reachable: false, hostAllowed: true, version: null, error: null, models: [] }
  if (!isAllowedAiHost(rootUrl(connection))) return { ...empty, hostAllowed: false, error: 'Nur Adressen auf diesem Rechner oder im eigenen Netzwerk sind erlaubt' }
  try {
    if (connection.provider === 'ollama') {
      let version: string | null = null
      try {
        const info = (await (await call(connection, '/api/version', {}, undefined, 4000)).json()) as { version?: unknown }
        version = typeof info.version === 'string' ? info.version : null
      } catch (error) {
        if (error instanceof AiError && error.code !== 'status') throw error
      }
      const tags = (await (await call(connection, '/api/tags', {}, undefined, 8000)).json()) as { models?: unknown }
      const list = Array.isArray(tags.models) ? tags.models : []
      const models: AiModel[] = list.flatMap((entry): AiModel[] => {
        const item = entry as { name?: unknown; model?: unknown; size?: unknown; details?: { parameter_size?: unknown; quantization_level?: unknown } }
        const id = typeof item.name === 'string' ? item.name : typeof item.model === 'string' ? item.model : null
        if (!id) return []
        const parts = [item.details?.parameter_size, item.details?.quantization_level].filter((part): part is string => typeof part === 'string' && part !== '')
        return [{ id, label: id, sizeBytes: modelSize(item.size), detail: parts.length ? parts.join(' · ') : null }]
      })
      return { ...empty, reachable: true, version, models: models.sort((a, b) => a.id.localeCompare(b.id)) }
    }
    const data = (await (await call(connection, '/models', {}, undefined, 8000)).json()) as { data?: unknown }
    const list = Array.isArray(data.data) ? data.data : []
    const models: AiModel[] = list.flatMap((entry): AiModel[] => {
      const id = (entry as { id?: unknown }).id
      return typeof id === 'string' ? [{ id, label: id, sizeBytes: null, detail: null }] : []
    })
    return { ...empty, reachable: true, models: models.sort((a, b) => a.id.localeCompare(b.id)) }
  } catch (error) {
    if (error instanceof AiError) return { ...empty, hostAllowed: error.code !== 'host', error: error.message }
    return { ...empty, error: 'Unbekannter Fehler' }
  }
}

export async function chat(connection: AiConnection, model: string, messages: ChatMessage[], signal: AbortSignal | undefined, timeoutMs = 300000): Promise<string> {
  if (connection.provider === 'ollama') {
    const response = await call(connection, '/api/chat', { body: { model, messages, stream: false, options: { temperature: 0, num_ctx: 8192 } } }, signal, timeoutMs)
    const data = (await response.json()) as { message?: { content?: unknown } }
    const content = data.message?.content
    if (typeof content !== 'string') throw new AiError('invalid', 'Das Modell hat keine Antwort geliefert')
    return content
  }
  const response = await call(connection, '/chat/completions', { body: { model, messages, temperature: 0, stream: false } }, signal, timeoutMs)
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new AiError('invalid', 'Das Modell hat keine Antwort geliefert')
  return content
}

export async function pullModel(connection: AiConnection, model: string, onUpdate: (update: AiPullUpdate) => void, signal: AbortSignal): Promise<void> {
  const emit = (partial: Partial<AiPullUpdate>) => onUpdate({ model, status: '', completed: null, total: null, done: false, error: null, ...partial })
  try {
    const response = await call(connection, '/api/pull', { body: { model, stream: true } }, signal, 6 * 60 * 60 * 1000)
    const reader = response.body?.getReader()
    if (!reader) throw new AiError('invalid', 'Keine Antwort vom Download')
    const decoder = new TextDecoder()
    let buffer = ''
    let finished = false
    const handle = (line: string) => {
      if (line.trim() === '') return
      const data = JSON.parse(line) as { status?: unknown; completed?: unknown; total?: unknown; error?: unknown }
      if (typeof data.error === 'string') throw new AiError('status', data.error)
      const status = typeof data.status === 'string' ? data.status : ''
      if (status === 'success') finished = true
      emit({ status, completed: typeof data.completed === 'number' ? data.completed : null, total: typeof data.total === 'number' ? data.total : null })
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) handle(line)
    }
    if (buffer.trim() !== '') handle(buffer)
    if (!finished) throw new AiError('invalid', 'Der Download wurde unterbrochen')
    emit({ status: 'success', done: true })
  } catch (error) {
    if (signal.aborted) {
      emit({ status: 'abgebrochen', done: true, error: 'Abgebrochen' })
      return
    }
    emit({ status: 'Fehler', done: true, error: error instanceof Error ? error.message : 'Unbekannter Fehler' })
  }
}
