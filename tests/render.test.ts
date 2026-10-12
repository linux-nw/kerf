import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import sharp from 'sharp'
import { afterAll, describe, expect, it } from 'vitest'
import { PATTERNS, PdfRenderer } from '../src/main/engines/pdf/renderCore'
import { EngineError } from '../src/main/errors'

async function textPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const first = doc.addPage([595, 842])
  first.drawText('Rechnung 2026', { x: 50, y: 780, size: 24, font, color: rgb(0, 0, 0) })
  first.drawText('Kontakt: max.mustermann@example.com', { x: 50, y: 700, size: 12, font })
  first.drawText('IBAN: DE89 3704 0044 0532 0130 00', { x: 50, y: 680, size: 12, font })
  const second = doc.addPage([400, 300])
  second.drawText('Zweite Seite', { x: 30, y: 250, size: 18, font })
  second.drawText('Mail an ANNA@Example.org bitte', { x: 30, y: 200, size: 12, font })
  return doc.save()
}

describe('PdfRenderer', () => {
  let renderer: PdfRenderer | null = null
  afterAll(async () => {
    await renderer?.close()
  })

  it('liefert Seitenzahl und Größen', async () => {
    renderer = await PdfRenderer.open(await textPdf())
    const info = await renderer.info()
    expect(info.pages).toBe(2)
    expect(info.sizes[0]).toEqual({ width: 595, height: 842 })
    expect(info.sizes[1]).toEqual({ width: 400, height: 300 })
  })

  it('rendert Seiten als PNG mit passender Größe auf weißem Grund', async () => {
    renderer ??= await PdfRenderer.open(await textPdf())
    const page = await renderer.render(1, { dpi: 144 })
    expect(page.width).toBe(1190)
    expect(page.height).toBe(1684)
    const meta = await sharp(page.data).metadata()
    expect(meta.format).toBe('png')
    const corner = await sharp(page.data).extract({ left: 0, top: 0, width: 4, height: 4 }).raw().toBuffer()
    expect([...corner.subarray(0, 3)]).toEqual([255, 255, 255])
    const stats = await sharp(page.data).stats()
    expect(stats.channels[0]?.min ?? 255).toBeLessThan(100)
  })

  it('rendert auf eine Zielbreite und als JPEG', async () => {
    renderer ??= await PdfRenderer.open(await textPdf())
    const page = await renderer.render(2, { width: 200, format: 'jpeg', quality: 80 })
    expect(page.width).toBe(200)
    expect((await sharp(page.data).metadata()).format).toBe('jpeg')
  })

  it('liest den Text einer Seite', async () => {
    renderer ??= await PdfRenderer.open(await textPdf())
    expect(await renderer.text(1)).toContain('Rechnung 2026')
    expect(await renderer.text(2)).toContain('Zweite Seite')
  })

  it('findet Muster mit Positionen im Seitenbereich', async () => {
    renderer ??= await PdfRenderer.open(await textPdf())
    const mails = await renderer.find([PATTERNS['email'] as string], 'gi')
    expect(mails.map((m) => m.page)).toEqual([1, 2])
    expect(mails[0]?.text).toBe('max.mustermann@example.com')
    expect(mails[1]?.text).toBe('ANNA@Example.org')
    const first = mails[0]
    expect(first?.x ?? 0).toBeGreaterThan(50)
    expect(first?.y ?? 0).toBeGreaterThan(842 - 720)
    expect(first?.y ?? 0).toBeLessThan(842 - 690)
    expect(first?.width ?? 0).toBeGreaterThan(100)
    const iban = await renderer.find([PATTERNS['iban'] as string], 'g')
    expect(iban[0]?.text.replace(/\s/g, '')).toBe('DE89370400440532013000')
  })

  it('findet Suchbegriffe ohne Rücksicht auf Groß und Klein', async () => {
    renderer ??= await PdfRenderer.open(await textPdf())
    const hits = await renderer.find(['zweite seite'], 'gi')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.page).toBe(2)
  })

  it('meldet kaputte Dateien', async () => {
    await expect(PdfRenderer.open(new TextEncoder().encode('kein pdf'))).rejects.toBeInstanceOf(EngineError)
  })
})
