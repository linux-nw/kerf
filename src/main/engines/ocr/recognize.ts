import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createWorker, OEM, PSM, type Block, type Page, type Worker } from 'tesseract.js'
import { CancelledError, EngineError } from '../../errors'
import { packageDir, unpackedPath } from '../nodePaths'
import { tessdataDir } from './paths'
import { prepareImage, type PreparedImage, type Variant } from './prepare'
import type { RawLine, RawPage } from './postprocess'

export interface OcrPageOutput {
  raw: RawPage
  confidence: number
  words: number
  pdf: Uint8Array | null
  width: number
  height: number
}

export interface OcrSession {
  recognize(image: Buffer, wantPdf: boolean): Promise<OcrPageOutput>
  close(): Promise<void>
}

export function availableLanguages(): string[] {
  const dir = tessdataDir()
  const found: string[] = []
  for (const code of ['deu', 'eng', 'fra', 'spa', 'ita', 'nld', 'pol', 'por', 'tur', 'ces', 'rus', 'ukr']) {
    if (existsSync(join(dir, `${code}.traineddata.gz`))) found.push(code)
  }
  return found
}

function toRaw(page: Page, prepared: PreparedImage): { raw: RawPage; words: number } {
  const paragraphs: RawPage['paragraphs'] = []
  let words = 0
  for (const block of (page.blocks ?? []) as Block[]) {
    for (const paragraph of block.paragraphs) {
      const lines: RawLine[] = paragraph.lines.map((line) => {
        const lineWords = line.words.map((word) => ({ text: word.text, confidence: word.confidence }))
        words += lineWords.length
        return {
          text: line.words.map((word) => word.text).join(' '),
          confidence: line.confidence,
          x0: line.bbox.x0,
          y0: line.bbox.y0,
          x1: line.bbox.x1,
          y1: line.bbox.y1,
          words: lineWords
        }
      })
      if (lines.length) paragraphs.push({ lines })
    }
  }
  return { raw: { width: prepared.width, height: prepared.height, paragraphs }, words }
}

export async function openOcr(languages: string[], signal: AbortSignal): Promise<OcrSession> {
  const dir = tessdataDir()
  const missing = languages.filter((code) => !existsSync(join(dir, `${code}.traineddata.gz`)))
  if (missing.length) throw new EngineError('toolmissing', `Sprachdaten fehlen: ${missing.join(', ')}`)
  if (signal.aborted) throw new CancelledError()

  let worker: Worker
  try {
    worker = await createWorker(languages, OEM.LSTM_ONLY, {
      langPath: dir,
      gzip: true,
      cacheMethod: 'none',
      workerPath: unpackedPath(join(packageDir('tesseract.js'), 'src', 'worker-script', 'node', 'index.js')),
      corePath: unpackedPath(packageDir('tesseract.js-core')),
      logger: () => undefined,
      errorHandler: () => undefined
    })
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '0', user_defined_dpi: '300' })
  } catch (error) {
    throw new EngineError('unknown', `Die Texterkennung konnte nicht gestartet werden: ${error instanceof Error ? error.message : String(error)}`)
  }

  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    await worker.terminate().catch(() => undefined)
  }
  const onAbort = () => void close()
  signal.addEventListener('abort', onAbort, { once: true })

  const run = async (prepared: PreparedImage, wantPdf: boolean) => {
    if (signal.aborted) throw new CancelledError()
    const result = await worker.recognize(prepared.data, { pdfTitle: 'Kerf', pdfTextOnly: true }, { blocks: true, pdf: wantPdf })
    if (signal.aborted) throw new CancelledError()
    return result.data
  }

  return {
    async recognize(image, wantPdf) {
      try {
        const base = await prepareImage(image, 'base')
        let best: { page: Page; prepared: PreparedImage } = { page: await run(base, wantPdf), prepared: base }
        if (best.page.confidence < 72) {
          const alt = await prepareImage(image, 'alt' satisfies Variant)
          const second = await run(alt, wantPdf)
          if (second.confidence > best.page.confidence + 2) best = { page: second, prepared: alt }
        }
        const { raw, words } = toRaw(best.page, best.prepared)
        const pdf = wantPdf && best.page.pdf ? Uint8Array.from(best.page.pdf) : null
        return { raw, confidence: best.page.confidence, words, pdf, width: best.prepared.width, height: best.prepared.height }
      } catch (error) {
        if (signal.aborted) throw new CancelledError()
        if (error instanceof EngineError || error instanceof CancelledError) throw error
        throw new EngineError('unknown', `Texterkennung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    async close() {
      signal.removeEventListener('abort', onAbort)
      await close()
    }
  }
}
