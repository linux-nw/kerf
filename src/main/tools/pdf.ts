import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from 'pdf-lib'
import { extensionOf } from '@shared/tools'
import type { PdfMode, PdfOptions } from '@shared/types'
import { imageToPdf, normalizeImage } from '../engines/convert/image'
import { nextOutputPath, uniquePath } from '../engines/pdf/output'
import { CancelledError, EngineError } from '../errors'
import { withDefaults, type ToolRunner } from './types'

const defaults: PdfOptions = {
  mode: 'merge',
  outputDir: null,
  splitRanges: '',
  splitEvery: false,
  pages: [],
  watermarkText: 'ENTWURF',
  watermarkOpacity: 0.2,
  watermarkSize: 72,
  numberFormat: 'Seite {n} von {total}',
  numberPosition: 'bottom-center',
  numberStart: 1
}

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp', 'gif', 'avif']

export function parseRanges(text: string, total: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const parts = text.split(/[,;]/).map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) throw new EngineError('unsupported', 'Bitte gib Seitenbereiche an, zum Beispiel 1-3, 5, 7-')
  for (const part of parts) {
    const match = /^(\d+)?\s*(-|–)?\s*(\d+)?$/.exec(part)
    if (!match || (!match[1] && !match[3])) throw new EngineError('unsupported', `„${part}“ ist kein gültiger Bereich`)
    const hasDash = Boolean(match[2])
    const from = match[1] ? Number(match[1]) : 1
    const to = hasDash ? (match[3] ? Number(match[3]) : total) : from
    if (from < 1 || to < from || to > total) throw new EngineError('unsupported', `„${part}“ liegt außerhalb der ${total} Seiten`)
    ranges.push([from, to])
  }
  return ranges
}

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/encrypt/i.test(message)) throw new EngineError('password', 'Die Datei ist passwortgeschützt')
    throw new EngineError('unreadable', 'Die PDF-Datei konnte nicht gelesen werden')
  }
}

async function readInput(path: string): Promise<Buffer> {
  try {
    return await readFile(path)
  } catch {
    throw new EngineError('missing', 'Die Datei wurde nicht gefunden')
  }
}

async function writeAtomic(path: string, data: Uint8Array): Promise<void> {
  const temp = `${path}.part`
  await writeFile(temp, data)
  await rename(temp, path)
}

async function finish(doc: PDFDocument): Promise<Uint8Array> {
  doc.setProducer('Kerf')
  doc.setCreator('Kerf')
  return doc.save()
}

async function mergeFiles(paths: string[], outputDir: string | null, ctx: Parameters<ToolRunner>[2]): Promise<string> {
  if (paths.length < 2) throw new EngineError('unsupported', 'Zum Zusammenfügen werden mindestens zwei Dateien gebraucht')
  const target = await PDFDocument.create()
  let index = 0
  for (const path of paths) {
    if (ctx.signal.aborted) throw new CancelledError()
    ctx.progress((index / paths.length) * 90, `${basename(path)}`)
    const extension = extensionOf(path)
    const raw = await readInput(path)
    let source: PDFDocument
    if (extension === 'pdf') source = await loadPdf(raw)
    else if (IMAGE_EXT.includes(extension)) source = await loadPdf(await imageToPdf(await normalizeImage(raw, extension)))
    else throw new EngineError('unsupported', `${basename(path)} kann nicht zusammengefügt werden`)
    const copied = await target.copyPages(source, source.getPageIndices())
    for (const page of copied) target.addPage(page)
    index += 1
  }
  const first = paths[0] ?? ''
  const output = nextOutputPath(first.replace(/\.[^.]+$/, '.pdf'), outputDir, existsSync, 'zusammen', '.pdf')
  await writeAtomic(output, await finish(target))
  return output
}

async function splitFile(path: string, options: PdfOptions, ctx: Parameters<ToolRunner>[2]): Promise<{ folder: string; count: number }> {
  const source = await loadPdf(await readInput(path))
  const total = source.getPageCount()
  const ranges: Array<[number, number]> = options.splitEvery ? Array.from({ length: total }, (_, index) => [index + 1, index + 1] as [number, number]) : parseRanges(options.splitRanges, total)
  if (!options.splitEvery && ranges.length === 1 && ranges[0]?.[0] === 1 && ranges[0]?.[1] === total) throw new EngineError('unsupported', 'Der Bereich umfasst die ganze Datei')
  const base = basename(path, extname(path))
  const directory = options.outputDir ?? dirname(path)
  const folder = uniquePath(directory, `${base}_Teile`, '', existsSync)
  await mkdir(folder, { recursive: true })
  const digits = String(ranges.length).length
  let index = 0
  for (const [from, to] of ranges) {
    if (ctx.signal.aborted) throw new CancelledError()
    ctx.progress((index / ranges.length) * 95, `Teil ${index + 1} von ${ranges.length}`)
    const part = await PDFDocument.create()
    const indices = Array.from({ length: to - from + 1 }, (_, offset) => from - 1 + offset)
    for (const page of await part.copyPages(source, indices)) part.addPage(page)
    const label = options.splitEvery ? `seite-${String(from).padStart(String(total).length, '0')}` : `teil-${String(index + 1).padStart(digits, '0')}-seiten-${from}${to === from ? '' : `-${to}`}`
    await writeAtomic(join(folder, `${base}.${label}.pdf`), await finish(part))
    index += 1
  }
  return { folder, count: ranges.length }
}

