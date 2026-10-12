import { Buffer } from 'node:buffer'
import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import { marked } from 'marked'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { EngineError } from '../../errors'
import { htmlToPdf, wrapHtml } from './htmlPdf'

export interface TextResult {
  extension: string
  bytes: Uint8Array
}

const encoder = new TextEncoder()
const BOM = '﻿'

function decode(input: Buffer): string {
  if (input[0] === 0xff && input[1] === 0xfe) return new TextDecoder('utf-16le').decode(input.subarray(2))
  if (input[0] === 0xfe && input[1] === 0xff) return new TextDecoder('utf-16be').decode(input.subarray(2))
  const text = new TextDecoder('utf-8', { fatal: false }).decode(input)
  if (text.includes('�')) {
    const latin = new TextDecoder('windows-1252').decode(input)
    return latin.replace(/^﻿/, '')
  }
  return text.replace(/^﻿/, '')
}

export function htmlToText(html: string): string {
  const entities: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" }
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote|pre|ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (match) => entities[match] ?? match)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const counts = [',', ';', '\t'].map((delimiter) => [delimiter, firstLine.split(delimiter).length - 1] as const)
  counts.sort((a, b) => b[1] - a[1])
  return counts[0] && counts[0][1] > 0 ? counts[0][0] : ','
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] as string
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else quoted = false
      } else field += char
    } else if (char === '"') quoted = true
    else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else field += char
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((entry) => entry.length > 1 || (entry[0] ?? '') !== '')
}

