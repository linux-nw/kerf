import { afterEach, describe, expect, it } from 'vitest'
import { AiError, aiStatus, chat, pullModel, rootUrl, type AiConnection } from '../src/main/ai/client'
import { isAllowedAiHost } from '../src/main/ai/hosts'
import { markdownToBlocks } from '../src/main/ai/markdown'
import { isTrustworthy, refineBlocks } from '../src/main/ai/refine'
import type { AiPullUpdate, OcrBlock } from '../src/shared/types'
import { closedPortUrl, startFakeAi, type FakeAi } from './helpers/fake-ai'

const open: FakeAi[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((server) => server.close()))
})
async function fake(options?: Parameters<typeof startFakeAi>[0]): Promise<FakeAi> {
  const server = await startFakeAi(options)
  open.push(server)
  return server
}
const never = new AbortController().signal

describe('isAllowedAiHost', () => {
  it('erlaubt nur lokale und private Adressen', () => {
    for (const url of ['http://127.0.0.1:11434', 'http://localhost:11434', 'http://[::1]:1234', 'http://192.168.0.20:1234/v1', 'http://10.1.2.3', 'http://172.20.1.1', 'http://nas:11434', 'http://pc.local:11434', 'http://[fd12::1]:1']) {
      expect(isAllowedAiHost(url), url).toBe(true)
    }
    for (const url of ['https://api.openai.com/v1', 'http://8.8.8.8', 'http://172.32.0.1', 'http://example.com', 'ftp://localhost', 'kaputt', 'http://[2001:db8::1]']) {
      expect(isAllowedAiHost(url), url).toBe(false)
    }
  })
})

describe('rootUrl', () => {
  it('bereinigt Adressen je Anbieter', () => {
    const base = { apiKey: '' }
    expect(rootUrl({ ...base, provider: 'ollama', baseUrl: 'http://localhost:11434/' })).toBe('http://localhost:11434')
    expect(rootUrl({ ...base, provider: 'ollama', baseUrl: 'http://localhost:11434/api' })).toBe('http://localhost:11434')
    expect(rootUrl({ ...base, provider: 'openai', baseUrl: 'http://localhost:1234' })).toBe('http://localhost:1234/v1')
    expect(rootUrl({ ...base, provider: 'openai', baseUrl: 'http://localhost:1234/v1/' })).toBe('http://localhost:1234/v1')
  })
})

