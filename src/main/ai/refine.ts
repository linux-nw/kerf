import { OCR_LANGUAGES } from '@shared/tools'
import type { OcrBlock, OcrPage } from '@shared/types'
import { pagesToMarkdown } from '../engines/ocr/postprocess'
import { chat, type AiConnection } from './client'
import { markdownToBlocks } from './markdown'

const CHUNK_CHARS = 3500
const MIN_SIMILARITY = 0.8
const MIN_NUMBERS_KEPT = 0.85

export interface RefineOutcome {
  blocks: OcrBlock[]
  accepted: number
  rejected: number
}

function systemPrompt(languages: string[]): string {
  const names = languages.map((code) => OCR_LANGUAGES.find((entry) => entry.code === code)?.label ?? code).join(', ')
  return [
    `You repair text from an OCR scan. The text is Markdown from one page and written in: ${names}.`,
    'Fix only recognition mistakes: wrong or swapped letters (rn/m, l/1/I, 0/O), broken or glued words, missing or wrong umlauts and accents, wrong punctuation and obvious spacing errors.',
    'Never translate, reword, summarize, reorder, add or remove content.',
    'Keep every heading (#), list item and paragraph break as it is. Keep names, numbers, amounts, dates and codes unless one character is clearly a recognition mistake.',
    'Answer with the corrected Markdown only. No explanation and no code fence.'
  ].join(' ')
}

function words(text: string): string[] {
  return text.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

function distance(a: string[], b: string[]): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row]
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1
      current[column] = Math.min((previous[column] ?? 0) + 1, (current[column - 1] ?? 0) + 1, (previous[column - 1] ?? 0) + cost)
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

export function similarity(original: string, candidate: string): number {
  const a = words(original)
  const b = words(candidate)
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 1
  return 1 - distance(a, b) / longest
}

function numberTokens(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)*/g) ?? []
}

export function isTrustworthy(original: string, candidate: string): boolean {
  if (candidate.trim() === '') return false
  const ratio = candidate.length / Math.max(1, original.length)
  if (ratio < 0.85 || ratio > 1.15) return false
  if (similarity(original, candidate) < MIN_SIMILARITY) return false
  const before = numberTokens(original)
  if (before.length > 0) {
    const pool = new Map<string, number>()
    for (const token of numberTokens(candidate)) pool.set(token, (pool.get(token) ?? 0) + 1)
    let kept = 0
    for (const token of before) {
      const left = pool.get(token) ?? 0
      if (left > 0) {
        kept += 1
        pool.set(token, left - 1)
      }
    }
    if (kept / before.length < MIN_NUMBERS_KEPT) return false
  }
  return true
}

function toMarkdown(blocks: OcrBlock[]): string {
  const page: OcrPage = { number: 1, blocks, confidence: null, source: 'ocr' }
  return pagesToMarkdown([page], false).trim()
}

function chunk(blocks: OcrBlock[]): OcrBlock[][] {
  const groups: OcrBlock[][] = []
  let current: OcrBlock[] = []
  let size = 0
  for (const block of blocks) {
    const length = toMarkdown([block]).length
    if (current.length > 0 && size + length > CHUNK_CHARS) {
      groups.push(current)
      current = []
      size = 0
    }
    current.push(block)
    size += length
  }
  if (current.length > 0) groups.push(current)
  return groups
}

export async function refineBlocks(blocks: OcrBlock[], languages: string[], connection: AiConnection, model: string, signal: AbortSignal): Promise<RefineOutcome> {
  const result: OcrBlock[] = []
  let accepted = 0
  let rejected = 0
  for (const group of chunk(blocks)) {
    const original = toMarkdown(group)
    const reply = await chat(connection, model, [{ role: 'system', content: systemPrompt(languages) }, { role: 'user', content: original }], signal)
    const candidate = markdownToBlocks(reply)
    if (candidate.length > 0 && isTrustworthy(original, toMarkdown(candidate))) {
      result.push(...candidate)
      accepted += 1
    } else {
      result.push(...group)
      rejected += 1
    }
  }
  return { blocks: result, accepted, rejected }
}
