import type { OcrBlock } from '@shared/types'

function stripFence(text: string): string {
  const trimmed = text.trim()
  const match = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(trimmed)
  return match?.[1] ?? trimmed
}

function plain(text: string): string {
  return text
    .replace(/\\([\\`*_{}[\]<>#|.])/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)\*([^*\s][^*]*)\*(?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function markdownToBlocks(markdown: string): OcrBlock[] {
  const lines = stripFence(markdown).replace(/\r/g, '').split('\n')
  const blocks: OcrBlock[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    const text = plain(paragraph.join(' '))
    if (text) blocks.push({ kind: 'paragraph', text })
    paragraph = []
  }
  const flushList = () => {
    if (list && list.items.length > 0) blocks.push({ kind: 'list', ordered: list.ordered, items: list.items })
    list = null
  }

  for (const line of lines) {
    const text = line.trim()
    if (text === '' || /^<!--.*-->$/.test(text)) {
      flushParagraph()
      flushList()
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(text)
    if (heading) {
      flushParagraph()
      flushList()
      const value = plain(heading[2] ?? '')
      if (value) blocks.push({ kind: 'heading', level: Math.min(3, (heading[1] ?? '#').length) as 1 | 2 | 3, text: value })
      continue
    }
    const bullet = /^(?:[-*•–]\s+)(.*)$/.exec(text)
    const numbered = /^(\d{1,3})[.)]\s+(.*)$/.exec(text)
    if (bullet || numbered) {
      flushParagraph()
      const ordered = Boolean(numbered)
      if (list && list.ordered !== ordered) flushList()
      list ??= { ordered, items: [] }
      const value = plain((bullet ? bullet[1] : numbered?.[2]) ?? '')
      if (value) list.items.push(value)
      continue
    }
    flushList()
    paragraph.push(text)
  }
  flushParagraph()
  flushList()
  return blocks
}
