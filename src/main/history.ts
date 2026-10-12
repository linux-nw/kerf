import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { HistoryEntry } from '@shared/types'

export type StoredEntry = Omit<HistoryEntry, 'exists'>

const MAX_ENTRIES = 500

export class HistoryStore {
  private entries: StoredEntry[] = []
  private loaded = false
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly file: string) {}

  private async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) this.entries = parsed.filter(isStored)
    } catch {
      this.entries = []
    }
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.entries)
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

  async list(): Promise<HistoryEntry[]> {
    await this.load()
    return this.entries.map((entry) => ({ ...entry, exists: existsSync(entry.outputPath) }))
  }

  async add(entry: StoredEntry): Promise<void> {
    await this.load()
    this.entries = [entry, ...this.entries.filter((item) => item.id !== entry.id)].slice(0, MAX_ENTRIES)
    await this.persist()
  }

  async remove(ids: string[]): Promise<void> {
    await this.load()
    const drop = new Set(ids)
    this.entries = this.entries.filter((entry) => !drop.has(entry.id))
    await this.persist()
  }

  async clear(): Promise<void> {
    await this.load()
    this.entries = []
    await this.persist()
  }
}

function isStored(value: unknown): value is StoredEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry['id'] === 'string' &&
    typeof entry['tool'] === 'string' &&
    typeof entry['time'] === 'number' &&
    typeof entry['inputName'] === 'string' &&
    typeof entry['outputPath'] === 'string' &&
    typeof entry['summary'] === 'string'
  )
}
