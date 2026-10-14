import { CancelledError } from '../../errors'

import type { Document as MuDocument, Page as MuPage, PDFDocument as MuPdfDocument } from 'mupdf'

type MuPdf = typeof import('mupdf')

let mupdfPromise: Promise<MuPdf> | null = null

function loadMupdf(): Promise<MuPdf> {
  mupdfPromise ??= import('mupdf')
  return mupdfPromise
}

export interface StructureOptions {
  subsetFonts: boolean
  effort: number
  signal?: AbortSignal
}

export interface StructureResult {
  bytes: Uint8Array
  fontsSubset: boolean
}

const MAX_CHECKED_PAGES = 12
const CHECK_SCALE = 0.5
const MAX_MEAN_DIFFERENCE = 0.6
const MAX_STRONG_SHARE = 0.0025

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new CancelledError()
}

function sampledPages(count: number): number[] {
  if (count <= MAX_CHECKED_PAGES) return Array.from({ length: count }, (_, index) => index)
  const pages = new Set<number>()
  for (let step = 0; step < MAX_CHECKED_PAGES; step += 1) pages.add(Math.round((step * (count - 1)) / (MAX_CHECKED_PAGES - 1)))
  return [...pages]
}

function requiresPdfA1(doc: MuPdfDocument): boolean {
  try {
    const metadata = doc.getTrailer().get('Root')?.get('Metadata')
    if (!metadata || !metadata.isStream()) return false
    const xml = Buffer.from(metadata.readStream().asUint8Array()).toString('utf8')
    return /pdfaid:part(>|="|=')\s*1\b/.test(xml)
  } catch {
    return false
  }
}

function renderGray(mupdf: MuPdf, page: MuPage): { data: Uint8ClampedArray; width: number; height: number } {
  const pixmap = page.toPixmap(mupdf.Matrix.scale(CHECK_SCALE, CHECK_SCALE), mupdf.ColorSpace.DeviceGray, false)
  try {
    return { data: new Uint8ClampedArray(pixmap.getPixels()), width: pixmap.getWidth(), height: pixmap.getHeight() }
  } finally {
    pixmap.destroy()
  }
}

function pagesMatch(
  mupdf: MuPdf,
  before: MuDocument,
  after: MuDocument,
  signal: AbortSignal | undefined
): boolean {
  if (before.countPages() !== after.countPages()) return false
  for (const index of sampledPages(before.countPages())) {
    throwIfCancelled(signal)
    const pageBefore = before.loadPage(index)
    const pageAfter = after.loadPage(index)
    try {
      const a = renderGray(mupdf, pageBefore)
      const b = renderGray(mupdf, pageAfter)
      if (a.width !== b.width || a.height !== b.height) return false
      let total = 0
      let strong = 0
      for (let position = 0; position < a.data.length; position += 1) {
        const difference = Math.abs((a.data[position] ?? 0) - (b.data[position] ?? 0))
        total += difference
        if (difference > 64) strong += 1
      }
      if (total / a.data.length > MAX_MEAN_DIFFERENCE) return false
      if (strong / a.data.length > MAX_STRONG_SHARE) return false
      const textBefore = pageBefore.toStructuredText('preserve-whitespace').asText()
      const textAfter = pageAfter.toStructuredText('preserve-whitespace').asText()
      if (textBefore !== textAfter) return false
    } finally {
      pageBefore.destroy()
      pageAfter.destroy()
    }
  }
  return true
}

function saveOptions(effort: number, objectStreams: boolean): string {
  const parts = ['garbage=4', 'compress=yes', 'compress-fonts=yes', `compression-effort=${Math.max(0, Math.min(100, Math.round(effort)))}`]
  if (objectStreams) parts.push('objstms=yes')
  return parts.join(',')
}

export async function optimizeStructure(input: Uint8Array, options: StructureOptions): Promise<StructureResult | null> {
  const mupdf = await loadMupdf()
  throwIfCancelled(options.signal)

  const original = mupdf.Document.openDocument(input, 'application/pdf')
  try {
    const pdf = original.asPDF()
    if (!pdf || original.needsPassword() || original.countPages() === 0) return null
    const objectStreams = !requiresPdfA1(pdf)

    const variants = options.subsetFonts ? [true, false] : [false]
    let best: StructureResult | null = null

    for (const subset of variants) {
      throwIfCancelled(options.signal)
      const working = mupdf.Document.openDocument(input, 'application/pdf')
      try {
        const workingPdf = working.asPDF()
        if (!workingPdf) continue
        if (subset) workingPdf.subsetFonts()
        const bytes = new Uint8Array(workingPdf.saveToBuffer(saveOptions(options.effort, objectStreams)).asUint8Array())
        if (bytes.length >= input.length) continue

        const check = mupdf.Document.openDocument(bytes, 'application/pdf')
        try {
          if (!pagesMatch(mupdf, original, check, options.signal)) continue
        } finally {
          check.destroy()
        }
        best = { bytes, fontsSubset: subset }
        break
      } finally {
        working.destroy()
      }
    }
    return best
  } finally {
    original.destroy()
  }
}
