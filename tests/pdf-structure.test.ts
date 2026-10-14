import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import * as mupdf from 'mupdf'
import { deflateSync } from 'node:zlib'
import { PDFDocument, PDFName, concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState, rgb, type PDFPage } from 'pdf-lib'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import { compressPdfBytes } from '../src/main/engines/pdf/compress'
import { optimizeStructure } from '../src/main/engines/pdf/optimize'

const FONT_REGULAR = join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf')
const FONT_BOLD = join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf')

const hasQpdf = (() => {
  try {
    execFileSync('qpdf', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

const WORDS = 'Vertrag Leistung Vergütung Haftung Laufzeit Kündigung Datenschutz Gewährleistung Rechnung Zahlung Angebot Projekt Bericht Ergebnis Maßnahme Größe Qualität'.split(' ')

async function makeTextPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const regular = await doc.embedFont(readFileSync(FONT_REGULAR), { subset: false })
  const bold = await doc.embedFont(readFileSync(FONT_BOLD), { subset: false })
  let seed = 3
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed
  }
  for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
    const page = doc.addPage([595, 842])
    page.drawText(`Abschnitt ${pageIndex + 1}`, { x: 50, y: 790, size: 16, font: bold, color: rgb(0, 0, 0) })
    for (let line = 0; line < 50; line += 1) {
      const text = Array.from({ length: 11 }, () => WORDS[next() % WORDS.length]).join(' ')
      page.drawText(text, { x: 50, y: 760 - line * 14, size: 9, font: regular })
    }
  }
  return doc.save({ useObjectStreams: false })
}

function pageTexts(bytes: Uint8Array): string[] {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf')
  try {
    return Array.from({ length: doc.countPages() }, (_, index) => {
      const page = doc.loadPage(index)
      try {
        return page.toStructuredText('preserve-whitespace').asText()
      } finally {
        page.destroy()
      }
    })
  } finally {
    doc.destroy()
  }
}

let textPdf: Uint8Array
let workDir: string

beforeAll(async () => {
  textPdf = await makeTextPdf()
  workDir = mkdtempSync(join(tmpdir(), 'kerf-structure-'))
})

describe('Struktur-Optimierung', () => {
  it('kürzt eingebettete Schriften und macht ein reines Text-PDF deutlich kleiner', async () => {
    const result = await optimizeStructure(textPdf, { subsetFonts: true, effort: 0 })
    expect(result).not.toBeNull()
    expect(result?.fontsSubset).toBe(true)
    expect(result?.bytes.length ?? Infinity).toBeLessThan(textPdf.length * 0.3)
  })

  it('lässt Text und Seitenzahl unverändert', async () => {
    const result = await optimizeStructure(textPdf, { subsetFonts: true, effort: 0 })
    expect(result).not.toBeNull()
    expect(pageTexts(result?.bytes ?? new Uint8Array())).toEqual(pageTexts(textPdf))
  })

  it.skipIf(!hasQpdf)('erzeugt Dateien, die qpdf als in Ordnung prüft', async () => {
    const result = await optimizeStructure(textPdf, { subsetFonts: true, effort: 100 })
    const file = join(workDir, 'text.pdf')
    writeFileSync(file, result?.bytes ?? new Uint8Array())
    expect(execFileSync('qpdf', ['--check', file], { encoding: 'utf8' })).toContain('No syntax or stream encoding errors found')
  })

  it('liefert nichts, wenn es nichts zu gewinnen gibt', async () => {
    const first = await optimizeStructure(textPdf, { subsetFonts: true, effort: 0 })
    const second = await optimizeStructure(first?.bytes ?? new Uint8Array(), { subsetFonts: true, effort: 0 })
    expect(second === null || second.bytes.length >= (first?.bytes.length ?? 0) * 0.9).toBe(true)
  })

  it('bricht ab, wenn das Signal gesetzt ist', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(optimizeStructure(textPdf, { subsetFonts: true, effort: 0, signal: controller.signal })).rejects.toThrow()
  })
})

