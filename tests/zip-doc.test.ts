import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { compressSvgBytes } from '../src/main/engines/image/svg'
import { compressZipDocumentBytes } from '../src/main/engines/office/compress'
import { JobRunner } from '../src/main/jobs'
import { createCompressTool } from '../src/main/tools/compress'
import type { JobUpdate } from '../src/shared/types'
import { photoJpeg, photoPng } from './helpers/make-pdf'

const never = new AbortController().signal
const noop = () => undefined

async function bmpOf(width: number, height: number): Promise<Uint8Array> {
  const raw = Buffer.alloc(width * height * 3)
  for (let index = 0; index < raw.length; index += 1) raw[index] = (index * 13) % 251
  const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer()
  const decoded = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  const header = Buffer.alloc(54)
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const imageSize = rowSize * height
  header.write('BM', 0)
  header.writeUInt32LE(54 + imageSize, 2)
  header.writeUInt32LE(54, 10)
  header.writeUInt32LE(40, 14)
  header.writeInt32LE(width, 18)
  header.writeInt32LE(-height, 22)
  header.writeUInt16LE(1, 26)
  header.writeUInt16LE(24, 28)
  header.writeUInt32LE(imageSize, 34)
  const body = Buffer.alloc(imageSize)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * decoded.info.channels
      const target = y * rowSize + x * 3
      body[target] = decoded.data[source + 2] ?? 0
      body[target + 1] = decoded.data[source + 1] ?? 0
      body[target + 2] = decoded.data[source] ?? 0
    }
  }
  return new Uint8Array(Buffer.concat([header, body]))
}

const CONTENT_TYPES = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="bmp" ContentType="image/bmp"/><Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>'
const ROOT_RELS = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="thumbnail" Target="docProps/thumbnail.jpeg"/></Relationships>'
const WORKBOOK_RELS = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="calcChain" Target="calcChain.xml"/></Relationships>'
const SHEET_RELS = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="image" Target="../media/bild.bmp"/></Relationships>'

describe('ZIP-Dokumente', () => {
  it('entfernt Vorschaubild und calcChain samt Verweisen und wandelt BMP in PNG um', async () => {
    const files = {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(ROOT_RELS),
      'docProps/thumbnail.jpeg': new Uint8Array(await photoJpeg(300, 200)),
      'xl/workbook.xml': strToU8('<workbook/>'),
      'xl/_rels/workbook.xml.rels': strToU8(WORKBOOK_RELS),
      'xl/calcChain.xml': strToU8('<calcChain/>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet/>'),
      'xl/worksheets/_rels/sheet1.xml.rels': strToU8(SHEET_RELS),
      'xl/media/bild.bmp': await bmpOf(300, 200)
    }
    const output = await compressZipDocumentBytes(zipSync(files), 'kompakt', noop, never)
    const result = unzipSync(output)
    expect(Object.keys(result).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/media/bild.png',
      'xl/workbook.xml',
      'xl/worksheets/_rels/sheet1.xml.rels',
      'xl/worksheets/sheet1.xml'
    ])
    expect(strFromU8(result['_rels/.rels'] ?? new Uint8Array())).not.toContain('thumbnail')
    expect(strFromU8(result['_rels/.rels'] ?? new Uint8Array())).toContain('xl/workbook.xml')
    expect(strFromU8(result['xl/_rels/workbook.xml.rels'] ?? new Uint8Array())).not.toContain('calcChain')
    expect(strFromU8(result['xl/_rels/workbook.xml.rels'] ?? new Uint8Array())).toContain('worksheets/sheet1.xml')
    expect(strFromU8(result['xl/worksheets/_rels/sheet1.xml.rels'] ?? new Uint8Array())).toContain('../media/bild.png')
    const types = strFromU8(result['[Content_Types].xml'] ?? new Uint8Array())
    expect(types).not.toContain('calcChain')
    expect(types).toContain('Extension="png"')
    const meta = await sharp(result['xl/media/bild.png']).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(300)
  })

  it('legt mimetype zuerst und unkomprimiert ab und kürzt Bilder in ODF-Dateien', async () => {
    const photo = new Uint8Array(await photoJpeg(3000, 2000))
    const source = zipSync({
      mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }],
      'content.xml': strToU8('<office:document-content/>'),
      'Pictures/foto.jpg': [photo, { level: 0 }]
    })
    const output = await compressZipDocumentBytes(source, 'winzig', noop, never)
    const files = unzipSync(output)
    expect(Object.keys(files)[0]).toBe('mimetype')
    expect(strFromU8(files.mimetype ?? new Uint8Array())).toBe('application/vnd.oasis.opendocument.text')
    expect(files['Pictures/foto.jpg']?.length ?? Infinity).toBeLessThan(photo.length * 0.5)
    const header = Buffer.from(output.slice(0, 80)).toString('latin1')
    expect(header.slice(30, 38)).toBe('mimetype')
    expect(Buffer.from(output).readUInt16LE(8)).toBe(0)
  })

  it('lässt Bilder mit Alphakanal gültig', async () => {
    const png = new Uint8Array(await photoPng(2600, 1800))
    const output = await compressZipDocumentBytes(zipSync({ 'word/media/a.png': [png, { level: 0 }], '[Content_Types].xml': strToU8('<Types/>') }), 'winzig', noop, never)
    const meta = await sharp(unzipSync(output)['word/media/a.png']).metadata()
    expect(meta.format).toBe('png')
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1800)
  })

  it('meldet beschädigte Dateien', async () => {
    await expect(compressZipDocumentBytes(strToU8('kein zip'), 'kompakt', noop, never)).rejects.toMatchObject({ code: 'unreadable' })
  })
})

