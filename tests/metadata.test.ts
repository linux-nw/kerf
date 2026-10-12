import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { readMetadata } from '../src/main/engines/meta/read'
import { stripJpeg, stripPng } from '../src/main/engines/meta/clean'
import { JobRunner } from '../src/main/jobs'
import { metaCleanTool } from '../src/main/tools/meta'
import type { JobUpdate } from '../src/shared/types'

async function jpegWithExif(orientation = 1): Promise<Buffer> {
  const base = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#3a7' } })
    .withExif({
      IFD0: { Make: 'Canon', Model: 'EOS R6', Software: 'Lightroom 12', Artist: 'Max Mustermann' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '47/1 39/1 28/1', GPSLongitudeRef: 'E', GPSLongitude: '9/1 28/1 53/1' }
    })
    .jpeg()
    .toBuffer()
  if (orientation === 1) return base
  const raw = await sharp(base).raw().toBuffer({ resolveWithObject: true })
  void raw
  return sharp(base).withMetadata({ orientation }).jpeg().toBuffer()
}

async function clean(path: string) {
  const updates: JobUpdate[] = []
  await new JobRunner({ metaclean: metaCleanTool }, null, () => 1).start('metaclean', [{ id: 'm', paths: [path] }], {}, (u) => updates.push(u))
  return updates.at(-1) as JobUpdate
}

describe('Metadaten lesen', () => {
  it('liest Kamera, Autor, Programm und GPS aus einem JPEG', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-meta-'))
    const path = join(dir, 'foto.jpg')
    writeFileSync(path, await jpegWithExif())
    const report = await readMetadata(path)
    const flat = Object.fromEntries(report.groups.flatMap((g) => g.items.map((i) => [i.key, i.value])))
    expect(flat['Hersteller']).toBe('Canon')
    expect(flat['Modell']).toBe('EOS R6')
    expect(flat['Urheber']).toBe('Max Mustermann')
    expect(flat['Programm']).toBe('Lightroom 12')
    expect(flat['Position']).toMatch(/47,65778° N, 9,48139° O/)
    expect(report.sensitive).toEqual(expect.arrayContaining(['GPS-Position', 'Kameramodell', 'Name oder Beschreibung', 'Bearbeitungsprogramm']))
    expect(report.kind).toBe('Foto (JPEG)')
  })

  it('liest PDF-Eigenschaften', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-meta-'))
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.setAuthor('Erika Muster')
    doc.setCreator('Word')
    const path = join(dir, 'a.pdf')
    writeFileSync(path, await doc.save())
    const report = await readMetadata(path)
    const flat = Object.fromEntries(report.groups.flatMap((g) => g.items.map((i) => [i.key, i.value])))
    expect(flat['Autor']).toBe('Erika Muster')
    expect(flat['Seiten']).toBe('1')
    expect(report.sensitive).toEqual(expect.arrayContaining(['Autor', 'Erstellprogramm']))
  })

  it('liest Office-Eigenschaften und Hinweise', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-meta-'))
    const enc = new TextEncoder()
    const path = join(dir, 'a.docx')
    writeFileSync(
      path,
      zipSync({
        '[Content_Types].xml': enc.encode('<Types><Override PartName="/docProps/custom.xml" ContentType="x"/></Types>'),
        '_rels/.rels': enc.encode('<Relationships><Relationship Id="1" Type="t" Target="docProps/core.xml"/><Relationship Id="2" Type="c" Target="docProps/custom.xml"/></Relationships>'),
        'docProps/core.xml': enc.encode('<cp:coreProperties><dc:creator>Noah W</dc:creator><cp:lastModifiedBy>Chef</cp:lastModifiedBy><dcterms:created xsi:type="x">2026-01-02T10:00:00Z</dcterms:created></cp:coreProperties>'),
        'docProps/app.xml': enc.encode('<Properties><Application>Microsoft Office Word</Application><Company>Ravensburger</Company></Properties>'),
        'docProps/custom.xml': enc.encode('<Properties><property name="Projekt"><vt:lpwstr>Geheim</vt:lpwstr></property></Properties>'),
        'word/document.xml': enc.encode('<w:document><w:ins w:id="1"/></w:document>'),
        'word/comments.xml': enc.encode('<w:comments/>')
      })
    )
    const report = await readMetadata(path)
    const flat = Object.fromEntries(report.groups.flatMap((g) => g.items.map((i) => [i.key, i.value])))
    expect(flat['Autor']).toBe('Noah W')
    expect(flat['Firma']).toBe('Ravensburger')
    expect(flat['Projekt']).toBe('Geheim')
    expect(report.hints).toEqual(expect.arrayContaining(['Enthält Kommentare', 'Enthält nachverfolgte Änderungen']))
  })
})

