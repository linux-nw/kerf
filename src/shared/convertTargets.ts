import { extensionOf } from './tools'
import type { Capabilities } from './types'

export type SourceKind = 'image' | 'pdf' | 'writer' | 'calc' | 'impress' | 'visio' | 'markdown' | 'html' | 'txt' | 'csv' | 'json' | 'yaml' | 'xml' | 'audio' | 'video'

export interface Target {
  id: string
  label: string
  group: string
  hint?: string
  needs?: 'libreoffice' | 'ffmpeg'
  folder?: boolean
}

const IMAGE = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'tif', 'tiff', 'bmp', 'svg', 'heic', 'heif', 'ico']
const AUDIO = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac']
const VIDEO = ['mp4', 'mkv', 'webm', 'mov', 'avi']

export function sourceKind(extension: string): SourceKind | null {
  const ext = extension.toLowerCase()
  if (IMAGE.includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (['doc', 'docx', 'rtf', 'odt'].includes(ext)) return 'writer'
  if (['xls', 'xlsx', 'ods'].includes(ext)) return 'calc'
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'impress'
  if (['vsdx', 'pub'].includes(ext)) return 'visio'
  if (['md', 'markdown'].includes(ext)) return 'markdown'
  if (['html', 'htm'].includes(ext)) return 'html'
  if (ext === 'txt') return 'txt'
  if (ext === 'csv') return 'csv'
  if (ext === 'json') return 'json'
  if (['yaml', 'yml'].includes(ext)) return 'yaml'
  if (ext === 'xml') return 'xml'
  if (AUDIO.includes(ext)) return 'audio'
  if (VIDEO.includes(ext)) return 'video'
  return null
}

const canonical = (ext: string) => (ext === 'jpeg' ? 'jpg' : ext === 'tif' ? 'tiff' : ext === 'heif' ? 'heic' : ext === 'htm' ? 'html' : ext === 'yml' ? 'yaml' : ext === 'markdown' ? 'md' : ext)

const imageTargets: Target[] = [
  { id: 'png', label: 'PNG', group: 'Bild', hint: 'Verlustfrei, mit Transparenz' },
  { id: 'jpg', label: 'JPG', group: 'Bild', hint: 'Klein, aber ohne Transparenz' },
  { id: 'webp', label: 'WebP', group: 'Bild', hint: 'Modern und klein' },
  { id: 'avif', label: 'AVIF', group: 'Bild', hint: 'Sehr klein, langsam beim Erzeugen' },
  { id: 'gif', label: 'GIF', group: 'Bild', hint: 'Nur 256 Farben' },
  { id: 'tiff', label: 'TIFF', group: 'Bild' },
  { id: 'bmp', label: 'BMP', group: 'Bild', hint: 'Unkomprimiert, ohne Transparenz' },
  { id: 'ico', label: 'ICO', group: 'Symbol', hint: 'Windows-Symbol mit mehreren Größen' },
  { id: 'favicon', label: 'Favicon-Set', group: 'Symbol', hint: 'ICO, PNGs, Apple-Touch-Icon und Manifest in einem Ordner', folder: true },
  { id: 'pdf', label: 'PDF', group: 'Dokument', hint: 'Bild als PDF-Seite' }
]

const officePdf: Target = { id: 'pdf', label: 'PDF', group: 'Dokument' }
const writerTargets: Target[] = [
  officePdf,
  { id: 'docx', label: 'DOCX', group: 'Office', needs: 'libreoffice' },
  { id: 'odt', label: 'ODT', group: 'Office', needs: 'libreoffice' },
  { id: 'rtf', label: 'RTF', group: 'Office', needs: 'libreoffice' },
  { id: 'txt', label: 'TXT', group: 'Text', needs: 'libreoffice' },
  { id: 'html', label: 'HTML', group: 'Text', needs: 'libreoffice' }
]
const calcTargets: Target[] = [
  officePdf,
  { id: 'xlsx', label: 'XLSX', group: 'Office', needs: 'libreoffice' },
  { id: 'ods', label: 'ODS', group: 'Office', needs: 'libreoffice' },
  { id: 'csv', label: 'CSV', group: 'Daten', needs: 'libreoffice' },
  { id: 'html', label: 'HTML', group: 'Text', needs: 'libreoffice' }
]
const impressTargets: Target[] = [officePdf, { id: 'pptx', label: 'PPTX', group: 'Office', needs: 'libreoffice' }, { id: 'odp', label: 'ODP', group: 'Office', needs: 'libreoffice' }]

export function allTargets(extension: string): Target[] {
  const kind = sourceKind(extension)
  const ext = canonical(extension.toLowerCase())
  let list: Target[] = []
  if (kind === 'image') list = imageTargets
  else if (kind === 'pdf') {
    list = [
      { id: 'png', label: 'PNG pro Seite', group: 'Bild', hint: 'Jede Seite als Bild in einem Ordner', folder: true },
      { id: 'jpg', label: 'JPG pro Seite', group: 'Bild', hint: 'Jede Seite als Bild in einem Ordner', folder: true },
      { id: 'txt', label: 'TXT', group: 'Text', hint: 'Enthaltenen Text auslesen. Bei Scans zuerst Texterkennung nutzen' }
    ]
  } else if (kind === 'writer') {
    list = writerTargets
    if (ext === 'docx') list = [...writerTargets.filter((t) => t.id !== 'txt' && t.id !== 'html'), { id: 'txt', label: 'TXT', group: 'Text' }, { id: 'html', label: 'HTML', group: 'Text' }]
  } else if (kind === 'calc') {
    list = calcTargets
    if (ext === 'xlsx') list = [...calcTargets.filter((t) => t.id !== 'csv'), { id: 'csv', label: 'CSV', group: 'Daten' }, { id: 'json', label: 'JSON', group: 'Daten' }]
  } else if (kind === 'impress') list = impressTargets
  else if (kind === 'visio') list = [officePdf]
  else if (kind === 'markdown') list = [{ id: 'html', label: 'HTML', group: 'Text' }, officePdf, { id: 'txt', label: 'TXT', group: 'Text' }]
  else if (kind === 'html') list = [officePdf, { id: 'txt', label: 'TXT', group: 'Text' }]
  else if (kind === 'txt') list = [officePdf, { id: 'html', label: 'HTML', group: 'Text' }]
  else if (kind === 'csv') list = [{ id: 'json', label: 'JSON', group: 'Daten' }, { id: 'xlsx', label: 'XLSX', group: 'Daten' }, { id: 'html', label: 'HTML', group: 'Text' }, officePdf]
  else if (kind === 'json') list = [{ id: 'csv', label: 'CSV', group: 'Daten' }, { id: 'yaml', label: 'YAML', group: 'Daten' }, { id: 'xml', label: 'XML', group: 'Daten' }, { id: 'xlsx', label: 'XLSX', group: 'Daten' }]
  else if (kind === 'yaml') list = [{ id: 'json', label: 'JSON', group: 'Daten' }]
  else if (kind === 'xml') list = [{ id: 'json', label: 'JSON', group: 'Daten' }]
  else if (kind === 'audio') {
    list = [
      { id: 'mp3', label: 'MP3', group: 'Audio', needs: 'ffmpeg' },
      { id: 'wav', label: 'WAV', group: 'Audio', needs: 'ffmpeg' },
      { id: 'flac', label: 'FLAC', group: 'Audio', needs: 'ffmpeg' },
      { id: 'ogg', label: 'OGG', group: 'Audio', needs: 'ffmpeg' },
      { id: 'm4a', label: 'M4A', group: 'Audio', needs: 'ffmpeg' }
    ]
  } else if (kind === 'video') {
    list = [
      { id: 'mp4', label: 'MP4', group: 'Video', needs: 'ffmpeg' },
      { id: 'mkv', label: 'MKV', group: 'Video', needs: 'ffmpeg' },
      { id: 'webm', label: 'WebM', group: 'Video', needs: 'ffmpeg' },
      { id: 'gif', label: 'GIF', group: 'Video', hint: 'Animiertes GIF aus dem Video', needs: 'ffmpeg' },
      { id: 'mp3', label: 'MP3', group: 'Audio', hint: 'Tonspur extrahieren', needs: 'ffmpeg' },
      { id: 'wav', label: 'WAV', group: 'Audio', hint: 'Tonspur extrahieren', needs: 'ffmpeg' },
      { id: 'm4a', label: 'M4A', group: 'Audio', hint: 'Tonspur extrahieren', needs: 'ffmpeg' }
    ]
  }
  return list.filter((target) => target.id !== ext)
}

export interface AvailableTarget extends Target {
  available: boolean
  reason: string | null
}

export function targetsFor(extension: string, caps: Pick<Capabilities, 'libreoffice' | 'ffmpeg'> | null): AvailableTarget[] {
  return allTargets(extension).map((target) => {
    if (target.needs === 'libreoffice' && !caps?.libreoffice) return { ...target, available: false, reason: 'Dafür braucht Kerf LibreOffice' }
    if (target.needs === 'ffmpeg' && !caps?.ffmpeg) return { ...target, available: false, reason: 'FFmpeg wurde nicht gefunden' }
    return { ...target, available: true, reason: null }
  })
}

export function commonTargets(paths: string[], caps: Pick<Capabilities, 'libreoffice' | 'ffmpeg'> | null): AvailableTarget[] {
  const lists = paths.map((path) => targetsFor(extensionOf(path), caps))
  const first = lists[0]
  if (!first) return []
  return first.filter((target) => lists.every((list) => list.some((other) => other.id === target.id)))
}

export function lossWarning(source: string, target: string): string | null {
  const from = canonical(source.toLowerCase())
  if (target === 'jpg' && ['png', 'webp', 'avif', 'gif', 'svg', 'ico', 'tiff', 'heic'].includes(from)) return 'Transparenz geht verloren. Transparente Stellen werden weiß.'
  if (target === 'bmp') return 'BMP kennt keine Transparenz. Transparente Stellen werden weiß.'
  if (target === 'gif') return 'GIF hat nur 256 Farben. Fotos sehen danach körnig aus.'
  if (['jpg', 'webp', 'avif'].includes(target) && ['png', 'tiff', 'bmp'].includes(from)) return 'Das Format speichert verlustbehaftet. Die Qualität sinkt leicht.'
  if (target === 'txt' && from === 'pdf') return 'Es wird nur vorhandener Text ausgelesen. Bei Scans kommt nichts heraus, dafür gibt es die Texterkennung.'
  if (from === 'heic' && target === 'jpg') return 'HEIC-Fotos werden als JPG gespeichert, die EXIF-Daten bleiben nicht erhalten.'
  return null
}