async function editPages(path: string, options: PdfOptions): Promise<string> {
  const source = await loadPdf(await readInput(path))
  const total = source.getPageCount()
  if (options.pages.length === 0) throw new EngineError('unsupported', 'Es sind keine Seiten ausgewählt')
  for (const entry of options.pages) {
    if (!Number.isInteger(entry.source) || entry.source < 1 || entry.source > total) throw new EngineError('unsupported', `Seite ${entry.source} gibt es nicht`)
  }
  const target = await PDFDocument.create()
  const copied = await target.copyPages(source, options.pages.map((entry) => entry.source - 1))
  copied.forEach((page, index) => {
    const extra = options.pages[index]?.rotation ?? 0
    if (extra) page.setRotation(degrees((((page.getRotation().angle + extra) % 360) + 360) % 360))
    target.addPage(page)
  })
  const output = nextOutputPath(path, options.outputDir, existsSync, 'bearbeitet', '.pdf')
  await writeAtomic(output, await finish(target))
  return output
}

async function textWidthSafe(font: PDFFont, text: string, size: number): Promise<number> {
  try {
    return font.widthOfTextAtSize(text, size)
  } catch {
    throw new EngineError('unsupported', 'Der Text enthält Zeichen, die in dieser Schrift nicht darstellbar sind')
  }
}

async function watermark(path: string, options: PdfOptions): Promise<string> {
  const text = options.watermarkText.trim()
  if (!text) throw new EngineError('unsupported', 'Bitte gib einen Text für das Wasserzeichen an')
  const doc = await loadPdf(await readInput(path))
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const wanted = Math.max(8, Math.min(300, options.watermarkSize))
  const opacity = Math.max(0.03, Math.min(1, options.watermarkOpacity))
  const unit = await textWidthSafe(font, text, 1)
  for (const page of doc.getPages()) {
    const { width: pageWidth, height: pageHeight } = page.getSize()
    const diagonal = Math.hypot(pageWidth, pageHeight)
    const size = Math.max(6, Math.min(wanted, (diagonal * 0.8) / unit))
    const width = unit * size
    const angle = Math.atan2(pageHeight, pageWidth) * (180 / Math.PI)
    const radians = (angle * Math.PI) / 180
    const x = pageWidth / 2 - (Math.cos(radians) * width) / 2 + Math.sin(radians) * size * 0.35
    const y = pageHeight / 2 - (Math.sin(radians) * width) / 2 - Math.cos(radians) * size * 0.35
    page.drawText(text, { x, y, size, font, color: rgb(0.5, 0.5, 0.5), opacity, rotate: degrees(angle) })
  }
  const output = nextOutputPath(path, options.outputDir, existsSync, 'wasserzeichen', '.pdf')
  await writeAtomic(output, await finish(doc))
  return output
}

async function numbers(path: string, options: PdfOptions): Promise<string> {
  const doc = await loadPdf(await readInput(path))
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()
  const size = 10
  const margin = 28
  pages.forEach((page, index) => {
    const label = (options.numberFormat || '{n}').replace(/\{n\}/g, String(options.numberStart + index)).replace(/\{total\}/g, String(options.numberStart + pages.length - 1))
    let width: number
    try {
      width = font.widthOfTextAtSize(label, size)
    } catch {
      throw new EngineError('unsupported', 'Das Format enthält Zeichen, die nicht darstellbar sind')
    }
    const { width: pageWidth, height: pageHeight } = page.getSize()
    const top = options.numberPosition.startsWith('top')
    const y = top ? pageHeight - margin : margin - size
    let x = (pageWidth - width) / 2
    if (options.numberPosition.endsWith('left')) x = margin
    if (options.numberPosition.endsWith('right')) x = pageWidth - margin - width
    page.drawText(label, { x, y, size, font, color: rgb(0.2, 0.2, 0.2) })
  })
  const output = nextOutputPath(path, options.outputDir, existsSync, 'nummeriert', '.pdf')
  await writeAtomic(output, await finish(doc))
  return output
}

const SUMMARY: Record<PdfMode, string> = {
  merge: 'Zusammengefügt',
  split: 'Aufgeteilt',
  pages: 'Seiten bearbeitet',
  watermark: 'Wasserzeichen eingefügt',
  numbers: 'Seitenzahlen eingefügt'
}

export const pdfTool: ToolRunner = async (job, rawOptions, ctx) => {
  const options = withDefaults(defaults, rawOptions)
  const first = job.paths[0]
  if (!first) throw new EngineError('missing', 'Keine Datei angegeben')
  if (options.mode !== 'merge' && extensionOf(first) !== 'pdf') throw new EngineError('unsupported', 'Dieses Werkzeug arbeitet nur mit PDF-Dateien')
  if (ctx.signal.aborted) throw new CancelledError()
  ctx.progress(5, null)
  if (options.mode === 'merge') {
    const output = await mergeFiles(job.paths, options.outputDir, ctx)
    return { outputs: [output], summary: `${SUMMARY.merge} · ${job.paths.length} Dateien` }
  }
  if (options.mode === 'split') {
    const { folder, count } = await splitFile(first, options, ctx)
    return { outputs: [folder], outputSize: null, summary: `${SUMMARY.split} · ${count} Dateien` }
  }
  if (options.mode === 'pages') {
    const output = await editPages(first, options)
    return { outputs: [output], summary: `${SUMMARY.pages} · ${options.pages.length} Seiten` }
  }
  if (options.mode === 'watermark') return { outputs: [await watermark(first, options)], summary: SUMMARY.watermark }
  return { outputs: [await numbers(first, options)], summary: SUMMARY.numbers }
}
