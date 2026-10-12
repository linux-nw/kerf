import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { openPdf } from '../src/main/engines/pdf/open'
import { JobRunner } from '../src/main/jobs'
import { ocrTool } from '../src/main/tools/ocr'
import type { JobUpdate, OcrResult } from '../src/shared/types'
import { closedPortUrl, startFakeAi } from './helpers/fake-ai'

const fixtures = join(__dirname, 'fixtures')

async function run(path: string, options: Record<string, unknown>) {
  const updates: JobUpdate[] = []
  await new JobRunner({ ocr: ocrTool }, null, () => 1).start('ocr', [{ id: 'o', paths: [path] }], options, (u) => updates.push(u))
  return updates.at(-1) as JobUpdate
}

async function scanPdf(dir: string, pages: string[]): Promise<string> {
  const doc = await PDFDocument.create()
  for (const name of pages) {
    const jpeg = await sharp(join(fixtures, name)).jpeg({ quality: 90 }).toBuffer()
    const image = await doc.embedJpg(jpeg)
    const page = doc.addPage([595, 842])
    page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 })
  }
  const path = join(dir, 'scan.pdf')
  writeFileSync(path, await doc.save())
  return path
}

describe('Texterkennung als Werkzeug', () => {
  it('macht aus einem Bild ein durchsuchbares PDF, Text, Markdown und Word', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-ocr-'))
    const source = join(dir, 'brief.png')
    writeFileSync(source, readFileSync(join(fixtures, 'de.png')))
    const result = await run(source, { languages: ['deu', 'eng'], outputs: ['pdf', 'txt', 'md', 'docx'] })
    expect(result.status).toBe('done')
    expect(result.outputs.map((p) => p.slice(dir.length + 1))).toEqual(['brief.ocr.pdf', 'brief.ocr.txt', 'brief.ocr.md', 'brief.ocr.docx'])
    const data = result.data as OcrResult
    expect(data.pages).toHaveLength(1)
    expect(data.confidence).toBeGreaterThan(85)
    const txt = readFileSync(join(dir, 'brief.ocr.txt'), 'utf8')
    expect(txt).toContain('Süddeutschland')
    const md = readFileSync(join(dir, 'brief.ocr.md'), 'utf8')
    expect(md).toContain('# Jahresbericht 2025')
    expect(md).toContain('## Zusammenfassung')
    expect(md).toContain('- Äpfel kaufen')
    expect(readFileSync(join(dir, 'brief.ocr.docx')).subarray(0, 2).toString()).toBe('PK')
    const pdf = await openPdf(new Uint8Array(readFileSync(join(dir, 'brief.ocr.pdf'))))
    expect(await pdf.text(1)).toContain('Fußgängerzone')
    const hits = await pdf.find(['Süddeutschland'], 'i')
    expect(hits).toHaveLength(1)
    await pdf.close()
    expect(readFileSync(source).equals(readFileSync(join(fixtures, 'de.png')))).toBe(true)
  }, 180000)

  it('verarbeitet mehrseitige gescannte PDFs und lässt Seiten mit Text aus', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-ocr-'))
    const scanned = await scanPdf(dir, ['de.png', 'en.png'])
    const result = await run(scanned, { languages: ['deu', 'eng'], outputs: ['pdf', 'txt'] })
    expect(result.status).toBe('done')
    const data = result.data as OcrResult
    expect(data.pages.map((p) => p.source)).toEqual(['ocr', 'ocr'])
    const txt = readFileSync(join(dir, 'scan.ocr.txt'), 'utf8')
    expect(txt).toContain('Jahresbericht')
    expect(txt).toContain('Quarterly Review')
    const pdf = await openPdf(new Uint8Array(readFileSync(join(dir, 'scan.ocr.pdf'))))
    expect((await pdf.info()).pages).toBe(2)
    expect(await pdf.text(2)).toContain('response time')
    await pdf.close()

    const again = await run(join(dir, 'scan.ocr.pdf'), { outputs: ['pdf', 'txt'] })
    expect(again.status).toBe('done')
    expect((again.data as OcrResult).pages.map((p) => p.source)).toEqual(['textlayer', 'textlayer'])
    expect(again.detail).toMatch(/schon Text/)
    expect(readdirSync(dir).filter((n) => n.endsWith('.pdf')).sort()).toEqual(['scan.ocr.pdf', 'scan.pdf'])
  }, 240000)

  it('legt den Text bei Seiten mit Drehung an die richtige Stelle', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-ocr-'))
    const landscape = await sharp(join(fixtures, 'en.png')).extract({ left: 0, top: 0, width: 1654, height: 700 }).extend({ bottom: 954, right: 685, background: '#ffffff' }).rotate(-90).jpeg({ quality: 90 }).toBuffer()
    const doc = await PDFDocument.create()
    const image = await doc.embedJpg(landscape)
    const page = doc.addPage([595, 842])
    page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 })
    page.setRotation(degrees(90))
    const source = join(dir, 'quer.pdf')
    writeFileSync(source, await doc.save())
    const result = await run(source, { languages: ['eng'], outputs: ['pdf'] })
    expect(result.status).toBe('done')
    const pdf = await openPdf(new Uint8Array(readFileSync(join(dir, 'quer.ocr.pdf'))))
    const hits = await pdf.find(['Quarterly'], 'i')
    await pdf.close()
    expect(hits).toHaveLength(1)
    expect(hits[0]?.x).toBeLessThan(842 * 0.6)
    expect(hits[0]?.y).toBeLessThan(595 * 0.4)
  }, 180000)

  it('meldet Seiten ohne erkennbaren Text und ungeeignete Eingaben', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-ocr-'))
    const blank = join(dir, 'leer.png')
    writeFileSync(blank, await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#ffffff' } }).png().toBuffer())
    expect(await run(blank, {})).toMatchObject({ status: 'error', errorCode: 'unsupported' })
    expect(existsSync(join(dir, 'leer.ocr.txt'))).toBe(false)
    writeFileSync(join(dir, 'x.docx'), 'x')
    expect(await run(join(dir, 'x.docx'), {})).toMatchObject({ status: 'error', errorCode: 'unsupported' })
    expect(await run(blank, { outputs: [] })).toMatchObject({ status: 'error' })
    expect(await run(blank, { languages: ['abc'] })).toMatchObject({ status: 'error', errorCode: 'toolmissing' })
  }, 120000)

  describe('mit KI-Aufbereitung', () => {
    async function runWithAi(baseUrl: string, reply: ((content: string) => string) | null) {
      const dir = mkdtempSync(join(tmpdir(), 'kerf-ocr-ai-'))
      const source = join(dir, 'brief.png')
      writeFileSync(source, readFileSync(join(fixtures, 'de.png')))
      const ai = { provider: 'ollama' as const, baseUrl, apiKey: '', model: 'gemma4:e4b' }
      const result = await run(source, { languages: ['deu', 'eng'], outputs: ['txt', 'md'], useAi: true, ai })
      return { dir, result }
    }

    it('übernimmt die Korrektur des Modells und nennt es im Ergebnis', async () => {
      const server = await startFakeAi({ reply: (content) => content.replace('Jahresbericht', 'Jahresberichts') })
      try {
        const { dir, result } = await runWithAi(server.url, null)
        expect(result.status).toBe('done')
        const data = result.data as OcrResult
        expect(data.ai?.model).toBe('gemma4:e4b')
        expect(data.ai?.refined).toEqual([1])
        expect(readFileSync(join(dir, 'brief.ocr.md'), 'utf8')).toContain('# Jahresberichts 2025')
        expect(server.requests.some((request) => request.path === '/api/chat')).toBe(true)
      } finally {
        await server.close()
      }
    }, 180000)

    it('verwirft eine Neufassung und schreibt den Originaltext', async () => {
      const server = await startFakeAi({ reply: () => '# Etwas völlig anderes\n\nNichts davon stand im Dokument.' })
      try {
        const { dir, result } = await runWithAi(server.url, null)
        expect(result.status).toBe('done')
        const data = result.data as OcrResult
        expect(data.ai?.refined).toEqual([])
        expect(data.ai?.skipped).toEqual([1])
        expect(readFileSync(join(dir, 'brief.ocr.md'), 'utf8')).toContain('# Jahresbericht 2025')
        expect(readFileSync(join(dir, 'brief.ocr.txt'), 'utf8')).not.toContain('völlig anderes')
        expect(result.detail).toContain('verworfen')
      } finally {
        await server.close()
      }
    }, 180000)

    it('liefert den Text auch ohne erreichbare KI und sagt das offen', async () => {
      const { dir, result } = await runWithAi(await closedPortUrl(), null)
      expect(result.status).toBe('done')
      const data = result.data as OcrResult
      expect(data.ai?.failed).toContain('Keine Verbindung')
      expect(readFileSync(join(dir, 'brief.ocr.md'), 'utf8')).toContain('# Jahresbericht 2025')
      expect(result.detail).toContain('ohne KI')
    }, 180000)

    it('fragt keine KI an, solange sie nicht eingeschaltet ist', async () => {
      const server = await startFakeAi()
      try {
        const dir = mkdtempSync(join(tmpdir(), 'kerf-ocr-ai-'))
        const source = join(dir, 'brief.png')
        writeFileSync(source, readFileSync(join(fixtures, 'de.png')))
        const result = await run(source, { languages: ['deu'], outputs: ['txt'], useAi: false, ai: { provider: 'ollama', baseUrl: server.url, apiKey: '', model: 'gemma4:e4b' } })
        expect(result.status).toBe('done')
        expect((result.data as OcrResult).ai).toBeNull()
        expect(server.requests).toHaveLength(0)
      } finally {
        await server.close()
      }
    }, 180000)
  })
})
