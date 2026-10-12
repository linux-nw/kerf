import type { OcrBlock, OcrPage } from '@shared/types'

export interface RawWord {
  text: string
  confidence: number
}

export interface RawLine {
  text: string
  confidence: number
  x0: number
  y0: number
  x1: number
  y1: number
  words: RawWord[]
}

export interface RawParagraph {
  lines: RawLine[]
}

export interface RawPage {
  width: number
  height: number
  paragraphs: RawParagraph[]
}

const LIGATURES: Array<[RegExp, string]> = [
  [/\uFB00/g, 'ff'],
  [/\uFB01/g, 'fi'],
  [/\uFB02/g, 'fl'],
  [/\uFB03/g, 'ffi'],
  [/\uFB04/g, 'ffl'],
  [/\uFB05/g, 'st'],
  [/\uFB06/g, 'st']
]

const BULLET = /^\s*([•●▪■◦○·*‣⁃-]|[–—])\s+(?=\S)/u
const ORDERED = /^\s*(\d{1,3}[.)]|[a-zA-Z][.)]|\(\d{1,3}\)|[ivxIVX]{1,5}[.)])\s+(?=\S)/u
const SENTENCE_END = /[.!?:;…»"”'“)\]]$/u

export function normalizeText(input: string, keepSpaceBeforePunctuation = false): string {
  let text = input.normalize('NFC')
  for (const [pattern, replacement] of LIGATURES) text = text.replace(pattern, replacement)
  text = text
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/\u2026/g, '...')
    .replace(/[ \t]+/g, ' ')
    .trim()
  if (!keepSpaceBeforePunctuation) text = text.replace(/\s+([,.;:!?])(?=\s|$)/g, '$1')
  text = text.replace(/\s+\)/g, ')').replace(/\(\s+/g, '(')
  return text
}

function isNoise(line: RawLine): boolean {
  const text = line.text.trim()
  if (!text) return true
  const letters = (text.match(/[\p{L}\p{N}]/gu) ?? []).length
  const ratio = letters / text.length
  if (letters === 0) return true
  if (line.confidence < 35 && letters < 4) return true
  if (line.confidence < 45 && ratio < 0.45) return true
  if (line.confidence < 25) return true
  return false
}

function cleanLine(line: RawLine): RawLine {
  const kept = line.words.filter((word, index) => {
    const text = word.text.trim()
    if (!text) return false
    if (index === 0 && /^([•●▪■◦○·*‣⁃–—-]|[-–—])$/u.test(text)) return true
    const hasLetter = /[\p{L}\p{N}]/u.test(text)
    if (!hasLetter && word.confidence < 60 && text.length <= 2) return false
    if (word.confidence < 20 && text.length <= 2) return false
    return true
  })
  if (kept.length === line.words.length || kept.length === 0) return line
  const confidence = kept.reduce((sum, word) => sum + word.confidence, 0) / kept.length
  return { ...line, words: kept, text: kept.map((word) => word.text).join(' '), confidence }
}

function endsWithHyphen(text: string): boolean {
  return /[\p{L}]{2,}[-\u2010\u2011]$/u.test(text)
}

export function joinLines(lines: string[]): string {
  let result = ''
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (!result) {
      result = line
      continue
    }
    if (endsWithHyphen(result) && /^\p{Ll}/u.test(line)) {
      result = result.replace(/[-\u2010\u2011]$/u, '') + line
    } else {
      result = `${result} ${line}`
    }
  }
  return result
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function lineHeight(line: RawLine): number {
  return Math.max(1, line.y1 - line.y0)
}

function headingLevel(ratio: number): 1 | 2 | 3 | null {
  if (ratio >= 1.7) return 1
  if (ratio >= 1.4) return 2
  if (ratio >= 1.18) return 3
  return null
}

function isHeadingText(text: string): boolean {
  if (text.length > 110 || text.length < 2) return false
  if (/[.,;]$/.test(text)) return false
  if (BULLET.test(text)) return false
  return true
}

interface Run {
  paragraph: RawParagraph
  lines: RawLine[]
}

function splitRuns(paragraph: RawParagraph, bodyHeight: number): Run[] {
  const runs: Run[] = []
  let current: RawLine[] = []
  const flush = () => {
    if (current.length) runs.push({ paragraph, lines: current })
    current = []
  }
  for (const line of paragraph.lines) {
    const previous = current.at(-1)
    if (previous) {
      const bigger = lineHeight(line) / Math.max(1, lineHeight(previous))
      const gap = line.y0 - previous.y1
      const startsList = BULLET.test(line.text) || ORDERED.test(line.text)
      const inList = current.some((entry) => BULLET.test(entry.text) || ORDERED.test(entry.text))
      const sizeJump = !inList && (bigger > 1.4 || bigger < 0.7)
      if (sizeJump || gap > bodyHeight * 1.1 || (startsList && !inList)) flush()
    }
    current.push(line)
  }
  flush()
  return runs
}

