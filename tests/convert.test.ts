import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import { bmpToPng, encodeBmp } from '../src/main/engines/image/bmp'
import { icoToPng, parseIco } from '../src/main/engines/image/ico'
import { setHtmlToPdf } from '../src/main/engines/convert/htmlPdf'
import { csvToObjects, htmlToText, parseCsv, toCsv } from '../src/main/engines/convert/text'
import { JobRunner } from '../src/main/jobs'
import { createConvertTool } from '../src/main/tools/convert'
import { allTargets, commonTargets, lossWarning, sourceKind, targetsFor } from '../src/shared/convertTargets'
import type { JobUpdate } from '../src/shared/types'

let dir: string
const htmlCalls: string[] = []

beforeAll(() => {
  setHtmlToPdf(async (html) => {
    htmlCalls.push(html)
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    doc.addPage().drawText('PDF aus HTML', { x: 20, y: 700, size: 14, font })
    return doc.save()
  })
})

function fresh(): string {
  dir = mkdtempSync(join(tmpdir(), 'kerf-conv-'))
  return dir
}

async function convert(path: string, options: Record<string, unknown>, deps: Parameters<typeof createConvertTool>[0] = {}) {
  const updates: JobUpdate[] = []
  const runner = new JobRunner({ convert: createConvertTool({ soffice: () => null, msOffice: async () => ({ word: false, excel: false, powerpoint: false }), ffmpeg: async () => null, ...deps }) }, null, () => 1)
  await runner.start('convert', [{ id: 'c', paths: [path] }], options, (u) => updates.push(u))
  return updates.at(-1) as JobUpdate
}

async function sourcePng(path: string, transparent = true) {
  const buffer = await sharp({ create: { width: 300, height: 200, channels: 4, background: transparent ? { r: 255, g: 0, b: 0, alpha: 0.5 } : '#ff0000' } }).png().toBuffer()
  writeFileSync(path, buffer)
  return buffer
}

describe('Zielformate', () => {
  it('bietet für Bilder die passenden Ziele und nie das eigene Format', () => {
    const ids = allTargets('png').map((t) => t.id)
    expect(ids).toEqual(expect.arrayContaining(['jpg', 'webp', 'ico', 'favicon', 'pdf', 'bmp']))
    expect(ids).not.toContain('png')
    expect(allTargets('jpeg').map((t) => t.id)).not.toContain('jpg')
  })

  it('markiert Ziele ohne LibreOffice oder FFmpeg als nicht verfügbar', () => {
    const none = targetsFor('docx', { libreoffice: null, ffmpeg: false })
    expect(none.find((t) => t.id === 'pdf')?.available).toBe(true)
    expect(none.find((t) => t.id === 'odt')?.available).toBe(false)
    expect(none.find((t) => t.id === 'txt')?.available).toBe(true)
    const withLo = targetsFor('docx', { libreoffice: '/usr/bin/soffice', ffmpeg: true })
    expect(withLo.find((t) => t.id === 'odt')?.available).toBe(true)
    expect(targetsFor('mp4', { libreoffice: null, ffmpeg: false }).every((t) => !t.available)).toBe(true)
  })

  it('findet gemeinsame Ziele mehrerer Dateien', () => {
    const caps = { libreoffice: '/x', ffmpeg: true }
    expect(commonTargets(['a.png', 'b.jpg'], caps).map((t) => t.id)).toEqual(expect.arrayContaining(['webp', 'pdf']))
    expect(commonTargets(['a.png', 'b.mp4'], caps).map((t) => t.id)).toEqual(['gif'])
    expect(commonTargets(['a.png', 'b.docx'], caps).map((t) => t.id)).toEqual(['pdf'])
    expect(sourceKind('XLSX')).toBe('calc')
    expect(sourceKind('xyz')).toBeNull()
  })

  it('warnt vor verlustbehafteten Wegen', () => {
    expect(lossWarning('png', 'jpg')).toMatch(/Transparenz/)
    expect(lossWarning('jpg', 'png')).toBeNull()
    expect(lossWarning('pdf', 'txt')).toMatch(/Texterkennung/)
  })
})

