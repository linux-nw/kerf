import { PdfRenderer, type PdfDocLike } from './renderCore'

export type PdfOpener = (bytes: Uint8Array) => Promise<PdfDocLike>

let opener: PdfOpener = (bytes) => PdfRenderer.open(bytes)

export function setPdfOpener(next: PdfOpener): void {
  opener = next
}

export function openPdf(bytes: Uint8Array): Promise<PdfDocLike> {
  return opener(bytes)
}