export function toCsv(rows: unknown[][], delimiter = ';'): string {
  const cell = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
    return text.includes(delimiter) || text.includes('"') || /[\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return rows.map((row) => row.map(cell).join(delimiter)).join('\r\n') + '\r\n'
}

function typed(value: string): string | number {
  return /^-?(0|[1-9]\d*)(\.\d+)?$/.test(value) ? Number(value) : value
}

export function csvToObjects(text: string): Record<string, string | number>[] {
  const rows = parseCsv(text)
  const header = rows[0]
  if (!header) return []
  return rows.slice(1).map((row) => Object.fromEntries(header.map((name, index) => [name === '' ? `Spalte ${index + 1}` : name, typed(row[index] ?? '')])))
}

function flatten(value: unknown): unknown[][] {
  const list = Array.isArray(value) ? value : [value]
  const objects = list.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
  if (objects.length === 0) return list.map((item) => [item])
  const keys: string[] = []
  for (const item of objects) for (const key of Object.keys(item)) if (!keys.includes(key)) keys.push(key)
  return [keys, ...objects.map((item) => keys.map((key) => item[key]))]
}

async function readXlsxRows(input: Buffer): Promise<{ sheet: string; data: unknown[][] }[]> {
  const module = await import('read-excel-file/node')
  try {
    const sheets = (await module.default(input)) as { sheet: string; data: unknown[][] }[]
    return sheets
  } catch {
    throw new EngineError('unreadable', 'Die Excel-Datei konnte nicht gelesen werden')
  }
}

async function writeXlsx(rows: unknown[][]): Promise<Uint8Array> {
  const module = await import('write-excel-file/node')
  const sheet = rows.map((row, rowIndex) =>
    row.map((value) => {
      if (value === null || value === undefined || value === '') return null
      if (typeof value === 'number') return { value, type: Number }
      if (typeof value === 'boolean') return { value, type: Boolean }
      if (value instanceof Date) return { value, type: Date }
      const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
      return rowIndex === 0 ? { value: text, fontWeight: 'bold' as const } : { value: text }
    })
  )
  const buffer = await (module.default as unknown as (data: unknown) => { toBuffer: () => Promise<Buffer> })(sheet).toBuffer()
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

function tableHtml(rows: unknown[][]): string {
  const [head, ...body] = rows
  const cells = (row: unknown[], tag: string) => `<tr>${row.map((cell) => `<${tag}>${escapeHtml(cell === null || cell === undefined ? '' : String(cell))}</${tag}>`).join('')}</tr>`
  return `<table>${head ? `<thead>${cells(head, 'th')}</thead>` : ''}<tbody>${body.map((row) => cells(row, 'td')).join('')}</tbody></table>`
}

async function docxToHtml(input: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const convert = (mammoth.default ?? mammoth) as typeof import('mammoth')
  try {
    return (await convert.convertToHtml({ buffer: input })).value
  } catch {
    throw new EngineError('unreadable', 'Das Word-Dokument konnte nicht gelesen werden')
  }
}

async function docxToText(input: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const convert = (mammoth.default ?? mammoth) as typeof import('mammoth')
  try {
    return (await convert.extractRawText({ buffer: input })).value
  } catch {
    throw new EngineError('unreadable', 'Das Word-Dokument konnte nicht gelesen werden')
  }
}

function asHtmlBytes(title: string, body: string): Uint8Array {
  return encoder.encode(wrapHtml(title, body))
}

export const TEXT_SOURCES = ['md', 'markdown', 'html', 'htm', 'txt', 'csv', 'json', 'yaml', 'yml', 'xml']

export async function convertText(input: Buffer, source: string, target: string, title: string): Promise<TextResult> {
  const ext = source === 'markdown' ? 'md' : source === 'htm' ? 'html' : source === 'yml' ? 'yaml' : source

  if (ext === 'docx') {
    if (target === 'html') return { extension: 'html', bytes: asHtmlBytes(title, await docxToHtml(input)) }
    if (target === 'txt') return { extension: 'txt', bytes: encoder.encode(await docxToText(input)) }
    if (target === 'pdf') return { extension: 'pdf', bytes: await htmlToPdf(wrapHtml(title, await docxToHtml(input))) }
  }

  if (ext === 'xlsx') {
    const sheets = await readXlsxRows(input)
    if (target === 'csv') return { extension: 'csv', bytes: encoder.encode(BOM + toCsv(sheets[0]?.data ?? [])) }
    if (target === 'json') {
      const result: Record<string, unknown[]> = {}
      for (const sheet of sheets) {
        const [header, ...rows] = sheet.data
        result[sheet.sheet] = header ? rows.map((row) => Object.fromEntries(header.map((name, index) => [String(name ?? `Spalte ${index + 1}`), row[index] ?? null]))) : []
      }
      return { extension: 'json', bytes: encoder.encode(JSON.stringify(sheets.length === 1 ? Object.values(result)[0] : result, null, 2)) }
    }
    if (target === 'pdf') {
      const body = sheets.map((sheet) => `<h2>${escapeHtml(sheet.sheet)}</h2>${tableHtml(sheet.data)}`).join('')
      return { extension: 'pdf', bytes: await htmlToPdf(wrapHtml(title, body)) }
    }
  }

  if (!TEXT_SOURCES.includes(source)) throw new EngineError('unsupported', `Von .${source} nach .${target} wird nicht unterstützt`)
  const text = decode(input)

  if (ext === 'md') {
    const html = (await marked.parse(text, { async: false })) as string
    if (target === 'html') return { extension: 'html', bytes: asHtmlBytes(title, html) }
    if (target === 'pdf') return { extension: 'pdf', bytes: await htmlToPdf(wrapHtml(title, html)) }
    if (target === 'txt') return { extension: 'txt', bytes: encoder.encode(htmlToText(html)) }
  }
  if (ext === 'html') {
    if (target === 'pdf') return { extension: 'pdf', bytes: await htmlToPdf(text) }
    if (target === 'txt') return { extension: 'txt', bytes: encoder.encode(htmlToText(text)) }
  }
  if (ext === 'txt') {
    if (target === 'html') return { extension: 'html', bytes: asHtmlBytes(title, `<pre>${escapeHtml(text)}</pre>`) }
    if (target === 'pdf') return { extension: 'pdf', bytes: await htmlToPdf(wrapHtml(title, `<pre>${escapeHtml(text)}</pre>`)) }
  }
  if (ext === 'csv') {
    if (target === 'json') return { extension: 'json', bytes: encoder.encode(JSON.stringify(csvToObjects(text), null, 2)) }
    if (target === 'xlsx') return { extension: 'xlsx', bytes: await writeXlsx(parseCsv(text).map((row) => row.map(typed))) }
    if (target === 'html') return { extension: 'html', bytes: asHtmlBytes(title, tableHtml(parseCsv(text))) }
    if (target === 'pdf') return { extension: 'pdf', bytes: await htmlToPdf(wrapHtml(title, tableHtml(parseCsv(text)))) }
  }
  if (ext === 'json') {
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      throw new EngineError('unreadable', 'Das ist kein gültiges JSON')
    }
    if (target === 'csv') return { extension: 'csv', bytes: encoder.encode(BOM + toCsv(flatten(value))) }
    if (target === 'xlsx') return { extension: 'xlsx', bytes: await writeXlsx(flatten(value)) }
    if (target === 'yaml') return { extension: 'yaml', bytes: encoder.encode(stringifyYaml(value)) }
    if (target === 'xml') {
      const builder = new XMLBuilder({ format: true, ignoreAttributes: false, attributeNamePrefix: '@_' })
      const root = typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 1 ? value : { root: value }
      return { extension: 'xml', bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(root) as string}`) }
    }
  }
  if (ext === 'yaml' && target === 'json') {
    try {
      return { extension: 'json', bytes: encoder.encode(JSON.stringify(parseYaml(text), null, 2)) }
    } catch {
      throw new EngineError('unreadable', 'Das ist kein gültiges YAML')
    }
  }
  if (ext === 'xml' && target === 'json') {
    try {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
      return { extension: 'json', bytes: encoder.encode(JSON.stringify(parser.parse(text), null, 2)) }
    } catch {
      throw new EngineError('unreadable', 'Das ist kein gültiges XML')
    }
  }
  throw new EngineError('unsupported', `Von .${source} nach .${target} wird nicht unterstützt`)
}
