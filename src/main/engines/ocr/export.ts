import { AlignmentType, Document, HeadingLevel, LevelFormat, Packer, Paragraph, TextRun } from 'docx'
import { PDFDocument, degrees } from 'pdf-lib'
import type { OcrPage } from '@shared/types'

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3] as const

export async function pagesToDocx(pages: OcrPage[], title: string): Promise<Uint8Array> {
  const children: Paragraph[] = []
  const orderedRefs: string[] = []
  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.kind === 'heading') {
        children.push(new Paragraph({ heading: HEADINGS[block.level - 1], children: [new TextRun(block.text)] }))
      } else if (block.kind === 'paragraph') {
        children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun(block.text)] }))
      } else if (block.ordered) {
        const reference = `ol-${orderedRefs.length}`
        orderedRefs.push(reference)
        for (const item of block.items) children.push(new Paragraph({ numbering: { reference, level: 0 }, children: [new TextRun(item)] }))
      } else {
        for (const item of block.items) children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(item)] }))
      }
    }
  }
  if (children.length === 0) children.push(new Paragraph({ children: [] }))
  const indent = { left: 720, hanging: 360 }
  const document = new Document({
    title,
    creator: 'Kerf',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: {
      config: [
        { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent } } }] },
        ...orderedRefs.map((reference) => ({ reference, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent } } }] }))
      ]
    },
    sections: [{ children }]
  })
  return Uint8Array.from(await Packer.toBuffer(document))
}

export interface PageOverlay {
  index: number
  textPdf: Uint8Array
}

export async function overlayText(original: Uint8Array, overlays: PageOverlay[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original, { updateMetadata: false })
  for (const overlay of overlays) {
    const page = doc.getPage(overlay.index)
    const [embedded] = await doc.embedPdf(overlay.textPdf, [0])
    if (!embedded) continue
    const { width, height } = page.getSize()
    const angle = ((page.getRotation().angle % 360) + 360) % 360
    const shownWidth = angle === 90 || angle === 270 ? height : width
    const shownHeight = angle === 90 || angle === 270 ? width : height
    const xScale = shownWidth / embedded.width
    const yScale = shownHeight / embedded.height
    if (angle === 0) page.drawPage(embedded, { x: 0, y: 0, xScale, yScale })
    else if (angle === 90) page.drawPage(embedded, { x: width, y: 0, xScale, yScale, rotate: degrees(90) })
    else if (angle === 180) page.drawPage(embedded, { x: width, y: height, xScale, yScale, rotate: degrees(180) })
    else page.drawPage(embedded, { x: 0, y: height, xScale, yScale, rotate: degrees(270) })
  }
  doc.setProducer('Kerf')
  return doc.save()
}
