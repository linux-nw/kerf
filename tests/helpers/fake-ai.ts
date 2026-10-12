import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface FakeAi {
  url: string
  requests: Array<{ method: string; path: string; body: unknown; auth: string | undefined }>
  close(): Promise<void>
}

export interface FakeAiOptions {
  models?: Array<{ name: string; size: number; parameter_size?: string; quantization_level?: string }>
  reply?: (content: string) => string
  pullLines?: string[]
  openai?: boolean
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(text === '' ? null : JSON.parse(text))
      } catch {
        resolve(null)
      }
    })
  })
}

function json(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(value))
}

export async function startFakeAi(options: FakeAiOptions = {}): Promise<FakeAi> {
  const requests: FakeAi['requests'] = []
  const models = options.models ?? []
  const reply = options.reply ?? ((content: string) => content)
  const server: Server = createServer((request, response) => {
    void readBody(request).then((body) => {
      const path = request.url ?? ''
      requests.push({ method: request.method ?? '', path, body, auth: request.headers.authorization })
      if (options.openai) {
        if (path === '/v1/models') return json(response, { data: models.map((model) => ({ id: model.name })) })
        if (path === '/v1/chat/completions') {
          const messages = (body as { messages: Array<{ content: string }> }).messages
          const last = messages[messages.length - 1]?.content ?? ''
          return json(response, { choices: [{ message: { content: reply(last) } }] })
        }
        return json(response, { error: { message: 'nicht gefunden' } }, 404)
      }
      if (path === '/api/version') return json(response, { version: '0.21.0' })
      if (path === '/api/tags') {
        return json(response, {
          models: models.map((model) => ({ name: model.name, model: model.name, size: model.size, details: { parameter_size: model.parameter_size, quantization_level: model.quantization_level } }))
        })
      }
      if (path === '/api/chat') {
        const messages = (body as { messages: Array<{ content: string }> }).messages
        const last = messages[messages.length - 1]?.content ?? ''
        return json(response, { message: { role: 'assistant', content: reply(last) } })
      }
      if (path === '/api/pull') {
        response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
        for (const line of options.pullLines ?? []) response.write(`${line}\n`)
        response.end()
        return
      }
      json(response, { error: 'nicht gefunden' }, 404)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  }
}

export async function closedPortUrl(): Promise<string> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return `http://127.0.0.1:${port}`
}
