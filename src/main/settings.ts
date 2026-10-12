import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { OCR_LANGUAGES } from '@shared/tools'
import type { AiProvider, AiSettings, OcrOutput, Settings, SettingsPatch } from '@shared/types'

export interface SecretBox {
  encrypt(text: string): string
  decrypt(text: string): string
}

export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434'

export const DEFAULT_SETTINGS: Settings = {
  outputDir: null,
  historyEnabled: true,
  ocrLanguages: ['deu', 'eng'],
  ocrOutputs: ['pdf', 'txt'],
  ai: { enabled: false, provider: 'ollama', baseUrl: DEFAULT_OLLAMA_URL, apiKey: '', model: '' }
}

const OUTPUTS: OcrOutput[] = ['pdf', 'txt', 'md', 'docx']
const PROVIDERS: AiProvider[] = ['ollama', 'openai']

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function cleanAi(input: Record<string, unknown>, base: AiSettings): AiSettings {
  const provider = PROVIDERS.find((entry) => entry === input['provider']) ?? base.provider
  const baseUrl = typeof input['baseUrl'] === 'string' && input['baseUrl'].trim() !== '' ? input['baseUrl'].trim().slice(0, 300) : base.baseUrl
  return {
    enabled: typeof input['enabled'] === 'boolean' ? input['enabled'] : base.enabled,
    provider,
    baseUrl,
    apiKey: typeof input['apiKey'] === 'string' ? input['apiKey'].slice(0, 400) : base.apiKey,
    model: typeof input['model'] === 'string' ? input['model'].trim().slice(0, 200) : base.model
  }
}

export function mergeSettings(base: Settings, patch: unknown): Settings {
  const input = record(patch)
  const languageCodes = new Set(OCR_LANGUAGES.map((entry) => entry.code))
  const languages = Array.isArray(input['ocrLanguages']) ? (input['ocrLanguages'] as unknown[]).filter((code): code is string => typeof code === 'string' && languageCodes.has(code)) : null
  const outputs = Array.isArray(input['ocrOutputs']) ? OUTPUTS.filter((kind) => (input['ocrOutputs'] as unknown[]).includes(kind)) : null
  return {
    outputDir: input['outputDir'] === null ? null : typeof input['outputDir'] === 'string' && input['outputDir'] !== '' ? input['outputDir'] : base.outputDir,
    historyEnabled: typeof input['historyEnabled'] === 'boolean' ? input['historyEnabled'] : base.historyEnabled,
    ocrLanguages: languages && languages.length > 0 ? languages : base.ocrLanguages,
    ocrOutputs: outputs && outputs.length > 0 ? outputs : base.ocrOutputs,
    ai: cleanAi(record(input['ai']), base.ai)
  }
}

export class SettingsStore {
  private value: Settings = DEFAULT_SETTINGS
  private loaded = false
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly file: string,
    private readonly secrets: SecretBox | null
  ) {}

  private unseal(stored: unknown): string {
    if (typeof stored !== 'string' || stored === '') return ''
    if (stored.startsWith('plain:')) return stored.slice(6)
    if (stored.startsWith('enc:') && this.secrets) {
      try {
        return this.secrets.decrypt(stored.slice(4))
      } catch {
        return ''
      }
    }
    return ''
  }

  private seal(key: string): string {
    if (key === '') return ''
    if (this.secrets) {
      try {
        return `enc:${this.secrets.encrypt(key)}`
      } catch {
        return `plain:${key}`
      }
    }
    return `plain:${key}`
  }

  async load(): Promise<Settings> {
    if (this.loaded) return this.value
    this.loaded = true
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file, 'utf8'))
      const input = record(parsed)
      const ai = record(input['ai'])
      this.value = mergeSettings(DEFAULT_SETTINGS, { ...input, ai: { ...ai, apiKey: this.unseal(ai['apiKeyStored']) } })
    } catch {
      this.value = DEFAULT_SETTINGS
    }
    return this.value
  }

  current(): Settings {
    return this.value
  }

  async update(patch: SettingsPatch): Promise<Settings> {
    const base = await this.load()
    this.value = mergeSettings(base, patch)
    await this.persist()
    return this.value
  }

  private persist(): Promise<void> {
    const { apiKey, ...ai } = this.value.ai
    const snapshot = JSON.stringify({ ...this.value, ai: { ...ai, apiKeyStored: this.seal(apiKey) } }, null, 2)
    this.queue = this.queue
      .then(async () => {
        await mkdir(dirname(this.file), { recursive: true })
        const partial = `${this.file}.part`
        await writeFile(partial, snapshot, 'utf8')
        await rename(partial, this.file)
      })
      .catch(() => undefined)
    return this.queue
  }
}
