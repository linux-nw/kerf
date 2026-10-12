import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { openPdf } from '../src/main/engines/pdf/open'
import { JobRunner } from '../src/main/jobs'
import { parseRanges, pdfTool } from '../src/main/tools/pdf'
import type { JobUpdate } from '../src/shared/types'

async function makePdf(path: string, labels: string[]) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const label of labels) doc.addPage([300, 400]).drawText(label, { x: 40, y: 300, size: 18, font })
  writeFileSync(path, await doc.save())
}

async function run(paths: string[], options: Record<string, unknown>) {
  const updates: JobUpdate[] = []
  await new JobRunner({ pdf: pdfTool }, null, () => 2).start('pdf', [{ id: 'p', paths }], options, (u) => updates.push(u))
  return updates.at(-1) as JobUpdate
}

async function pageCount(path: string) {
  return (await PDFDocument.load(readFileSync(path))).getPageCount()
}

function fresh() {
  return mkdtempSync(join(tmpdir(), 'kerf-pdf-'))
}

describe('Seitenbereiche', () => {
  it('liest Bereiche, offene Enden und einzelne Seiten', () => {
    expect(parseRanges('1-3, 5, 7-', 9)).toEqual([[1, 3], [5, 5], [7, 9]])
    expect(parseRanges('-2', 5)).toEqual([[1, 2]])
  })

  it('lehnt Unsinn ab', () => {
    expect(() => parseRanges('', 5)).toThrow(/Seitenbereiche/)
    expect(() => parseRanges('abc', 5)).toThrow(/gültiger/)
    expect(() => parseRanges('4-9', 5)).toThrow(/außerhalb/)
    expect(() => parseRanges('3-1', 5)).toThrow(/außerhalb/)
    expect(() => parseRanges('0', 5)).toThrow(/außerhalb/)
  })
})

describe('PDF-Werkzeuge', () => {
  it('fügt PDFs und Bilder zusammen und lässt die Originale unberührt', async () => {
    const d = fresh()
    await makePdf(join(d, 'a.pdf'), ['A1', 'A2'])
    await makePdf(join(d, 'b.pdf'), ['B1'])
    writeFileSync(join(d, 'c.png'), await sharp({ create: { width: 400, height: 300, channels: 3, background: '#2a6' } }).png().toBuffer())
    const before = readFileSync(join(d, 'a.pdf'))
    const result = await run([join(d, 'a.pdf'), join(d, 'c.png'), join(d, 'b.pdf')], { mode: 'merge' })
    expect(result.status).toBe('done')
    expect(result.outputPath).toBe(join(d, 'a.zusammen.pdf'))
    const merged = await openPdf(new Uint8Array(readFileSync(result.outputPath ?? '')))
    expect((await merged.info()).pages).toBe(4)
    expect(await merged.text(1)).toContain('A1')
    expect(await merged.text(4)).toContain('B1')
    await merged.close()
    expect(readFileSync(join(d, 'a.pdf')).equals(before)).toBe(true)
  })

  it('verlangt zum Zusammenfügen mindestens zwei Dateien', async () => {
    const d = fresh()
    await makePdf(join(d, 'a.pdf'), ['A1'])
    expect(await run([join(d, 'a.pdf')], { mode: 'merge' })).toMatchObject({ status: 'error', errorCode: 'unsupported' })
  })

  it('teilt nach Bereichen und in Einzelseiten in einen eigenen Ordner', async () => {
    const d = fresh()
    await makePdf(join(d, 'buch.pdf'), ['1', '2', '3', '4', '5'])
    const parts = await run([join(d, 'buch.pdf')], { mode: 'split', splitRanges: '1-2, 5' })
    expect(parts.status).toBe('done')
    expect(parts.outputPath).toBe(join(d, 'buch_Teile'))
    expect(readdirSync(parts.outputPath ?? '')).toEqual(['buch.teil-1-seiten-1-2.pdf', 'buch.teil-2-seiten-5.pdf'])
    expect(await pageCount(join(parts.outputPath ?? '', 'buch.teil-1-seiten-1-2.pdf'))).toBe(2)
    const every = await run([join(d, 'buch.pdf')], { mode: 'split', splitEvery: true })
    expect(every.outputPath).toBe(join(d, 'buch_Teile-2'))
    expect(readdirSync(every.outputPath ?? '')).toHaveLength(5)
    expect(await run([join(d, 'buch.pdf')], { mode: 'split', splitRanges: '1-5' })).toMatchObject({ status: 'error', errorCode: 'unsupported' })
  })

  it('ordnet Seiten neu, dreht sie und löscht welche', async () => {
    const d = fresh()
    await makePdf(join(d, 'x.pdf'), ['eins', 'zwei', 'drei'])
    const result = await run([join(d, 'x.pdf')], { mode: 'pages', pages: [{ source: 3, rotation: 0 }, { source: 1, rotation: 90 }] })
    expect(result.status).toBe('done')
    expect(result.outputPath).toBe(join(d, 'x.bearbeitet.pdf'))
    const doc = await PDFDocument.load(readFileSync(result.outputPath ?? ''))
    expect(doc.getPageCount()).toBe(2)
    expect(doc.getPage(1).getRotation().angle).toBe(90)
    const text = await openPdf(new Uint8Array(readFileSync(result.outputPath ?? '')))
    expect(await text.text(1)).toContain('drei')
    expect(await text.text(2)).toContain('eins')
    await text.close()
    expect(await run([join(d, 'x.pdf')], { mode: 'pages', pages: [{ source: 9, rotation: 0 }] })).toMatchObject({ status: 'error' })
    expect(await run([join(d, 'x.pdf')], { mode: 'pages', pages: [] })).toMatchObject({ status: 'error' })
  })

  it('fügt Wasserzeichen und Seitenzahlen ein', async () => {
    const d = fresh()
    await makePdf(join(d, 'v.pdf'), ['Vertrag', 'Anhang', 'Ende'])
    const marked = await run([join(d, 'v.pdf')], { mode: 'watermark', watermarkText: 'VERTRAULICH' })
    expect(marked.status).toBe('done')
    const m = await openPdf(new Uint8Array(readFileSync(marked.outputPath ?? '')))
    expect(await m.text(2)).toContain('VERTRAULICH')
    await m.close()
    const numbered = await run([join(d, 'v.pdf')], { mode: 'numbers', numberFormat: 'Seite {n} von {total}', numberPosition: 'bottom-right', numberStart: 1 })
    expect(numbered.outputPath).toBe(join(d, 'v.nummeriert.pdf'))
    const n = await openPdf(new Uint8Array(readFileSync(numbered.outputPath ?? '')))
    expect(await n.text(2)).toContain('Seite 2 von 3')
    expect(await n.text(3)).toContain('Seite 3 von 3')
    await n.close()
    expect(await run([join(d, 'v.pdf')], { mode: 'watermark', watermarkText: 'Привет' })).toMatchObject({ status: 'error', errorCode: 'unsupported' })
    expect(await run([join(d, 'v.pdf')], { mode: 'watermark', watermarkText: '  ' })).toMatchObject({ status: 'error' })
  })

  it('meldet kaputte und geschützte Dateien', async () => {
    const d = fresh()
    writeFileSync(join(d, 'kaputt.pdf'), 'nein')
    expect(await run([join(d, 'kaputt.pdf')], { mode: 'numbers' })).toMatchObject({ status: 'error', errorCode: 'unreadable' })
    writeFileSync(join(d, 'a.txt'), 'x')
    expect(await run([join(d, 'a.txt')], { mode: 'numbers' })).toMatchObject({ status: 'error', errorCode: 'unsupported' })
  })
})