describe('compressPdfBytes mit Stufen', () => {
  it('verkleinert ein reines Text-PDF in beiden Stufen', async () => {
    for (const level of ['kompakt', 'winzig'] as const) {
      const { bytes, stats } = await compressPdfBytes(textPdf, { level, stripMetadata: false })
      expect(stats.structure).toBe(true)
      expect(stats.fontsSubset).toBe(true)
      expect(bytes.length).toBeLessThan(textPdf.length * 0.3)
      expect(pageTexts(bytes)).toEqual(pageTexts(textPdf))
    }
  })

  it('speichert neutrale RGB-Bilder bei Winzig als Graustufen', async () => {
    const size = 400
    const pixels = Buffer.alloc(size * size * 3)
    for (let index = 0; index < size * size; index += 1) {
      const value = (Math.sin(index / 37) * 90 + 128 + ((index * 2654435761) % 40)) & 0xff
      pixels[index * 3] = value
      pixels[index * 3 + 1] = value
      pixels[index * 3 + 2] = value
    }
    const png = await sharp(pixels, { raw: { width: size, height: size, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer()
    const doc = await PDFDocument.create()
    const image = await doc.embedPng(png)
    const page = doc.addPage([300, 300])
    page.drawImage(image, { x: 0, y: 0, width: 300, height: 300 })
    const source = await doc.save()

    const kompakt = await compressPdfBytes(source, { level: 'kompakt', stripMetadata: false })
    const winzig = await compressPdfBytes(source, { level: 'winzig', stripMetadata: false })
    expect(kompakt.stats.grayscale).toBe(0)
    expect(winzig.stats.grayscale).toBe(1)
    expect(winzig.bytes.length).toBeLessThan(kompakt.bytes.length)
    expect(renderDifference(source, winzig.bytes)).toBeLessThan(4)
  })

  it('speichert reine Schwarz-Weiß-Bilder mit einem Bit pro Punkt und behält das Bild', async () => {
    const width = 640
    const height = 480
    const pixels = Buffer.alloc(width * height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cellX = Math.floor(x / 14)
        const cellY = Math.floor(y / 22)
        const hash = Math.imul(cellX * 73856093 ^ cellY * 19349663, 2654435761) >>> 0
        const bit = (hash >> (((x % 14) >> 2) + 4 * (((y % 22) / 6) | 0))) & 1
        pixels[y * width + x] = bit ? 0 : 255
      }
    }
    const doc = await PDFDocument.create()
    const page = doc.addPage([320, 240])
    addGrayImage(doc, page, width, height, pixels, 320, 240)
    const source = await doc.save()

    const { bytes, stats } = await compressPdfBytes(source, { level: 'kompakt', stripMetadata: false })
    expect(stats.bilevel).toBe(1)
    expect(bytes.length).toBeLessThan(source.length)
    expect(renderDifference(source, bytes)).toBeLessThan(0.5)
  })

  it('erhält Graustufenbilder mit einem Kanal ohne Verschiebung', async () => {
    const size = 1600
    const pixels = Buffer.alloc(size * size)
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) pixels[y * size + x] = Math.round(128 + 70 * Math.sin(x / 90) * Math.cos(y / 70) + ((x * 31 + y * 17) % 9))
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 300])
    addGrayImage(doc, page, size, size, pixels, 300, 300)
    const source = await doc.save()

    for (const level of ['kompakt', 'winzig'] as const) {
      const { bytes, stats } = await compressPdfBytes(source, { level, stripMetadata: false })
      expect(stats.recompressed).toBe(1)
      expect(renderDifference(source, bytes)).toBeLessThan(4)
    }
  })
})

function addGrayImage(doc: PDFDocument, page: PDFPage, width: number, height: number, raw: Buffer, drawWidth: number, drawHeight: number): void {
  const stream = doc.context.stream(deflateSync(raw, { level: 6 }), {
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    ColorSpace: 'DeviceGray',
    BitsPerComponent: 8,
    Filter: 'FlateDecode'
  })
  const reference = doc.context.register(stream)
  page.node.setXObject(PDFName.of('Im0'), reference)
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(drawWidth, 0, 0, drawHeight, 0, 0), drawObject('Im0'), popGraphicsState())
}

function renderDifference(a: Uint8Array, b: Uint8Array): number {
  const first = mupdf.Document.openDocument(a, 'application/pdf')
  const second = mupdf.Document.openDocument(b, 'application/pdf')
  try {
    const pageA = first.loadPage(0)
    const pageB = second.loadPage(0)
    const pixmapA = pageA.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceGray, false)
    const pixmapB = pageB.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceGray, false)
    const dataA = pixmapA.getPixels()
    const dataB = pixmapB.getPixels()
    expect(dataA.length).toBe(dataB.length)
    let total = 0
    for (let index = 0; index < dataA.length; index += 1) total += Math.abs((dataA[index] ?? 0) - (dataB[index] ?? 0))
    pixmapA.destroy()
    pixmapB.destroy()
    pageA.destroy()
    pageB.destroy()
    return total / dataA.length
  } finally {
    first.destroy()
    second.destroy()
  }
}