function toList(lines: RawLine[]): OcrBlock | null {
  const items: string[] = []
  let ordered = false
  const texts = lines.map((line) => line.text.trim())
  const markerCount = texts.filter((text) => BULLET.test(text) || ORDERED.test(text)).length
  const bulletCount = texts.filter((text) => BULLET.test(text)).length
  if (markerCount === 0 || (bulletCount === 0 && markerCount < 2)) return null
  for (const text of texts) {
    const bullet = BULLET.exec(text)
    const number = ORDERED.exec(text)
    if (bullet) {
      items.push(text.slice(bullet[0].length).trim())
    } else if (number) {
      ordered = true
      items.push(text.slice(number[0].length).trim())
    } else if (items.length) {
      items[items.length - 1] = joinLines([items[items.length - 1] ?? '', text])
    } else {
      items.push(text)
    }
  }
  if (items.length === 0) return null
  return { kind: 'list', ordered, items: items.map((item) => normalizeText(item)).filter(Boolean) }
}

export interface PostprocessOptions {
  frenchSpacing: boolean
}

export function buildBlocks(page: RawPage, options: PostprocessOptions = { frenchSpacing: false }): OcrBlock[] {
  const lines = page.paragraphs.flatMap((paragraph) => paragraph.lines.filter((line) => !isNoise(line)))
  if (lines.length === 0) return []
  const bodyHeight = median(lines.map(lineHeight))
  const blocks: OcrBlock[] = []

  const norm = (text: string) => normalizeText(text, options.frenchSpacing)

  for (const paragraph of page.paragraphs) {
    const cleaned: RawParagraph = { lines: paragraph.lines.filter((line) => !isNoise(line)).map(cleanLine) }
    if (cleaned.lines.length === 0) continue
    for (const run of splitRuns(cleaned, bodyHeight)) {
      const runHeight = median(run.lines.map(lineHeight))
      const level = headingLevel(runHeight / Math.max(1, bodyHeight))
      const text = norm(joinLines(run.lines.map((line) => line.text)))
      if (!text) continue
      const list = toList(run.lines.map((line) => ({ ...line, text: norm(line.text) })))
      if (list) {
        blocks.push(list)
        continue
      }
      const wholeHeading = level !== null && run.lines.length <= 3 && isHeadingText(text)
      const shortAllCaps = run.lines.length === 1 && text.length <= 60 && /\p{Lu}/u.test(text) && text === text.toLocaleUpperCase() && /\p{L}{3}/u.test(text) && runHeight / Math.max(1, bodyHeight) >= 1.05
      if (wholeHeading) {
        blocks.push({ kind: 'heading', level: level as 1 | 2 | 3, text })
      } else if (shortAllCaps) {
        blocks.push({ kind: 'heading', level: 3, text })
      } else {
        blocks.push({ kind: 'paragraph', text })
      }
    }
  }
  return mergeFlow(blocks)
}

function mergeFlow(blocks: OcrBlock[]): OcrBlock[] {
  const result: OcrBlock[] = []
  for (const block of blocks) {
    const previous = result.at(-1)
    if (previous && previous.kind === 'paragraph' && block.kind === 'paragraph' && !SENTENCE_END.test(previous.text) && /^\p{Ll}/u.test(block.text)) {
      previous.text = joinLines([previous.text, block.text])
      continue
    }
    if (previous && previous.kind === 'heading' && block.kind === 'heading' && previous.level === block.level && !/[.:]$/.test(previous.text) && /^\p{Ll}/u.test(block.text)) {
      previous.text = joinLines([previous.text, block.text])
      continue
    }
    result.push(block)
  }
  return result
}

export function textToBlocks(text: string): OcrBlock[] {
  const blocks: OcrBlock[] = []
  const groups = text.replace(/\r/g, '').split(/\n\s*\n/)
  for (const group of groups) {
    const lines = group.split('\n').map((line) => normalizeText(line)).filter(Boolean)
    if (lines.length === 0) continue
    const fake: RawLine[] = lines.map((line, index) => ({ text: line, confidence: 100, x0: 0, y0: index * 10, x1: 100, y1: index * 10 + 9, words: [] }))
    const list = toList(fake)
    if (list) {
      blocks.push(list)
      continue
    }
    const joined = joinLines(lines)
    if (joined) blocks.push({ kind: 'paragraph', text: joined })
  }
  return mergeFlow(blocks)
}

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

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]<>#|])/g, '\\$1').replace(/^(\s*)(\d+)\./, '$1$2\\.')
}

export function pagesToMarkdown(pages: OcrPage[], pageHeadings: boolean): string {
  const parts: string[] = []
  for (const page of pages) {
    if (pageHeadings && pages.length > 1) parts.push(`<!-- Seite ${page.number} -->`)
    for (const block of page.blocks) {
      if (block.kind === 'heading') parts.push(`${'#'.repeat(block.level)} ${escapeMarkdown(block.text)}`)
      else if (block.kind === 'paragraph') parts.push(escapeMarkdown(block.text))
      else parts.push(block.items.map((item, index) => (block.ordered ? `${index + 1}. ${escapeMarkdown(item)}` : `- ${escapeMarkdown(item)}`)).join('\n'))
    }
  }
  return `${parts.join('\n\n')}\n`
}
