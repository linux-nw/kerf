export type ToolId = 'compress' | 'convert' | 'pdf' | 'ocr' | 'metaread' | 'metaclean' | 'redact' | 'hash' | 'archive'

export type NavId = ToolId | 'history' | 'settings'

export interface ToolMeta {
  id: ToolId
  label: string
  title: string
  subtitle: string
  group: 'tools' | 'privacy' | 'more'
  accept: string[] | '*'
  acceptLabel: string
}

export const IMAGE_INPUT = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'tif', 'tiff', 'bmp', 'svg', 'heic', 'heif', 'ico']
export const OFFICE_INPUT = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf', 'odt', 'ods', 'odp', 'vsdx', 'pub']
export const TEXT_INPUT = ['md', 'markdown', 'html', 'htm', 'txt', 'csv', 'json', 'yaml', 'yml', 'xml']
export const MEDIA_INPUT = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'mp4', 'mkv', 'webm', 'mov', 'avi']
export const SCAN_INPUT = ['pdf', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'webp', 'gif']
export const CLEANABLE = ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'avif', 'pdf', 'docx', 'xlsx', 'pptx']

export const TOOLS: ToolMeta[] = [
  {
    id: 'compress',
    label: 'Komprimieren',
    title: 'Komprimieren',
    subtitle: 'PDFs, Bilder und Dokumente verkleinern.',
    group: 'tools',
    accept: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'tif', 'tiff', 'svg', 'docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'epub'],
    acceptLabel: 'PDF, Bilder, SVG, Office, ODF, EPUB'
  },
  {
    id: 'convert',
    label: 'Konvertieren',
    title: 'Konvertieren',
    subtitle: 'Bilder, Office, Text, Daten, Audio und Video in andere Formate umwandeln.',
    group: 'tools',
    accept: [...IMAGE_INPUT, ...OFFICE_INPUT, ...TEXT_INPUT, ...MEDIA_INPUT, 'pdf'],
    acceptLabel: 'Bilder, Office, Text, Daten, Audio, Video, PDF'
  },
  {
    id: 'pdf',
    label: 'PDF-Werkzeuge',
    title: 'PDF-Werkzeuge',
    subtitle: 'Zusammenführen, teilen, Seiten ordnen, Wasserzeichen und Seitenzahlen.',
    group: 'tools',
    accept: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
    acceptLabel: 'PDF und Bilder'
  },
  {
    id: 'ocr',
    label: 'Texterkennung',
    title: 'Texterkennung',
    subtitle: 'Scans und Fotos in durchsuchbaren Text verwandeln. Mehrere Sprachen, komplett offline.',
    group: 'tools',
    accept: SCAN_INPUT,
    acceptLabel: 'PDF, PNG, JPG, TIFF, BMP, WebP'
  },
  {
    id: 'metaread',
    label: 'Metadaten lesen',
    title: 'Metadaten lesen',
    subtitle: 'EXIF, GPS, Kamera, Autor und mehr aus Dateien anzeigen.',
    group: 'privacy',
    accept: '*',
    acceptLabel: 'Bilder, PDF, Office und mehr'
  },
  {
    id: 'metaclean',
    label: 'Metadaten entfernen',
    title: 'Metadaten entfernen',
    subtitle: 'EXIF, GPS, Autor und Programm aus Dateien entfernen. Das Original bleibt.',
    group: 'privacy',
    accept: CLEANABLE,
    acceptLabel: 'JPG, PNG, WebP, TIFF, AVIF, PDF, DOCX, XLSX, PPTX'
  },
  {
    id: 'redact',
    label: 'Schwärzen',
    title: 'Schwärzen',
    subtitle: 'Stellen in einem PDF endgültig unkenntlich machen. Der Text wird wirklich entfernt.',
    group: 'privacy',
    accept: ['pdf'],
    acceptLabel: 'PDF'
  },
  {
    id: 'hash',
    label: 'Prüfsummen',
    title: 'Prüfsummen',
    subtitle: 'SHA-256, SHA-1, SHA-512 und MD5 berechnen und vergleichen.',
    group: 'more',
    accept: '*',
    acceptLabel: 'Beliebige Dateien'
  },
  {
    id: 'archive',
    label: 'Archive',
    title: 'Archive',
    subtitle: 'ZIP, 7z und tar.gz packen und entpacken, auf Wunsch mit Passwort.',
    group: 'more',
    accept: '*',
    acceptLabel: 'Beliebige Dateien und Ordner'
  }
]

export function toolMeta(id: ToolId): ToolMeta {
  const meta = TOOLS.find((tool) => tool.id === id)
  if (!meta) throw new Error(`Unbekanntes Werkzeug: ${id}`)
  return meta
}

export function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index + 1).toLowerCase() : ''
}

export function accepts(accept: string[] | '*', path: string): boolean {
  if (accept === '*') return true
  return accept.includes(extensionOf(path))
}

export const OCR_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'deu', label: 'Deutsch' },
  { code: 'eng', label: 'Englisch' },
  { code: 'fra', label: 'Französisch' },
  { code: 'spa', label: 'Spanisch' },
  { code: 'ita', label: 'Italienisch' },
  { code: 'nld', label: 'Niederländisch' },
  { code: 'pol', label: 'Polnisch' },
  { code: 'por', label: 'Portugiesisch' },
  { code: 'tur', label: 'Türkisch' },
  { code: 'ces', label: 'Tschechisch' },
  { code: 'rus', label: 'Russisch' },
  { code: 'ukr', label: 'Ukrainisch' }
]