describe('Metadaten entfernen', () => {
  it('entfernt EXIF aus einem JPEG verlustfrei', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-meta-'))
    const path = join(dir, 'foto.jpg')
    const source = await jpegWithExif()
    writeFileSync(path, source)
    const result = await clean(path)
    expect(result.status).toBe('done')
    expect(result.outputPath).toBe(join(dir, 'foto.bereinigt.jpg'))
    const data = result.data as { removed: string[]; after: string[] }
    expect(data.after).toEqual([])
    expect(data.removed).toEqual(expect.arrayContaining(['GPS-Position', 'Kameramodell']))
    const original = await sharp(source).raw().toBuffer()
    const cleaned = await sharp(readFileSync(result.outputPath ?? '')).raw().toBuffer()
    expect(cleaned.equals(original)).toBe(true)
    expect(readFileSync(path).equals(source)).toBe(true)
  })

  it('wendet die Drehung an, wenn das Bild per EXIF gedreht war', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-meta-'))
    const path = join(dir, 'quer.jpg')
    writeFileSync(path, await jpegWithExif(6))
    const result = await clean(path)
    expect(result.status).toBe('done')
    const meta = await sharp(result.outputPath ?? '').metadata()
    expect(meta.width).toBe(300)
    expect(meta.height).toBe(400)
    expect(result.detail).toBe('Das Bild wurde neu kodiert')
  })

  it('entfernt Textchunks aus PNG', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-meta-'))
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).withExif({ IFD0: { Artist: 'Jemand', Software: 'Tool' } }).png().toBuffer()
    expect(png.includes(Buffer.from('eXIf'))).toBe(true)
    const stripped = stripPng(png)
    expect(stripped.includes(Buffer.from('eXIf'))).toBe(false)
    expect((await sharp(stripped).metadata()).width).toBe(20)
  })

  it('entfernt PDF-Eigenschaften und XMP', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-meta-'))
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.setAuthor('Erika Muster')
    doc.setTitle('Vertrag')
    const path = join(dir, 'a.pdf')
    writeFileSync(path, await doc.save())
    const result = await clean(path)
    expect(result.status).toBe('done')
    const after = await PDFDocument.load(readFileSync(result.outputPath ?? ''), { updateMetadata: false })
    expect(after.getAuthor()).toBeUndefined()
    expect(after.getTitle()).toBeUndefined()
    expect(after.getPageCount()).toBe(1)
    expect((result.data as { after: string[] }).after).toEqual([])
  })

  it('entfernt Office-Eigenschaften, Vorschaubild und benutzerdefinierte Felder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-meta-'))
    const enc = new TextEncoder()
    const path = join(dir, 'a.docx')
    writeFileSync(
      path,
      zipSync({
        '[Content_Types].xml': enc.encode('<Types><Override PartName="/docProps/custom.xml" ContentType="x"/></Types>'),
        '_rels/.rels': enc.encode('<Relationships><Relationship Id="1" Type="t" Target="docProps/core.xml"/><Relationship Id="2" Type="c" Target="docProps/custom.xml"/><Relationship Id="3" Type="th" Target="docProps/thumbnail.jpeg"/></Relationships>'),
        'docProps/core.xml': enc.encode('<cp:coreProperties><dc:creator>Noah W</dc:creator></cp:coreProperties>'),
        'docProps/app.xml': enc.encode('<Properties><Company>Ravensburger</Company></Properties>'),
        'docProps/custom.xml': enc.encode('<Properties><property name="P"><vt:lpwstr>X</vt:lpwstr></property></Properties>'),
        'docProps/thumbnail.jpeg': new Uint8Array([1, 2, 3]),
        'word/document.xml': enc.encode('<w:document>Inhalt</w:document>')
      })
    )
    const result = await clean(path)
    expect(result.status).toBe('done')
    const files = unzipSync(readFileSync(result.outputPath ?? ''))
    expect(Object.keys(files)).not.toContain('docProps/custom.xml')
    expect(Object.keys(files)).not.toContain('docProps/thumbnail.jpeg')
    expect(new TextDecoder().decode(files['_rels/.rels'])).not.toContain('custom.xml')
    expect(new TextDecoder().decode(files['word/document.xml'])).toBe('<w:document>Inhalt</w:document>')
    expect((result.data as { after: string[] }).after).toEqual([])
  })

  it('meldet, wenn nichts zu entfernen ist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-meta-'))
    const path = join(dir, 'sauber.png')
    writeFileSync(path, await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer())
    const result = await clean(path)
    expect(result.status).toBe('nogain')
  })

  it('stripJpeg erkennt kaputte Daten', () => {
    expect(() => stripJpeg(Buffer.from('kein jpeg'))).toThrow()
  })
})
