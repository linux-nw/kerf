import { EngineError } from '../../errors'
import { packageFile } from '../nodePaths'
import type { PdfInfo } from '@shared/types'

export interface RenderOptions {
  scale?: number
  width?: number
  dpi?: number
  format?: 'png' | 'jpeg'
  quality?: number
  maxSide?: number
}

export interface RenderedPage {
  data: Uint8Array
  width: number
  height: number
}

export interface TextBox {
  str: string
  x: number
  y: number
  width: number
  height: number
}

export interface FoundBox {
  page: number
  x: number
  y: number
  width: number
  height: number
  text: string
}

export interface PdfDocLike {
  info(): Promise<PdfInfo>
  render(page: number, options: RenderOptions): Promise<RenderedPage>
  text(page: number): Promise<string>
  find(patterns: string[], flags: string): Promise<FoundBox[]>
  close(): Promise<void>
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
type PdfDocument = Awaited<ReturnType<PdfJs['getDocument']>['promise']>

let pdfjsPromise: Promise<PdfJs> | null = null

function loadPdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjsPromise
}

const MAX_SIDE = 9000

export class PdfRenderer implements PdfDocLike {
  private constructor(
    private readonly pdfjs: PdfJs,
    private readonly doc: PdfDocument,
    private readonly task: { destroy: () => Promise<void> }
  ) {}

  static async open(bytes: Uint8Array): Promise<PdfRenderer> {
    const pdfjs = await loadPdfjs()
    const fontsDir = `${packageFile('pdfjs-dist', 'standard_fonts')}/`
    const cmapsDir = `${packageFile('pdfjs-dist', 'cmaps')}/`
    try {
      const task = pdfjs.getDocument({
        data: new Uint8Array(bytes),
        standardFontDataUrl: fontsDir,
        cMapUrl: cmapsDir,
        cMapPacked: true,
        disableFontFace: true,
        useSystemFonts: false,
        verbosity: 0
      })
      const doc = await task.promise
      return new PdfRenderer(pdfjs, doc, task)
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      if (name === 'PasswordException') throw new EngineError('password', 'Das PDF ist passwortgeschützt')
      throw new EngineError('unreadable', 'Das PDF konnte nicht gelesen werden')
    }
  }

  get pages(): number {
    return this.doc.numPages
  }

  async info(): Promise<PdfInfo> {
    const sizes: { width: number; height: number }[] = []
    for (let number = 1; number <= this.doc.numPages; number += 1) {
      const page = await this.doc.getPage(number)
      const view = page.getViewport({ scale: 1 })
      sizes.push({ width: view.width, height: view.height })
      page.cleanup()
    }
    return { pages: this.doc.numPages, sizes }
  }

  async render(pageNumber: number, options: RenderOptions = {}): Promise<RenderedPage> {
    const canvasModule = await import('@napi-rs/canvas')
    const page = await this.doc.getPage(pageNumber)
    try {
      const base = page.getViewport({ scale: 1 })
      let scale = options.scale ?? (options.dpi ? options.dpi / 72 : options.width ? options.width / base.width : 1.5)
      const limit = options.maxSide ?? MAX_SIDE
      const longest = Math.max(base.width, base.height) * scale
      if (longest > limit) scale = scale * (limit / longest)
      const viewport = page.getViewport({ scale })
      const width = Math.max(1, Math.ceil(viewport.width))
      const height = Math.max(1, Math.ceil(viewport.height))
      const canvas = canvasModule.createCanvas(width, height)
      const context = canvas.getContext('2d')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      await page.render({ canvasContext: context as never, canvas: canvas as never, viewport }).promise
      const buffer = options.format === 'jpeg' ? canvas.toBuffer('image/jpeg', options.quality ?? 90) : canvas.toBuffer('image/png')
      return { data: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength), width, height }
    } finally {
      page.cleanup()
    }
  }

  private async items(pageNumber: number): Promise<TextBox[]> {
    const page = await this.doc.getPage(pageNumber)
    try {
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const boxes: TextBox[] = []
      for (const item of content.items) {
        if (!('str' in item)) continue
        const transform = this.pdfjs.Util.transform(viewport.transform, item.transform) as number[]
        const a = transform[0] ?? 1
        const b = transform[1] ?? 0
        const c = transform[2] ?? 0
        const d = transform[3] ?? 1
        const e = transform[4] ?? 0
        const f = transform[5] ?? 0
        const fontHeight = Math.hypot(c, d)
        const advance = Math.hypot(a, b)
        const width = item.width * (advance === 0 ? 1 : advance / Math.max(1, Math.hypot(item.transform[0] ?? 1, item.transform[1] ?? 0)))
        boxes.push({ str: item.str + (item.hasEOL ? '\n' : ''), x: e, y: f - fontHeight * 0.9, width, height: fontHeight * 1.2 })
      }
      return boxes
    } finally {
      page.cleanup()
    }
  }

  async text(pageNumber: number): Promise<string> {
    const boxes = await this.items(pageNumber)
    return boxes.map((box) => box.str).join('')
  }

  async find(patterns: string[], flags = 'gi'): Promise<FoundBox[]> {
    const regexes = patterns.map((pattern) => new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`))
    const found: FoundBox[] = []
    for (let number = 1; number <= this.doc.numPages; number += 1) {
      const boxes = await this.items(number)
      let text = ''
      const starts: number[] = []
      for (const box of boxes) {
        starts.push(text.length)
        text += box.str
      }
      for (const regex of regexes) {
        regex.lastIndex = 0
        for (let match = regex.exec(text); match; match = regex.exec(text)) {
          if (match[0] === '') {
            regex.lastIndex += 1
            continue
          }
          const from = match.index
          const to = from + match[0].length
          for (const [index, box] of boxes.entries()) {
            const start = starts[index] ?? 0
            const length = box.str.replace(/\n$/, '').length
            const end = start + length
            if (end <= from || start >= to || length === 0) continue
            const localFrom = Math.max(0, from - start)
            const localTo = Math.min(length, to - start)
            const unit = box.width / length
            const pad = Math.min(unit, 3)
            const x = box.x + localFrom * unit - (localFrom > 0 ? pad : 0)
            const width = (localTo - localFrom) * unit + (localFrom > 0 ? pad : 0) + (localTo < length ? pad : 0)
            found.push({ page: number, x: Math.max(0, x), y: box.y, width, height: box.height, text: match[0] })
          }
        }
      }
    }
    return found
  }

  async close(): Promise<void> {
    await this.task.destroy()
  }
}

export const PATTERNS: Record<string, string> = {
  email: String.raw`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`,
  iban: String.raw`\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b`,
  phone: String.raw`(?:\+|00)?\d{2,4}[\s/\-]?\(?\d{2,5}\)?(?:[\s/\-]?\d{2,}){2,}`,
  date: String.raw`\b\d{1,2}\.\d{1,2}\.\d{2,4}\b`
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