describe('aiStatus', () => {
  it('listet die lokalen Ollama-Modelle mit Größe', async () => {
    const server = await fake({ models: [{ name: 'gemma4:e4b', size: 9_600_000_000, parameter_size: '8B', quantization_level: 'Q4_K_M' }, { name: 'bloedsinn:1b', size: 1000 }] })
    const status = await aiStatus({ provider: 'ollama', baseUrl: server.url, apiKey: '' })
    expect(status.reachable).toBe(true)
    expect(status.version).toBe('0.21.0')
    expect(status.models.map((model) => model.id)).toEqual(['bloedsinn:1b', 'gemma4:e4b'])
    expect(status.models[1]).toMatchObject({ sizeBytes: 9_600_000_000, detail: '8B · Q4_K_M' })
  })

  it('liest Modelle von OpenAI-kompatiblen Servern und schickt den Schlüssel mit', async () => {
    const server = await fake({ openai: true, models: [{ name: 'qwen2.5', size: 0 }] })
    const status = await aiStatus({ provider: 'openai', baseUrl: server.url, apiKey: 'sk-lokal' })
    expect(status.reachable).toBe(true)
    expect(status.models.map((model) => model.id)).toEqual(['qwen2.5'])
    expect(server.requests[0]?.path).toBe('/v1/models')
    expect(server.requests[0]?.auth).toBe('Bearer sk-lokal')
  })

  it('meldet nicht erreichbare Server freundlich', async () => {
    const status = await aiStatus({ provider: 'ollama', baseUrl: await closedPortUrl(), apiKey: '' })
    expect(status.reachable).toBe(false)
    expect(status.hostAllowed).toBe(true)
    expect(status.error).toContain('Keine Verbindung')
  })

  it('lehnt Adressen im Internet ab, ohne sie anzufragen', async () => {
    const status = await aiStatus({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk' })
    expect(status.hostAllowed).toBe(false)
    expect(status.reachable).toBe(false)
  })
})

describe('chat', () => {
  it('spricht Ollama mit Temperatur 0 und ohne Streaming', async () => {
    const server = await fake({ reply: (content) => content.toUpperCase() })
    const answer = await chat({ provider: 'ollama', baseUrl: server.url, apiKey: '' }, 'gemma4:e4b', [{ role: 'user', content: 'hallo' }], never)
    expect(answer).toBe('HALLO')
    const body = server.requests[0]?.body as { model: string; stream: boolean; options: { temperature: number } }
    expect(body.model).toBe('gemma4:e4b')
    expect(body.stream).toBe(false)
    expect(body.options.temperature).toBe(0)
  })

  it('spricht OpenAI-kompatible Server', async () => {
    const server = await fake({ openai: true, reply: (content) => `${content}!` })
    expect(await chat({ provider: 'openai', baseUrl: server.url, apiKey: '' }, 'm', [{ role: 'user', content: 'eins' }], never)).toBe('eins!')
    expect(server.requests[0]?.path).toBe('/v1/chat/completions')
  })

  it('wirft bei Internetadressen und nicht erreichbaren Servern passende Fehler', async () => {
    await expect(chat({ provider: 'openai', baseUrl: 'https://example.com', apiKey: '' }, 'm', [], never)).rejects.toMatchObject({ code: 'host' })
    await expect(chat({ provider: 'ollama', baseUrl: await closedPortUrl(), apiKey: '' }, 'm', [], never)).rejects.toMatchObject({ code: 'unreachable' })
  })

  it('bricht auf Wunsch ab', async () => {
    const server = await fake()
    const controller = new AbortController()
    controller.abort()
    await expect(chat({ provider: 'ollama', baseUrl: server.url, apiKey: '' }, 'm', [], controller.signal)).rejects.toBeInstanceOf(AiError)
  })
})

describe('pullModel', () => {
  const lines = [
    JSON.stringify({ status: 'pulling manifest' }),
    JSON.stringify({ status: 'pulling abc', total: 100, completed: 40 }),
    JSON.stringify({ status: 'pulling abc', total: 100, completed: 100 }),
    JSON.stringify({ status: 'success' })
  ]

  it('meldet Fortschritt und Ende', async () => {
    const server = await fake({ pullLines: lines })
    const updates: AiPullUpdate[] = []
    await pullModel({ provider: 'ollama', baseUrl: server.url, apiKey: '' }, 'gemma4:e2b', (update) => updates.push(update), never)
    expect(updates.map((update) => update.completed)).toContain(40)
    expect(updates.at(-1)).toMatchObject({ model: 'gemma4:e2b', done: true, error: null, status: 'success' })
    expect((server.requests[0]?.body as { model: string }).model).toBe('gemma4:e2b')
  })

  it('meldet Fehler aus dem Datenstrom', async () => {
    const server = await fake({ pullLines: [JSON.stringify({ error: 'Modell gibt es nicht' })] })
    const updates: AiPullUpdate[] = []
    await pullModel({ provider: 'ollama', baseUrl: server.url, apiKey: '' }, 'x', (update) => updates.push(update), never)
    expect(updates.at(-1)).toMatchObject({ done: true, error: 'Modell gibt es nicht' })
  })

  it('meldet einen unterbrochenen Download', async () => {
    const server = await fake({ pullLines: [JSON.stringify({ status: 'pulling abc', total: 10, completed: 1 })] })
    const updates: AiPullUpdate[] = []
    await pullModel({ provider: 'ollama', baseUrl: server.url, apiKey: '' }, 'x', (update) => updates.push(update), never)
    expect(updates.at(-1)?.error).toContain('unterbrochen')
  })

  it('meldet einen nicht erreichbaren Server', async () => {
    const updates: AiPullUpdate[] = []
    await pullModel({ provider: 'ollama', baseUrl: await closedPortUrl(), apiKey: '' }, 'x', (update) => updates.push(update), never)
    expect(updates.at(-1)).toMatchObject({ done: true })
    expect(updates.at(-1)?.error).toContain('Keine Verbindung')
  })
})

describe('markdownToBlocks', () => {
  it('liest Überschriften, Listen und Absätze und entfernt Auszeichnungen', () => {
    const blocks = markdownToBlocks('```markdown\n# Titel\n\nEin **fetter** Satz\nüber zwei Zeilen.\n\n- eins\n- zwei\n\n1. a\n2. b\n\n### Klein\n```')
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Titel' },
      { kind: 'paragraph', text: 'Ein fetter Satz über zwei Zeilen.' },
      { kind: 'list', ordered: false, items: ['eins', 'zwei'] },
      { kind: 'list', ordered: true, items: ['a', 'b'] },
      { kind: 'heading', level: 3, text: 'Klein' }
    ])
  })

  it('ignoriert Kommentare und leere Eingaben', () => {
    expect(markdownToBlocks('<!-- Seite 1 -->\n\n')).toEqual([])
    expect(markdownToBlocks('')).toEqual([])
  })
})

