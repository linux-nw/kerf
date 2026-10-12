import type { OcrBlock, OcrPage } from './types'

export function blocksToText(blocks: OcrBlock[]): string {
  return blocks
    .map((block) => {
      if (block.kind === 'list') return block.items.map((item, index) => (block.ordered ? `${index + 1}. ${item}` : `- ${item}`)).join('\n')
      return block.text
    })
    .join('\n\n')
}

export function pagesToText(pages: OcrPage[]): string {
  return pages
    .map((page) => blocksToText(page.blocks))
    .filter((text) => text.trim())
    .join('\n\n\f\n\n')
    .replace(/\f/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
