import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import sharp, { type OverlayOptions } from 'sharp'
import { extensionOf } from '@shared/tools'
import type { RedactBox, RedactOptions } from '@shared/types'
import { normalizeImage } from '../engines/convert/image'
import { openPdf } from '../engines/pdf/open'
import { nextOutputPath } from '../engines/pdf/output'
import { escapeRegex } from '../engines/pdf/renderCore'
import { CancelledError, EngineError } from '../errors'
import { withDefaults, type ToolRunner } from './types'

const defaults: RedactOptions = { boxes: [], checkTerms: [], outputDir: null }
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp']
const DPI = 200

function validBoxes(boxes: RedactBox[]): RedactBox[] {
  return boxes.filter((box) => [box.page, box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0 && box.page >= 1)
}

async function writeAtomic(path: string, data: Uint8Array): Promise<void> {
  const temp = `${path}.part`
  await writeFile(temp, data)
  await rename(temp, path)
}

async function paint(image: Buffer, boxes: Array<{ left: number; top: number; width: number; height: number }>): Promise<Buffer> {
  const meta = await sharp(image, { failOn: 'none' }).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  const overlays: OverlayOptions[] = []
  for (const box of boxes) {
    const left = Math.max(0, Math.floor(box.left))
    const top = Math.max(0, Math.floor(box.top))
    const right = Math.min(width, Math.ceil(box.left + box.width))
    const bottom = Math.min(height, Math.ceil(box.top + box.height))
    if (right <= left || bottom <= top) continue
    overlays.push({ input: { create: { width: right - left, height: bottom - top, channels: 3, background: '#000000' } }, left, top })
  }
  if (overlays.length === 0) return image
  return sharp(image, { failOn: 'none' }).composite(overlays).png({ compressionLevel: 9 }).toBuffer()
}

async function redactImage(path: string, extension: string, options: RedactOptions, ctx: Parameters<ToolRunner>[2]): Promise<string> {
  const boxes = validBoxes(options.boxes)
  if (boxes.length === 0) throw new EngineError('unsupported', 'Es sind keine Bereiche zum Schwärzen markiert')
  const raw = await normalizeImage(await readFile(path), extension)
  ctx.progress(30, null)
  let base: Buffer
  try {
    base = await sharp(raw, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).png().toBuffer()
  } catch {
    throw new EngineError('unreadable', 'Das Bild konnte nicht gelesen werden')
  }
  const painted = await paint(base, boxes.map((box) => ({ left: box.x, top: box.y, width: box.width, height: box.height })))
  const keepFormat = extension === 'jpg' || extension === 'jpeg' ? 'jpg' : 'png'
  const output = nextOutputPath(path, options.outputDir, existsSync, 'geschwaerzt', `.${keepFormat}`)
  const bytes = keepFormat === 'jpg' ? await sharp(painted).jpeg({ quality: 92, mozjpeg: true }).toBuffer() : painted
  await writeAtomic(output, bytes)
  return output
}

async function redactPdf(path: string, options: RedactOptions, ctx: Parameters<ToolRunner>[2]): Promise<{ output: string; pages: number[] }> {
  const boxes = validBoxes(options.boxes)
  if (boxes.length === 0) throw new EngineError('unsupported', 'Es sind keine Bereiche zum Schwärzen markiert')
  const raw = new Uint8Array(await readFile(path))
  const source = await PDFDocument.load(raw, { updateMetadata: false }).catch((error: unknown) => {
    if (error instanceof Error && /encrypt/i.test(error.message)) throw new EngineError('password', 'Die Datei ist passwortgeschützt')
    throw new EngineError('unreadable', 'Die PDF-Datei konnte nicht gelesen werden')
  })
  const total = source.getPageCount()
  const byPage = new Map<number, RedactBox[]>()
  for (const box of boxes) {
    if (box.page > total) throw new EngineError('unsupported', `Seite ${box.page} gibt es nicht`)
    byPage.set(box.page, [...(byPage.get(box.page) ?? []), box])
  }
  const document = await openPdf(raw)
  const target = await PDFDocument.create()
  try {
    const info = await document.info()
    const pages = [...byPage.keys()].sort((a, b) => a - b)
    let done = 0
    for (let number = 1; number <= total; number += 1) {
      if (ctx.signal.aborted) throw new CancelledError()
      const hits = byPage.get(number)
      if (!hits) {
        const [copied] = await target.copyPages(source, [number - 1])
        if (copied) target.addPage(copied)
        continue
      }
      ctx.progress(5 + (done / pages.length) * 80, `Seite ${number} wird geschwärzt`)
      const size = info.sizes[number - 1] ?? { width: 595, height: 842 }
      const rendered = await document.render(number, { dpi: DPI, format: 'png', maxSide: 6000 })
      const scaleX = rendered.width / size.width
      const scaleY = rendered.height / size.height
      const pad = 1.5
      const painted = await paint(
        Buffer.from(rendered.data),
        hits.map((box) => ({ left: (box.x - pad) * scaleX, top: (box.y - pad) * scaleY, width: (box.width + pad * 2) * scaleX, height: (box.height + pad * 2) * scaleY }))
      )
      const embedded = await target.embedPng(painted)
      const page = target.addPage([size.width, size.height])
      page.drawImage(embedded, { x: 0, y: 0, width: size.width, height: size.height })
      done += 1
    }
    target.setProducer('Kerf')
    target.setCreator('Kerf')
    const bytes = await target.save()

    ctx.progress(90, 'Ergebnis wird geprüft')
    const check = await openPdf(bytes)
    try {
      const terms = options.checkTerms.map((term) => term.trim()).filter(Boolean)
      if (terms.length) {
        const left = await check.find(terms.map(escapeRegex), 'gi')
        const onChanged = left.filter((hit) => byPage.has(hit.page))
        if (onChanged.length > 0) throw new EngineError('unknown', 'Die Prüfung hat noch lesbaren Text gefunden. Es wurde nichts gespeichert')
      }
      for (const number of pages) {
        if ((await check.text(number)).trim().length > 0) throw new EngineError('unknown', 'Geschwärzte Seiten enthalten noch Text. Es wurde nichts gespeichert')
      }
    } finally {
      await check.close()
    }
    const output = nextOutputPath(path, options.outputDir, existsSync, 'geschwaerzt', '.pdf')
    await writeAtomic(output, bytes)
    return { output, pages }
  } finally {
    await document.close()
  }
}

export const redactTool: ToolRunner = async (job, rawOptions, ctx) => {
  const options = withDefaults(defaults, rawOptions)
  const input = job.paths[0]
  if (!input) throw new EngineError('missing', 'Keine Datei angegeben')
  if (!existsSync(input)) throw new EngineError('missing', 'Die Datei wurde nicht gefunden')
  const extension = extensionOf(input)
  ctx.progress(2, null)
  if (extension === 'pdf') {
    const { output, pages } = await redactPdf(input, options, ctx)
    return {
      outputs: [output],
      detail: 'Betroffene Seiten sind jetzt Bilder. Der Text darunter ist wirklich entfernt',
      data: { pages, boxes: validBoxes(options.boxes).length },
      summary: `${validBoxes(options.boxes).length} Bereiche auf ${pages.length} ${pages.length === 1 ? 'Seite' : 'Seiten'} geschwärzt`
    }
  }
  if (IMAGE_EXT.includes(extension)) {
    const output = await redactImage(input, extension, options, ctx)
    return { outputs: [output], summary: `${validBoxes(options.boxes).length} Bereiche geschwärzt`, data: { pages: [1], boxes: validBoxes(options.boxes).length } }
  }
  throw new EngineError('unsupported', 'Schwärzen geht für PDF und Bilder')
}
