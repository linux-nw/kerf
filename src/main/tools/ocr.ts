import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { extensionOf, OCR_LANGUAGES } from '@shared/tools'
import type { OcrOptions, OcrOutput, OcrPage, OcrResult } from '@shared/types'
import { CancelledError, EngineError } from '../errors'
import { imageToPdf } from '../engines/convert/image'
import { normalizeImage } from '../engines/convert/image'
import { overlayText, pagesToDocx, type PageOverlay } from '../engines/ocr/export'
import { buildBlocks, pagesToMarkdown, pagesToText, textToBlocks } from '../engines/ocr/postprocess'
import { openOcr, type OcrSession } from '../engines/ocr/recognize'
import { openPdf } from '../engines/pdf/open'
import { withDefaults, type ToolRunner } from './types'

const defaults: OcrOptions = { languages: ['deu', 'eng'], outputs: ['pdf', 'txt'], outputDir: null, skipTextPages: true }
const OUTPUT_EXT: Record<OcrOutput, string> = { pdf: '.pdf', txt: '.txt', md: '.md', docx: '.docx' }
const ORDER: OcrOutput[] = ['pdf', 'txt', 'md', 'docx']
const WEAK = 70
const TEXT_PAGE_MIN = 40

function languageNames(codes: string[]): string {
  return codes.map((code) => OCR_LANGUAGES.find((entry) => entry.code === code)?.label ?? code).join(', ')
}

function outputPaths(input: string, outputDir: string | null, outputs: OcrOutput[]): Record<OcrOutput, string> {
  const directory = outputDir ?? dirname(input)
  const base = basename(input, extname(input))
  for (let counter = 1; ; counter += 1) {
    const suffix = counter === 1 ? 'ocr' : `ocr-${counter}`
    const paths = Object.fromEntries(outputs.map((kind) => [kind, join(directory, `${base}.${suffix}${OUTPUT_EXT[kind]}`)])) as Record<OcrOutput, string>
    if (outputs.every((kind) => !existsSync(paths[kind]))) return paths
  }
}

async function writeAtomic(path: string, data: Uint8Array | string): Promise<void> {
  const temp = `${path}.part`
  await writeFile(temp, data)
  await rename(temp, path)
}

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
}

export const ocrTool: ToolRunner = async (job, rawOptions, ctx) => {
  const options = withDefaults(defaults, rawOptions)
  const input = job.paths[0]
  if (!input) throw new EngineError('missing', 'Keine Datei angegeben')
  const extension = extensionOf(input)
  if (!['pdf', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'webp', 'gif'].includes(extension)) {
    throw new EngineError('unsupported', 'Dieser Dateityp kann nicht gelesen werden')
  }
  const languages = options.languages.length ? options.languages : defaults.languages
  const outputs = ORDER.filter((kind) => options.outputs.includes(kind))
  if (outputs.length === 0) throw new EngineError('unsupported', 'Es ist kein Ausgabeformat gewählt')

  let raw: Buffer
  try {
    raw = await readFile(input)
  } catch {
    throw new EngineError('missing', 'Die Datei wurde nicht gefunden')
  }

  const wantPdf = outputs.includes('pdf')
  const pages: OcrPage[] = []
  const overlays: PageOverlay[] = []
  let words = 0
  const holder: { session: OcrSession | null } = { session: null }
  const ensureSession = async () => {
    if (!holder.session) {
      ctx.progress(2, 'Sprachdaten werden geladen')
      holder.session = await openOcr(languages, ctx.signal)
    }
    return holder.session
  }

  try {
    let baseForPdf: Uint8Array | null = null
    if (extension === 'pdf') {
      const document = await openPdf(new Uint8Array(raw))
      try {
        const info = await document.info()
        baseForPdf = new Uint8Array(raw)
        for (let number = 1; number <= info.pages; number += 1) {
          if (ctx.signal.aborted) throw new CancelledError()
          ctx.progress(5 + ((number - 1) / info.pages) * 90, info.pages > 1 ? `Seite ${number} von ${info.pages}` : 'Text wird erkannt')
          if (options.skipTextPages) {
            const existing = (await document.text(number)).trim()
            if (existing.length >= TEXT_PAGE_MIN) {
              const blocks = textToBlocks(existing)
              words += existing.split(/\s+/).length
              pages.push({ number, blocks, confidence: null, source: 'textlayer' })
              continue
            }
          }
          const rendered = await document.render(number, { dpi: 300, format: 'png', maxSide: 5200 })
          const output = await (await ensureSession()).recognize(Buffer.from(rendered.data), wantPdf)
          words += output.words
          pages.push({ number, blocks: buildBlocks(output.raw, { frenchSpacing: languages[0] === 'fra' }), confidence: Math.round(output.confidence), source: 'ocr' })
          if (output.pdf) overlays.push({ index: number - 1, textPdf: output.pdf })
        }
      } finally {
        await document.close()
      }
    } else {
      ctx.progress(5, 'Text wird erkannt')
      const image = await normalizeImage(raw, extension)
      const output = await (await ensureSession()).recognize(image, wantPdf)
      words += output.words
      pages.push({ number: 1, blocks: buildBlocks(output.raw, { frenchSpacing: languages[0] === 'fra' }), confidence: Math.round(output.confidence), source: 'ocr' })
      if (wantPdf && output.pdf) {
        baseForPdf = await imageToPdf(image)
        overlays.push({ index: 0, textPdf: output.pdf })
      }
    }

    if (ctx.signal.aborted) throw new CancelledError()
    const hasText = pages.some((page) => page.blocks.length > 0)
    if (!hasText) throw new EngineError('unsupported', 'Es wurde kein Text erkannt. Bitte prüfe Sprache und Bildqualität')

    ctx.progress(96, 'Ergebnis wird geschrieben')
    const paths = outputPaths(input, options.outputDir, outputs)
    const written: string[] = []
    let note: string | null = null
    for (const kind of outputs) {
      if (kind === 'pdf') {
        if (overlays.length === 0 || !baseForPdf) {
          note = 'Alle Seiten hatten schon Text, deshalb wurde kein neues PDF geschrieben'
          continue
        }
        await writeAtomic(paths.pdf, await overlayText(baseForPdf, overlays))
      } else if (kind === 'txt') {
        await writeAtomic(paths.txt, `﻿${pagesToText(pages)}\n`)
      } else if (kind === 'md') {
        await writeAtomic(paths.md, pagesToMarkdown(pages, true))
      } else {
        await writeAtomic(paths.docx, await pagesToDocx(pages, basename(input, extname(input))))
      }
      written.push(paths[kind])
    }

    const confidences = pages.flatMap((page) => (page.confidence === null ? [] : [page.confidence]))
    const weakPages = pages.filter((page) => page.confidence !== null && page.confidence < WEAK).map((page) => page.number)
    const result: OcrResult = { languages, pages, confidence: average(confidences), words, weakPages }
    const confidenceText = result.confidence === null ? '' : ` · Sicherheit ${result.confidence} %`
    return {
      outputs: written,
      outputSize: null,
      data: result,
      detail: weakPages.length ? `Seite ${weakPages.join(', ')} ist unsicher erkannt. Bitte prüfen` : note,
      summary: `${pages.length} ${pages.length === 1 ? 'Seite' : 'Seiten'} · ${languageNames(languages)}${confidenceText}`
    }
  } finally {
    if (holder.session) await holder.session.close()
  }
}
