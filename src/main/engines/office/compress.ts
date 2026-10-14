import { posix } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { CancelledError, EngineError } from '../../errors'
import { bmpToPng } from '../image/bmp'
import { compressImageBytes } from '../image/compress'
import { LEVELS, type CompressLevel } from '../pdf/profiles'

export const ZIP_DOCUMENT_EXTENSIONS = new Set(['docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'epub'])

const IMAGE_ENTRY = /\.(jpe?g|png|tiff?|bmp|gif)$/i
const STORED_ENTRY = /\.(jpe?g|png|gif|webp|avif|mp3|mp4|m4a|mov|zip)$/i
const OOXML_DROP = [/^docProps\/thumbnail\.[a-z]+$/i, /^xl\/calcChain\.xml$/i]

function resolveTarget(relsPath: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const base = posix.dirname(posix.dirname(relsPath))
  return posix.normalize(posix.join(base, target))
}

function attribute(tag: string, key: string): string | null {
  const match = new RegExp(`\\b${key}="([^"]*)"`).exec(tag)
  return match?.[1] ?? null
}

function rewriteRelationships(xml: string, relsPath: string, removed: Set<string>, renamed: Map<string, string>): string {
  return xml.replace(/<Relationship\b[^>]*\/>/g, (tag) => {
    if (attribute(tag, 'TargetMode') === 'External') return tag
    const target = attribute(tag, 'Target')
    if (target === null) return tag
    const resolved = resolveTarget(relsPath, target)
    if (removed.has(resolved)) return ''
    if (renamed.has(resolved)) return tag.replace(`Target="${target}"`, `Target="${target.replace(/\.bmp$/i, '.png')}"`)
    return tag
  })
}

function rewriteContentTypes(xml: string, removed: Set<string>, addPng: boolean): string {
  let output = xml.replace(/<Override\b[^>]*\/>/g, (tag) => {
    const part = attribute(tag, 'PartName')
    return part && removed.has(part.replace(/^\//, '')) ? '' : tag
  })
  if (addPng && !/<Default\b[^>]*Extension="png"/i.test(output)) {
    output = output.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>')
  }
  return output
}

export async function compressZipDocumentBytes(
  input: Uint8Array,
  level: CompressLevel,
  report: (fraction: number, step: string) => void,
  signal: AbortSignal
): Promise<Uint8Array> {
  const profile = LEVELS[level]
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(input)
  } catch {
    throw new EngineError('unreadable', 'Die Datei ist beschädigt oder kein gültiges Dokument')
  }

  const names = Object.keys(files)
  const isOoxml = names.includes('[Content_Types].xml')
  const removed = new Set<string>()
  const renamed = new Map<string, string>()
  const replaced = new Map<string, Uint8Array>()

  if (isOoxml) {
    for (const name of names) if (OOXML_DROP.some((pattern) => pattern.test(name))) removed.add(name)
  }

  const images = names.filter((name) => IMAGE_ENTRY.test(name) && !removed.has(name) && !/^(META-INF|Thumbnails)\//i.test(name))
  for (const [index, name] of images.entries()) {
    if (signal.aborted) throw new CancelledError()
    report(index / Math.max(1, images.length), 'Bilder im Dokument werden gerechnet')
    const data = files[name]
    if (!data) continue
    const extension = (name.split('.').pop() ?? '').toLowerCase()
    try {
      if (extension === 'bmp') {
        if (!isOoxml) continue
        const converted = await compressImageBytes(await bmpToPng(Buffer.from(data)), 'png', level, true, profile.officeMaxEdge)
        const target = name.replace(/\.bmp$/i, '.png')
        if (files[target] || converted.length >= data.length) continue
        replaced.set(target, converted)
        renamed.set(name, target)
        continue
      }
      const out = await compressImageBytes(data, extension, level, true, profile.officeMaxEdge)
      if (out.length < data.length) replaced.set(name, out)
    } catch (error) {
      if (error instanceof CancelledError) throw error
    }
  }

  report(0.95, 'Dokument wird gepackt')
  const result: Zippable = {}
  const ordered = names.includes('mimetype') ? ['mimetype', ...names.filter((name) => name !== 'mimetype')] : names
  for (const name of ordered) {
    if (signal.aborted) throw new CancelledError()
    if (removed.has(name) || renamed.has(name) || name.endsWith('/')) continue
    let data = replaced.get(name) ?? files[name]
    if (!data) continue
    if (isOoxml && name.endsWith('.rels')) {
      data = strToU8(rewriteRelationships(strFromU8(data), name, removed, renamed))
    } else if (isOoxml && name === '[Content_Types].xml') {
      data = strToU8(rewriteContentTypes(strFromU8(data), removed, renamed.size > 0))
    }
    const stored = name === 'mimetype' || STORED_ENTRY.test(name)
    result[name] = [data, { level: stored ? 0 : 9 }]
  }
  for (const [name, data] of replaced) {
    if (!result[name]) result[name] = [data, { level: 0 }]
  }
  return zipSync(result)
}