describe('isTrustworthy', () => {
  const original = 'Der Umsatz stieg im Jahr 2025 um 12,5 Prozent auf 4.200 Euro und die Kosten blieben stabil.'
  it('nimmt kleine Korrekturen an', () => {
    expect(isTrustworthy(original, original.replace('Umsatz', 'Umsatz').replace('stabil', 'stabil.'))).toBe(true)
    expect(isTrustworthy('Der Urnsatz stieg um 12,5 Prozent im Jahr 2025 deutlich an', 'Der Umsatz stieg um 12,5 Prozent im Jahr 2025 deutlich an')).toBe(true)
  })
  it('lehnt Umformulierungen, Kürzungen und geänderte Zahlen ab', () => {
    expect(isTrustworthy(original, 'Kurz gesagt lief alles gut.')).toBe(false)
    expect(isTrustworthy(original, '')).toBe(false)
    expect(isTrustworthy(original, original.replace('2025', '2052').replace('12,5', '15,2').replace('4.200', '4.002'))).toBe(false)
    expect(isTrustworthy(original, `${original} ${original}`)).toBe(false)
    expect(isTrustworthy(original, 'Die Umsätze sind im vergangenen Jahr um mehr als ein Zehntel gewachsen, die Ausgaben blieben gleich.')).toBe(false)
  })
})

describe('refineBlocks', () => {
  const blocks: OcrBlock[] = [
    { kind: 'heading', level: 1, text: 'Jahresbericht 2025' },
    { kind: 'paragraph', text: 'Der Urnsatz stieg im Jahr 2025 um 12,5 Prozent und die Kosten blieben stabil und niedrig.' },
    { kind: 'list', ordered: false, items: ['Äpfel kaufen', 'Birnen kaufen'] }
  ]
  const connection = (url: string): AiConnection => ({ provider: 'ollama', baseUrl: url, apiKey: '' })

  it('übernimmt eine saubere Korrektur', async () => {
    const server = await fake({ reply: (content) => content.replace('Urnsatz', 'Umsatz') })
    const outcome = await refineBlocks(blocks, ['deu'], connection(server.url), 'm', never)
    expect(outcome.accepted).toBe(1)
    expect(outcome.rejected).toBe(0)
    expect(outcome.blocks[1]).toEqual({ kind: 'paragraph', text: 'Der Umsatz stieg im Jahr 2025 um 12,5 Prozent und die Kosten blieben stabil und niedrig.' })
    expect(outcome.blocks[0]).toEqual(blocks[0])
    expect(outcome.blocks[2]).toEqual(blocks[2])
  })

  it('verwirft eine freie Neufassung und behält das Original', async () => {
    const server = await fake({ reply: () => '# Bericht\n\nAlles wurde besser.' })
    const outcome = await refineBlocks(blocks, ['deu'], connection(server.url), 'm', never)
    expect(outcome.accepted).toBe(0)
    expect(outcome.rejected).toBe(1)
    expect(outcome.blocks).toEqual(blocks)
  })

  it('schickt die Anweisung mit Sprache und Rolle', async () => {
    const server = await fake()
    await refineBlocks(blocks, ['deu', 'eng'], connection(server.url), 'm', never)
    const messages = (server.requests[0]?.body as { messages: Array<{ role: string; content: string }> }).messages
    expect(messages[0]?.role).toBe('system')
    expect(messages[0]?.content).toContain('Never translate')
    expect(messages[0]?.content).toMatch(/Deutsch|German|deu/)
    expect(messages[1]?.content).toContain('# Jahresbericht 2025')
  })

  it('teilt lange Seiten in mehrere Anfragen', async () => {
    const server = await fake()
    const long: OcrBlock[] = Array.from({ length: 12 }, (_, index) => ({ kind: 'paragraph', text: `Absatz ${index} ${'wort '.repeat(80)}`.trim() }))
    await refineBlocks(long, ['deu'], connection(server.url), 'm', never)
    expect(server.requests.length).toBeGreaterThan(1)
  })
})
