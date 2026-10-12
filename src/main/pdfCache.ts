import { readFile } from 'node:fs/promises'
import { EngineError } from './errors'
import { openPdf } from './engines/pdf/open'
import type { PdfDocLike } from './engines/pdf/renderCore'

interface Entry {
  doc: Promise<PdfDocLike>
  used: number
}

const MAX = 3

export class PdfCache {
  private readonly entries = new Map<string, Entry>()

  async get(path: string): Promise<PdfDocLike> {
    const existing = this.entries.get(path)
    if (existing) {
      existing.used = Date.now()
      return existing.doc
    }
    const doc = readFile(path).then(
      (bytes) => openPdf(new Uint8Array(bytes)),
      () => {
        throw new EngineError('missing', 'Die Datei wurde nicht gefunden')
      }
    )
    this.entries.set(path, { doc, used: Date.now() })
    doc.catch(() => this.entries.delete(path))
    await this.evict()
    return doc
  }

  private async evict(): Promise<void> {
    while (this.entries.size > MAX) {
      const oldest = [...this.entries.entries()].sort((a, b) => a[1].used - b[1].used)[0]
      if (!oldest) return
      this.entries.delete(oldest[0])
      void oldest[1].doc.then((doc) => doc.close()).catch(() => undefined)
    }
  }

  async closeAll(): Promise<void> {
    const all = [...this.entries.values()]
    this.entries.clear()
    await Promise.all(all.map((entry) => entry.doc.then((doc) => doc.close()).catch(() => undefined)))
  }
}