describe('SVG', () => {
  const svg = '<?xml version="1.0"?><!-- Kommentar --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="200"><metadata>x</metadata><desc>Beschreibung</desc><title>Titel</title><g id="gruppe"><path d="M 0.123456 0 L 10.98765 10" fill="#ff0000"/></g></svg>'

  it('verkleinert, behält viewBox, Titel und Beschreibung', () => {
    const output = strFromU8(compressSvgBytes(strToU8(svg), 'kompakt'))
    expect(output.length).toBeLessThan(svg.length)
    expect(output).toContain('viewBox="0 0 100 50"')
    expect(output).toContain('Titel')
    expect(output).toContain('Beschreibung')
    expect(output).not.toContain('Kommentar')
  })

  it('meldet kaputtes SVG', () => {
    expect(() => compressSvgBytes(strToU8('<svg><g></svg>'), 'kompakt')).toThrow()
  })
})

describe('Komprimieren-Werkzeug für weitere Formate', () => {
  const fakePdf = async () => ({ bytes: new Uint8Array(1), stats: { images: 0, recompressed: 0, grayscale: 0, bilevel: 0, structure: false, fontsSubset: false } })

  async function run(path: string, preset: 'kompakt' | 'winzig' = 'kompakt') {
    const updates: JobUpdate[] = []
    const runner = new JobRunner({ compress: createCompressTool(fakePdf) }, null, () => 1)
    await runner.start('compress', [{ id: 'x', paths: [path] }], { preset, stripMetadata: false, outputDir: null }, (update) => updates.push(update))
    return updates.at(-1) as JobUpdate
  }

  it('verarbeitet SVG, TIFF und EPUB', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-more-'))
    const svgPath = join(dir, 'logo.svg')
    writeFileSync(svgPath, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!-- ${'x'.repeat(500)} --><path d="M 0.5000 0.5000 L 9.2500 9.2500"/></svg>`)
    expect((await run(svgPath)).status).toBe('done')

    const tifPath = join(dir, 'scan.tif')
    const raw = Buffer.alloc(800 * 600 * 3)
    for (let index = 0; index < raw.length; index += 1) raw[index] = (index >> 6) & 0xff
    writeFileSync(tifPath, await sharp(raw, { raw: { width: 800, height: 600, channels: 3 } }).tiff({ compression: 'none' }).toBuffer())
    const tif = await run(tifPath)
    expect(tif.status).toBe('done')
    expect(tif.outputPath?.endsWith('scan.klein.tif')).toBe(true)

    const epubPath = join(dir, 'buch.epub')
    writeFileSync(
      epubPath,
      zipSync({
        mimetype: [strToU8('application/epub+zip'), { level: 0 }],
        'OEBPS/cover.jpg': [new Uint8Array(await photoJpeg(3000, 2000)), { level: 0 }],
        'OEBPS/text.xhtml': strToU8('<html/>')
      })
    )
    const epub = await run(epubPath, 'winzig')
    expect(epub.status).toBe('done')
    expect(Object.keys(unzipSync(readFileSync(epub.outputPath ?? '')))[0]).toBe('mimetype')
  })
})
