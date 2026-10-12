import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { openPdf } from '../src/main/engines/pdf/open'
import { JobRunner } from '../src/main/jobs'
import { redactTool } from '../src/main/tools/redact'
import type { JobUpdate } from '../src/shared/types'

async function run(path: string, options: Record<string, unknown>) {
  const updates: JobUpdate[] = []
  await new JobRunner({ redact: redactTool }, null, () => 1).start('redact', [{ id: 'r', paths: [path] }], options, (u) => updates.push(u))
  return updates.at(-1) as JobUpdate
}

async function letter(dir: string) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const first = doc.addPage([595, 842])
  first.drawText('Rechnung an Max Mustermann', { x: 50, y: 760, size: 16, font })
  first.drawText('Mail: max.mustermann@example.de', { x: 50, y: 730, size: 12, font })
  first.drawText('IBAN DE89 3704 0044 0532 0130 00', { x: 50, y: 700, size: 12, font })
  doc.addPage([595, 842]).drawText('Zweite Seite ohne Geheimnisse', { x: 50, y: 760, size: 14, font })
  doc.setTitle('Geheimer Titel Mustermann')
  doc.setAuthor('Max Mustermann')
  const path = join(dir, 'brief.pdf')
  writeFileSync(path, await doc.save())
  return path
}

describe('Schwärzen', () => {
  it('schwärzt gefundene Stellen wirklich und prüft das Ergebnis', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-red-'))
    const path = await letter(dir)
    const source = await openPdf(new Uint8Array(readFileSync(path)))
    const hits = await source.find(['Mustermann', 'DE89 3704 0044 0532 0130 00'], 'gi')
    await source.close()
    expect(hits.length).toBeGreaterThanOrEqual(3)
    const boxes = hits.map(({ page, x, y, width, height }) => ({ page, x, y, width, height }))
    const result = await run(path, { boxes, checkTerms: ['Mustermann', '0532'] })
    expect(result.status).toBe('done')
    expect(result.outputPath).toBe(join(dir, 'brief.geschwaerzt.pdf'))
    const out = await openPdf(new Uint8Array(readFileSync(result.outputPath ?? '')))
    expect((await out.info()).pages).toBe(2)
    expect(await out.text(1)).toBe('')
    expect(await out.text(2)).toContain('Zweite Seite ohne Geheimnisse')
    expect(await out.find(['Mustermann', '0532', 'Rechnung'], 'gi')).toHaveLength(0)
    await out.close()
    const meta = await PDFDocument.load(readFileSync(result.outputPath ?? ''))
    expect(meta.getTitle() ?? '').not.toContain('Mustermann')
    expect(meta.getAuthor() ?? '').not.toContain('Mustermann')
    const rendered = await (await openPdf(new Uint8Array(readFileSync(result.outputPath ?? '')))).render(1, { dpi: 72, format: 'png' })
    const { data, info } = await sharp(Buffer.from(rendered.data)).greyscale().raw().toBuffer({ resolveWithObject: true })
    const first = hits[0]!
    const px = Math.round(first.x + first.width / 2)
    const py = Math.round(first.y + first.height / 2)
    expect(data[py * info.width + px]).toBeLessThan(20)
    expect(readFileSync(path).length).toBeGreaterThan(0)
  }, 120000)

  it('schwärzt Bilder mit markierten Bereichen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-red-'))
    const path = join(dir, 'foto.png')
    writeFileSync(path, await sharp({ create: { width: 200, height: 100, channels: 3, background: '#ffffff' } }).png().toBuffer())
    const result = await run(path, { boxes: [{ page: 1, x: 20, y: 10, width: 50, height: 30 }] })
    expect(result.status).toBe('done')
    const { data, info } = await sharp(result.outputPath ?? '').removeAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(data[(20 * info.width + 40) * 3]).toBe(0)
    expect(data[(80 * info.width + 150) * 3]).toBe(255)
  })

  it('meldet fehlende Markierungen, falsche Seiten und falsche Typen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-red-'))
    const path = await letter(dir)
    expect(await run(path, { boxes: [] })).toMatchObject({ status: 'error', errorCode: 'unsupported' })
    expect(await run(path, { boxes: [{ page: 9, x: 0, y: 0, width: 10, height: 10 }] })).toMatchObject({ status: 'error', errorCode: 'unsupported' })
    writeFileSync(join(dir, 'a.docx'), 'x')
    expect(await run(join(dir, 'a.docx'), { boxes: [{ page: 1, x: 0, y: 0, width: 10, height: 10 }] })).toMatchObject({ status: 'error', errorCode: 'unsupported' })
  })

  it('prüft nur die geschwärzten Seiten und lässt andere Seiten mit Text unangetastet', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-red-'))
    const path = await letter(dir)
    const result = await run(path, { boxes: [{ page: 1, x: 0, y: 0, width: 5, height: 5 }], checkTerms: ['Rechnung', 'Zweite Seite'] })
    expect(result.status).toBe('done')
    const out = await openPdf(new Uint8Array(readFileSync(result.outputPath ?? '')))
    expect(await out.text(2)).toContain('Zweite Seite')
    expect(await out.text(1)).toBe('')
    await out.close()
  }, 120000)
})