describe('Bild-Konvertierung', () => {
  it('wandelt PNG in JPG, WebP, TIFF und GIF um und behält das Original', async () => {
    const d = fresh()
    const source = join(d, 'bild.png')
    const original = await sourcePng(source)
    for (const [target, format] of [['jpg', 'jpeg'], ['webp', 'webp'], ['tiff', 'tiff'], ['gif', 'gif'], ['avif', 'heif']] as const) {
      const result = await convert(source, { target })
      expect(result.status).toBe('done')
      expect(result.outputPath).toBe(join(d, `bild.${target}`))
      expect((await sharp(result.outputPath ?? '').metadata()).format).toBe(format)
    }
    expect(readFileSync(source).equals(original)).toBe(true)
  })

  it('macht transparente Stellen bei JPG weiß', async () => {
    const d = fresh()
    const source = join(d, 'bild.png')
    await sourcePng(source)
    const result = await convert(source, { target: 'jpg' })
    const { data } = await sharp(result.outputPath ?? '').raw().toBuffer({ resolveWithObject: true })
    expect(data[0]).toBeGreaterThan(230)
    expect(data[1]).toBeGreaterThan(100)
  })

  it('schreibt nie über vorhandene Dateien', async () => {
    const d = fresh()
    const source = join(d, 'bild.png')
    await sourcePng(source)
    writeFileSync(join(d, 'bild.jpg'), 'vorhanden')
    const result = await convert(source, { target: 'jpg' })
    expect(result.outputPath).toBe(join(d, 'bild-2.jpg'))
    expect(readFileSync(join(d, 'bild.jpg'), 'utf8')).toBe('vorhanden')
  })

  it('erzeugt ICO mit mehreren Größen und liest sie zurück', async () => {
    const d = fresh()
    const source = join(d, 'logo.png')
    await sourcePng(source)
    const result = await convert(source, { target: 'ico', icoSizes: [16, 32, 64, 256] })
    expect(result.status).toBe('done')
    const ico = readFileSync(result.outputPath ?? '')
    const entries = parseIco(ico)
    expect(entries.map((e) => e.width)).toEqual([16, 32, 64, 256])
    const png = await icoToPng(ico)
    expect((await sharp(png).metadata()).width).toBe(256)
    const back = await convert(result.outputPath ?? '', { target: 'png' })
    expect(back.status).toBe('done')
    expect((await sharp(back.outputPath ?? '').metadata()).width).toBe(256)
  })

  it('lehnt ICO ohne gültige Größe ab', async () => {
    const d = fresh()
    const source = join(d, 'logo.png')
    await sourcePng(source)
    const result = await convert(source, { target: 'ico', icoSizes: [1, 999] })
    expect(result).toMatchObject({ status: 'error', errorCode: 'unsupported' })
  })

  it('erzeugt ein Favicon-Set als Ordner', async () => {
    const d = fresh()
    const source = join(d, 'logo.png')
    await sourcePng(source)
    const result = await convert(source, { target: 'favicon' })
    expect(result.status).toBe('done')
    const folder = result.outputPath ?? ''
    expect(folder).toBe(join(d, 'logo_favicon'))
    expect(readdirSync(folder).sort()).toEqual(['android-chrome-192x192.png', 'android-chrome-512x512.png', 'apple-touch-icon.png', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon.ico', 'html-einbindung.txt', 'site.webmanifest'])
    expect((await sharp(join(folder, 'apple-touch-icon.png')).metadata()).width).toBe(180)
    expect(parseIco(readFileSync(join(folder, 'favicon.ico'))).map((e) => e.width)).toEqual([16, 32, 48])
    expect(JSON.parse(readFileSync(join(folder, 'site.webmanifest'), 'utf8')).icons).toHaveLength(2)
  })

  it('wandelt BMP hin und zurück ohne Pixelverlust', async () => {
    const d = fresh()
    const source = join(d, 'foto.png')
    const png = await sharp({ create: { width: 37, height: 21, channels: 3, background: '#2468ac' } }).composite([{ input: Buffer.from([255, 255, 0, 255]), raw: { width: 1, height: 1, channels: 4 }, left: 5, top: 7 }]).png().toBuffer()
    writeFileSync(source, png)
    const bmp = await encodeBmp(png)
    expect(bmp.toString('latin1', 0, 2)).toBe('BM')
    const back = await bmpToPng(bmp)
    const a = await sharp(png).removeAlpha().raw().toBuffer()
    const b = await sharp(back).removeAlpha().raw().toBuffer()
    expect(b.equals(a)).toBe(true)
    const viaTool = await convert(source, { target: 'bmp' })
    expect(viaTool.status).toBe('done')
    const readBack = await convert(viaTool.outputPath ?? '', { target: 'png' })
    expect(readBack.status).toBe('done')
  })

  it('wandelt SVG in PNG um', async () => {
    const d = fresh()
    const source = join(d, 'icon.svg')
    writeFileSync(source, '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e85d0c"/></svg>')
    const result = await convert(source, { target: 'png' })
    expect(result.status).toBe('done')
    expect((await sharp(result.outputPath ?? '').metadata()).width).toBeGreaterThanOrEqual(64)
  })

  it('wandelt ein Bild in ein PDF', async () => {
    const d = fresh()
    const source = join(d, 'scan.png')
    await sourcePng(source, false)
    const result = await convert(source, { target: 'pdf' })
    expect(result.status).toBe('done')
    const doc = await PDFDocument.load(readFileSync(result.outputPath ?? ''))
    expect(doc.getPageCount()).toBe(1)
    const page = doc.getPage(0)
    expect(Math.round(page.getWidth())).toBe(144)
  })

  it('meldet kaputte Bilder', async () => {
    const d = fresh()
    const source = join(d, 'kaputt.png')
    writeFileSync(source, 'kein bild')
    expect(await convert(source, { target: 'jpg' })).toMatchObject({ status: 'error', errorCode: 'unreadable' })
  })
})

describe('PDF-Konvertierung', () => {
  async function pdf(path: string) {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    doc.addPage([300, 300]).drawText('Hallo erste Seite', { x: 20, y: 250, size: 14, font })
    doc.addPage([300, 300]).drawText('Zweite Seite hier', { x: 20, y: 250, size: 14, font })
    writeFileSync(path, await doc.save())
  }

  it('speichert jede Seite als Bild in einem Ordner', async () => {
    const d = fresh()
    await pdf(join(d, 'mappe.pdf'))
    const result = await convert(join(d, 'mappe.pdf'), { target: 'png', pdfDpi: 72 })
    expect(result.status).toBe('done')
    expect(result.outputPath).toBe(join(d, 'mappe_Seiten'))
    expect(readdirSync(result.outputPath ?? '')).toEqual(['mappe-1.png', 'mappe-2.png'])
    expect((await sharp(join(result.outputPath ?? '', 'mappe-1.png')).metadata()).width).toBe(300)
  })

  it('liest den Text aus einem PDF', async () => {
    const d = fresh()
    await pdf(join(d, 'mappe.pdf'))
    const result = await convert(join(d, 'mappe.pdf'), { target: 'txt' })
    expect(result.status).toBe('done')
    const text = readFileSync(result.outputPath ?? '', 'utf8')
    expect(text).toContain('Hallo erste Seite')
    expect(text).toContain('Zweite Seite hier')
  })

  it('weist bei PDFs ohne Text auf die Texterkennung hin', async () => {
    const d = fresh()
    const doc = await PDFDocument.create()
    doc.addPage()
    writeFileSync(join(d, 'leer.pdf'), await doc.save())
    const result = await convert(join(d, 'leer.pdf'), { target: 'txt' })
    expect(result).toMatchObject({ status: 'error', errorCode: 'unsupported' })
    expect(result.detail).toMatch(/Texterkennung/)
  })
})

describe('Text und Daten', () => {
  it('parst und schreibt CSV mit Anführungszeichen und Semikolon', () => {
    const rows = parseCsv('Name;Ort\n"Müller; Max";"Rav ""Stadt"""\nAnna;Wangen')
    expect(rows).toEqual([['Name', 'Ort'], ['Müller; Max', 'Rav "Stadt"'], ['Anna', 'Wangen']])
    expect(toCsv(rows)).toBe('Name;Ort\r\n"Müller; Max";"Rav ""Stadt"""\r\nAnna;Wangen\r\n')
    expect(csvToObjects('a,b\n1,x\n2,y')).toEqual([{ a: 1, b: 'x' }, { a: 2, b: 'y' }])
  })

  it('wandelt HTML in lesbaren Text', () => {
    expect(htmlToText('<h1>Titel</h1><p>Eins &amp; zwei</p><ul><li>a</li><li>b</li></ul>')).toBe('Titel\nEins & zwei\n- a\n- b')
  })

  it('wandelt zwischen CSV, JSON, YAML, XML und XLSX', async () => {
    const d = fresh()
    writeFileSync(join(d, 'daten.csv'), 'Name;Preis\nÄpfel;1,5\nBirnen;2\n')
    const json = await convert(join(d, 'daten.csv'), { target: 'json' })
    expect(JSON.parse(readFileSync(json.outputPath ?? '', 'utf8'))).toEqual([{ Name: 'Äpfel', Preis: '1,5' }, { Name: 'Birnen', Preis: 2 }])
    const yaml = await convert(json.outputPath ?? '', { target: 'yaml' })
    expect(readFileSync(yaml.outputPath ?? '', 'utf8')).toContain('Name: Äpfel')
    const back = await convert(yaml.outputPath ?? '', { target: 'json' })
    expect(JSON.parse(readFileSync(back.outputPath ?? '', 'utf8'))).toHaveLength(2)
    const csv = await convert(json.outputPath ?? '', { target: 'csv' })
    expect(readFileSync(csv.outputPath ?? '', 'utf8')).toBe('﻿Name;Preis\r\nÄpfel;1,5\r\nBirnen;2\r\n')
    const xlsx = await convert(join(d, 'daten.csv'), { target: 'xlsx' })
    expect(xlsx.status).toBe('done')
    const fromXlsx = await convert(xlsx.outputPath ?? '', { target: 'json' })
    expect(JSON.parse(readFileSync(fromXlsx.outputPath ?? '', 'utf8'))[1]).toEqual({ Name: 'Birnen', Preis: 2 })
    const xml = await convert(json.outputPath ?? '', { target: 'xml' })
    expect(readFileSync(xml.outputPath ?? '', 'utf8')).toContain('<Name>Äpfel</Name>')
    const xmlBack = await convert(xml.outputPath ?? '', { target: 'json' })
    expect(JSON.parse(readFileSync(xmlBack.outputPath ?? '', 'utf8')).root).toBeDefined()
  })

  it('wandelt Markdown in HTML, Text und PDF', async () => {
    const d = fresh()
    writeFileSync(join(d, 'notiz.md'), '# Titel\n\nEin **fetter** Text.\n\n- eins\n- zwei\n')
    const html = await convert(join(d, 'notiz.md'), { target: 'html' })
    expect(readFileSync(html.outputPath ?? '', 'utf8')).toContain('<h1>Titel</h1>')
    const txt = await convert(join(d, 'notiz.md'), { target: 'txt' })
    expect(readFileSync(txt.outputPath ?? '', 'utf8')).toContain('Ein fetter Text.')
    htmlCalls.length = 0
    const pdf = await convert(join(d, 'notiz.md'), { target: 'pdf' })
    expect(pdf.status).toBe('done')
    expect(htmlCalls[0]).toContain('<h1>Titel</h1>')
    expect((await PDFDocument.load(readFileSync(pdf.outputPath ?? ''))).getPageCount()).toBe(1)
  })

  it('liest Word-Dokumente ohne Office', async () => {
    const d = fresh()
    const enc = new TextEncoder()
    writeFileSync(
      join(d, 'brief.docx'),
      zipSync({
        '[Content_Types].xml': enc.encode('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
        '_rels/.rels': enc.encode('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
        'word/document.xml': enc.encode('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Guten Tag Welt</w:t></w:r></w:p></w:body></w:document>')
      })
    )
    const txt = await convert(join(d, 'brief.docx'), { target: 'txt' })
    expect(readFileSync(txt.outputPath ?? '', 'utf8')).toContain('Guten Tag Welt')
    const pdf = await convert(join(d, 'brief.docx'), { target: 'pdf' })
    expect(pdf.status).toBe('done')
    expect(pdf.detail).toMatch(/Vereinfachte Darstellung/)
  })

  it('verlangt für Office ohne Programme eine ehrliche Meldung', async () => {
    const d = fresh()
    writeFileSync(join(d, 'folien.pptx'), 'x')
    expect(await convert(join(d, 'folien.pptx'), { target: 'pdf' })).toMatchObject({ status: 'error', errorCode: 'toolmissing' })
    writeFileSync(join(d, 'brief.docx'), 'x')
    expect(await convert(join(d, 'brief.docx'), { target: 'odt' })).toMatchObject({ status: 'error', errorCode: 'toolmissing' })
  })
})

const soffice = ['/usr/bin/soffice', '/usr/local/bin/soffice'].find((p) => existsSync(p)) ?? null

describe.skipIf(!soffice)('Office mit LibreOffice', () => {
  it('wandelt DOCX in PDF und ODT, XLSX in CSV und PPTX in PDF', async () => {
    const d = fresh()
    execFileSync(soffice as string, ['--headless', '--norestore', `-env:UserInstallation=file://${d}/p`, '--convert-to', 'docx', '--outdir', d, writeSource(d, 'brief.txt', 'Hallo aus LibreOffice\n')], { stdio: 'ignore' })
    const docx = join(d, 'brief.docx')
    expect(existsSync(docx)).toBe(true)
    const deps = { soffice: () => soffice }
    const pdf = await convert(docx, { target: 'pdf' }, deps)
    expect(pdf.status).toBe('done')
    expect(readFileSync(pdf.outputPath ?? '').subarray(0, 4).toString()).toBe('%PDF')
    expect(pdf.detail).toBeNull()
    const odt = await convert(docx, { target: 'odt' }, deps)
    expect(odt.status).toBe('done')
    writeSource(d, 'tabelle.csv', 'a,b\n1,2\n')
    execFileSync(soffice as string, ['--headless', '--norestore', `-env:UserInstallation=file://${d}/p`, '--convert-to', 'xlsx', '--outdir', d, join(d, 'tabelle.csv')], { stdio: 'ignore' })
    const csv = await convert(join(d, 'tabelle.xlsx'), { target: 'csv' }, deps)
    expect(csv.status).toBe('done')
    expect(readFileSync(csv.outputPath ?? '', 'utf8')).toContain('1')
    const ods = await convert(join(d, 'tabelle.xlsx'), { target: 'ods' }, deps)
    expect(ods.status).toBe('done')
  }, 180000)
})

function writeSource(d: string, name: string, content: string): string {
  mkdirSync(d, { recursive: true })
  const path = join(d, name)
  writeFileSync(path, content)
  return path
}

const ffmpeg = existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : null

describe.skipIf(!ffmpeg)('Audio und Video', () => {
  it('wandelt WAV in MP3 und Video in GIF und Tonspur', async () => {
    const d = fresh()
    execFileSync(ffmpeg as string, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', join(d, 'ton.wav')])
    const deps = { ffmpeg: async () => ffmpeg }
    const mp3 = await convert(join(d, 'ton.wav'), { target: 'mp3' }, deps)
    expect(mp3.status).toBe('done')
    expect(statSizeOf(mp3.outputPath)).toBeGreaterThan(1000)
    execFileSync(ffmpeg as string, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', '-shortest', '-pix_fmt', 'yuv420p', join(d, 'clip.mp4')])
    const gif = await convert(join(d, 'clip.mp4'), { target: 'gif' }, deps)
    expect(gif.status).toBe('done')
    expect(readFileSync(gif.outputPath ?? '').subarray(0, 3).toString()).toBe('GIF')
    const audio = await convert(join(d, 'clip.mp4'), { target: 'mp3' }, deps)
    expect(audio.status).toBe('done')
    const webm = await convert(join(d, 'clip.mp4'), { target: 'webm' }, deps)
    expect(webm.status).toBe('done')
  }, 180000)

  it('meldet fehlendes FFmpeg und kaputte Dateien', async () => {
    const d = fresh()
    writeFileSync(join(d, 'kaputt.mp3'), 'kein audio')
    expect(await convert(join(d, 'kaputt.mp3'), { target: 'wav' })).toMatchObject({ status: 'error', errorCode: 'toolmissing' })
    const broken = await convert(join(d, 'kaputt.mp3'), { target: 'wav' }, { ffmpeg: async () => ffmpeg })
    expect(broken.status).toBe('error')
    expect(existsSync(join(d, 'kaputt.wav'))).toBe(false)
  })
})

function statSizeOf(path: string | null): number {
  return path ? readFileSync(path).length : 0
}
