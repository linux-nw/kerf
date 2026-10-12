import { spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import exifr from 'exifr'
import { unzipSync } from 'fflate'
import { PDFDocument, PDFName } from 'pdf-lib'
import sharp from 'sharp'
import { extensionOf } from '@shared/tools'
import type { MetaGroup, MetaReport } from '@shared/types'
import { ffmpegBinary } from '../binaries'

const LABELS: Record<string, string> = {
  Make: 'Hersteller',
  Model: 'Modell',
  LensModel: 'Objektiv',
  LensMake: 'Objektivhersteller',
  Software: 'Programm',
  Artist: 'Urheber',
  Copyright: 'Copyright',
  ImageDescription: 'Beschreibung',
  UserComment: 'Kommentar',
  DateTimeOriginal: 'Aufnahmezeitpunkt',
  CreateDate: 'Erstellt',
  ModifyDate: 'Geändert',
  ExposureTime: 'Belichtungszeit',
  FNumber: 'Blende',
  ISO: 'ISO',
  FocalLength: 'Brennweite',
  FocalLengthIn35mmFormat: 'Brennweite (Kleinbild)',
  Flash: 'Blitz',
  WhiteBalance: 'Weißabgleich',
  ExposureProgram: 'Belichtungsprogramm',
  MeteringMode: 'Messmethode',
  Orientation: 'Ausrichtung',
  ColorSpace: 'Farbraum',
  XResolution: 'Auflösung horizontal',
  YResolution: 'Auflösung vertikal',
  ResolutionUnit: 'Einheit der Auflösung',
  ExifImageWidth: 'Breite (EXIF)',
  ExifImageHeight: 'Höhe (EXIF)',
  BodySerialNumber: 'Seriennummer Gehäuse',
  SerialNumber: 'Seriennummer',
  CameraSerialNumber: 'Seriennummer Kamera',
  LensSerialNumber: 'Seriennummer Objektiv',
  OwnerName: 'Besitzer',
  XPAuthor: 'Autor',
  XPComment: 'Kommentar',
  XPTitle: 'Titel',
  XPKeywords: 'Schlagwörter',
  GPSAltitude: 'Höhe',
  GPSSpeed: 'Geschwindigkeit',
  GPSImgDirection: 'Blickrichtung',
  creator: 'Autor',
  title: 'Titel',
  description: 'Beschreibung',
  subject: 'Betreff',
  rights: 'Rechte',
  CreatorTool: 'Erstellprogramm'
}

const CAMERA = ['Make', 'Model', 'LensModel', 'LensMake']
const SHOT = ['DateTimeOriginal', 'CreateDate', 'ExposureTime', 'FNumber', 'ISO', 'FocalLength', 'FocalLengthIn35mmFormat', 'Flash', 'WhiteBalance', 'ExposureProgram', 'MeteringMode']
const AUTHOR = ['Artist', 'Copyright', 'OwnerName', 'XPAuthor', 'creator', 'rights', 'ImageDescription', 'UserComment', 'XPComment', 'XPTitle', 'XPKeywords', 'title', 'description', 'subject']
const SERIAL = ['BodySerialNumber', 'SerialNumber', 'CameraSerialNumber', 'LensSerialNumber']
const SOFTWARE = ['Software', 'ModifyDate', 'CreatorTool']
const HIDDEN = new Set(['MakerNote', 'ThumbnailImage', 'thumbnail', 'PrintIM', 'ComponentsConfiguration', 'ExifVersion', 'FlashpixVersion', 'InteropIndex', 'InteropVersion', 'ApplicationNotes'])

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toLocaleString('de-DE')
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) return `[Binärdaten, ${value.byteLength} Byte]`
  if (Array.isArray(value)) return value.map(formatValue).join(', ')
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000).replace('.', ',')
  if (typeof value === 'object') {
    try {
      const text = JSON.stringify(value)
      return text.length > 200 ? `${text.slice(0, 197)}...` : text
    } catch {
      return ''
    }
  }
  return String(value).replace(/\u0000/g, '').trim()
}

function label(key: string): string {
  return LABELS[key] ?? key
}

function pick(source: Record<string, unknown>, keys: string[]): { key: string; value: string }[] {
  const items: { key: string; value: string }[] = []
  for (const key of keys) {
    const value = formatValue(source[key])
    if (value !== '') items.push({ key: label(key), value })
  }
  return items
}

export function formatCoordinates(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(5).replace('.', ',')}° ${latitude >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(longitude).toFixed(5).replace('.', ',')}° ${longitude >= 0 ? 'O' : 'W'}`
  return `${lat}, ${lon}`
}

function kindOf(extension: string): string {
  const kinds: Record<string, string> = {
    jpg: 'Foto (JPEG)',
    jpeg: 'Foto (JPEG)',
    png: 'Bild (PNG)',
    webp: 'Bild (WebP)',
    avif: 'Bild (AVIF)',
    heic: 'Foto (HEIC)',
    heif: 'Foto (HEIC)',
    tif: 'Bild (TIFF)',
    tiff: 'Bild (TIFF)',
    gif: 'Bild (GIF)',
    pdf: 'PDF-Dokument',
    docx: 'Word-Dokument',
    xlsx: 'Excel-Tabelle',
    pptx: 'PowerPoint-Präsentation',
    mp3: 'Audio (MP3)',
    mp4: 'Video (MP4)',
    mov: 'Video (MOV)',
    m4a: 'Audio (M4A)',
    wav: 'Audio (WAV)',
    flac: 'Audio (FLAC)'
  }
  return kinds[extension] ?? (extension === '' ? 'Datei' : `Datei (.${extension})`)
}

const IMAGE_EXIF = new Set(['jpg', 'jpeg', 'tif', 'tiff', 'heic', 'heif', 'avif', 'webp', 'png'])
const OFFICE = new Set(['docx', 'xlsx', 'pptx'])
const MEDIA = new Set(['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'mp4', 'mkv', 'webm', 'mov', 'avi'])

async function readImage(buffer: Buffer, extension: string, groups: MetaGroup[], sensitive: Set<string>, hints: string[]): Promise<void> {
  let parsed: Record<string, unknown> = {}
  try {
    parsed = ((await exifr.parse(buffer, { tiff: true, ifd0: {}, exif: {}, gps: true, xmp: true, iptc: true, icc: false, jfif: true, interop: false, makerNote: false, userComment: true, translateKeys: true, translateValues: true, reviveValues: true, sanitize: true, mergeOutput: true })) ?? {}) as Record<string, unknown>
  } catch {
    parsed = {}
  }
  let width: number | null = null
  let height: number | null = null
  const imageItems: { key: string; value: string }[] = []
  try {
    const meta = await sharp(buffer, { failOn: 'none' }).metadata()
    width = meta.width ?? null
    height = meta.height ?? null
    if (width && height) imageItems.push({ key: 'Größe', value: `${width} × ${height} Pixel` })
    if (meta.format) imageItems.push({ key: 'Format', value: meta.format.toUpperCase() })
    if (meta.space) imageItems.push({ key: 'Farbraum', value: meta.space })
    if (meta.density) imageItems.push({ key: 'Auflösung', value: `${meta.density} dpi` })
    if (meta.hasAlpha) imageItems.push({ key: 'Transparenz', value: 'ja' })
    if (meta.pages && meta.pages > 1) imageItems.push({ key: 'Einzelbilder', value: String(meta.pages) })
    if (meta.orientation && meta.orientation !== 1) imageItems.push({ key: 'Ausrichtung', value: `EXIF ${meta.orientation}` })
    if (meta.icc) imageItems.push({ key: 'Farbprofil', value: 'eingebettet (ICC)' })
  } catch {
    imageItems.length = 0
  }
  if (imageItems.length > 0) groups.push({ title: 'Bild', items: imageItems })

  const camera = pick(parsed, CAMERA)
  if (camera.length > 0) {
    groups.push({ title: 'Kamera', items: camera })
    sensitive.add('Kameramodell')
  }
  const shot = pick(parsed, SHOT)
  if (shot.length > 0) {
    groups.push({ title: 'Aufnahme', items: shot })
    if (parsed['DateTimeOriginal'] || parsed['CreateDate']) sensitive.add('Aufnahmezeitpunkt')
  }
  const latitude = parsed['latitude']
  const longitude = parsed['longitude']
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    const items = [{ key: 'Position', value: formatCoordinates(latitude, longitude) }]
    const altitude = formatValue(parsed['GPSAltitude'])
    if (altitude) items.push({ key: 'Höhe', value: `${altitude} m` })
    groups.push({ title: 'Standort', items })
    sensitive.add('GPS-Position')
  }
  const serial = pick(parsed, SERIAL)
  if (serial.length > 0) {
    groups.push({ title: 'Seriennummern', items: serial })
    sensitive.add('Seriennummer')
  }
  const author = pick(parsed, AUTHOR)
  if (author.length > 0) {
    groups.push({ title: 'Urheber und Beschreibung', items: author })
    sensitive.add('Name oder Beschreibung')
  }
  const software = pick(parsed, SOFTWARE)
  if (software.length > 0) {
    groups.push({ title: 'Bearbeitung', items: software })
    if (parsed['Software'] || parsed['CreatorTool']) sensitive.add('Bearbeitungsprogramm')
  }

  const used = new Set([...CAMERA, ...SHOT, ...AUTHOR, ...SERIAL, ...SOFTWARE, 'latitude', 'longitude', 'GPSAltitude', 'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef', 'GPSAltitudeRef'])
  const rest = Object.keys(parsed)
    .filter((key) => !used.has(key) && !HIDDEN.has(key))
    .map((key) => ({ key: label(key), value: formatValue(parsed[key]) }))
    .filter((item) => item.value !== '')
    .slice(0, 60)
  if (rest.length > 0) groups.push({ title: 'Weitere Angaben', items: rest })
  if (buffer.includes(Buffer.from('ThumbnailImage')) === false && parsed['thumbnail']) hints.push('Enthält ein eingebettetes Vorschaubild')
  void extension
}

async function readPdf(buffer: Buffer, groups: MetaGroup[], sensitive: Set<string>, hints: string[]): Promise<void> {
  const header = buffer.subarray(0, 16).toString('latin1').match(/%PDF-(\d\.\d)/)
  let encrypted = false
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(buffer, { updateMetadata: false })
  } catch (error) {
    if (error instanceof Error && /encrypted/i.test(error.message)) {
      encrypted = true
      try {
        doc = await PDFDocument.load(buffer, { updateMetadata: false, ignoreEncryption: true })
      } catch {
        groups.push({ title: 'Dokument', items: [{ key: 'Verschlüsselt', value: 'ja' }] })
        return
      }
    } else {
      return
    }
  }
  const info: { key: string; value: string }[] = []
  if (header?.[1]) info.push({ key: 'PDF-Version', value: header[1] })
  info.push({ key: 'Seiten', value: String(doc.getPageCount()) })
  if (encrypted) info.push({ key: 'Verschlüsselt', value: 'ja' })
  groups.push({ title: 'Dokument', items: info })

  const props: { key: string; value: string }[] = []
  const add = (key: string, value: string | undefined, flag?: string) => {
    if (value && value.trim() !== '') {
      props.push({ key, value: value.trim() })
      if (flag) sensitive.add(flag)
    }
  }
  add('Titel', doc.getTitle())
  add('Autor', doc.getAuthor(), 'Autor')
  add('Betreff', doc.getSubject())
  add('Stichwörter', doc.getKeywords())
  add('Erstellt mit', doc.getCreator(), 'Erstellprogramm')
  add('PDF-Erzeuger', doc.getProducer(), 'Erstellprogramm')
  const created = doc.getCreationDate()
  const modified = doc.getModificationDate()
  if (created) {
    props.push({ key: 'Erstellt', value: created.toLocaleString('de-DE') })
    sensitive.add('Zeitstempel')
  }
  if (modified) {
    props.push({ key: 'Geändert', value: modified.toLocaleString('de-DE') })
    sensitive.add('Zeitstempel')
  }
  if (props.length > 0) groups.push({ title: 'Eigenschaften', items: props })
  if (doc.catalog.has(PDFName.of('Metadata'))) {
    groups.push({ title: 'XMP', items: [{ key: 'XMP-Metadaten', value: 'vorhanden' }] })
    sensitive.add('XMP-Metadaten')
  }
  if (doc.catalog.has(PDFName.of('Names'))) hints.push('Enthält Namensverzeichnisse (zum Beispiel Anhänge oder Skripte)')
  if (doc.catalog.has(PDFName.of('AcroForm'))) hints.push('Enthält Formularfelder')
  if (buffer.includes(Buffer.from('/EmbeddedFile'))) hints.push('Enthält eingebettete Dateien')
  if (buffer.includes(Buffer.from('/JavaScript')) || buffer.includes(Buffer.from('/JS '))) hints.push('Enthält JavaScript')
}

function tag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))
  if (!match?.[1]) return null
  return match[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim()
}

async function readOffice(buffer: Buffer, extension: string, groups: MetaGroup[], sensitive: Set<string>, hints: string[]): Promise<void> {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(buffer), { filter: (file) => file.name.startsWith('docProps/') || /^(word\/(comments|document)\.xml|xl\/workbook\.xml|ppt\/notesSlides\/.+)$/.test(file.name) })
  } catch {
    return
  }
  const text = (name: string) => (files[name] ? new TextDecoder().decode(files[name]) : '')
  const core = text('docProps/core.xml')
  const app = text('docProps/app.xml')
  const custom = text('docProps/custom.xml')
  const props: { key: string; value: string }[] = []
  const add = (key: string, value: string | null, flag?: string) => {
    if (value && value !== '') {
      props.push({ key, value })
      if (flag) sensitive.add(flag)
    }
  }
  add('Titel', tag(core, 'dc:title'))
  add('Betreff', tag(core, 'dc:subject'))
  add('Autor', tag(core, 'dc:creator'), 'Autor')
  add('Zuletzt geändert von', tag(core, 'cp:lastModifiedBy'), 'Autor')
  add('Stichwörter', tag(core, 'cp:keywords'))
  add('Kommentar', tag(core, 'dc:description'))
  add('Kategorie', tag(core, 'cp:category'))
  const created = tag(core, 'dcterms:created')
  const modified = tag(core, 'dcterms:modified')
  if (created) {
    props.push({ key: 'Erstellt', value: new Date(created).toLocaleString('de-DE') })
    sensitive.add('Zeitstempel')
  }
  if (modified) {
    props.push({ key: 'Geändert', value: new Date(modified).toLocaleString('de-DE') })
    sensitive.add('Zeitstempel')
  }
  add('Revision', tag(core, 'cp:revision'))
  if (props.length > 0) groups.push({ title: 'Eigenschaften', items: props })

  const application: { key: string; value: string }[] = []
  const addApp = (key: string, value: string | null, flag?: string) => {
    if (value && value !== '') {
      application.push({ key, value })
      if (flag) sensitive.add(flag)
    }
  }
  addApp('Programm', tag(app, 'Application'), 'Bearbeitungsprogramm')
  addApp('Version', tag(app, 'AppVersion'))
  addApp('Firma', tag(app, 'Company'), 'Firma')
  addApp('Manager', tag(app, 'Manager'), 'Autor')
  addApp('Bearbeitungszeit (Minuten)', tag(app, 'TotalTime'))
  addApp('Vorlage', tag(app, 'Template'))
  addApp('Seiten', tag(app, 'Pages'))
  addApp('Wörter', tag(app, 'Words'))
  if (application.length > 0) groups.push({ title: 'Anwendung', items: application })

  const customItems: { key: string; value: string }[] = []
  for (const match of custom.matchAll(/<property[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/property>/g)) {
    const value = (match[2] ?? '').replace(/<[^>]+>/g, '').trim()
    if (match[1] && value) customItems.push({ key: match[1], value })
  }
  if (customItems.length > 0) {
    groups.push({ title: 'Benutzerdefiniert', items: customItems })
    sensitive.add('Benutzerdefinierte Eigenschaften')
  }

  if (Object.keys(files).some((name) => name.startsWith('docProps/thumbnail'))) {
    hints.push('Enthält ein Vorschaubild der ersten Seite')
    sensitive.add('Vorschaubild')
  }
  if (extension === 'docx') {
    if (files['word/comments.xml']) hints.push('Enthält Kommentare')
    const body = text('word/document.xml')
    if (/<w:ins\s/.test(body) || /<w:del\s/.test(body)) hints.push('Enthält nachverfolgte Änderungen')
    if (/<w:vanish\b/.test(body)) hints.push('Enthält versteckten Text')
  }
  if (extension === 'xlsx' && /state="(hidden|veryHidden)"/.test(text('xl/workbook.xml'))) hints.push('Enthält versteckte Tabellenblätter')
  if (extension === 'pptx' && Object.keys(files).some((name) => name.startsWith('ppt/notesSlides/'))) hints.push('Enthält Sprechernotizen')
}

async function readMedia(path: string, groups: MetaGroup[], sensitive: Set<string>): Promise<void> {
  const binary = await ffmpegBinary()
  if (!binary) return
  const output = await new Promise<string>((resolve) => {
    const child = spawn(binary, ['-hide_banner', '-i', path], { windowsHide: true })
    let text = ''
    child.stderr.on('data', (chunk: Buffer) => {
      text += chunk.toString('utf8')
    })
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(text))
  })
  const duration = output.match(/Duration:\s*([\d:.]+)/)?.[1]
  const streams = [...output.matchAll(/Stream #\d+:\d+[^:]*: (Video|Audio): ([^\n]+)/g)].map((match) => `${match[1] === 'Video' ? 'Video' : 'Audio'}: ${(match[2] ?? '').trim()}`)
  const info: { key: string; value: string }[] = []
  if (duration) info.push({ key: 'Dauer', value: duration })
  streams.slice(0, 4).forEach((stream, index) => info.push({ key: `Spur ${index + 1}`, value: stream }))
  if (info.length > 0) groups.push({ title: 'Medium', items: info })
  const section = output.split(/\n\s*Duration:/)[0] ?? ''
  const tags: { key: string; value: string }[] = []
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^\s{4}([A-Za-z_]+)\s*:\s*(.+)$/)
    if (match?.[1] && match[2]) tags.push({ key: match[1], value: match[2].trim() })
  }
  if (tags.length > 0) {
    groups.push({ title: 'Tags', items: tags })
    if (tags.some((tag) => /location|artist|author|encoder|creation_time|comment/i.test(tag.key))) sensitive.add('Tags')
  }
}

export async function readMetadata(path: string): Promise<MetaReport> {
  const info = await stat(path)
  const extension = extensionOf(path)
  const groups: MetaGroup[] = []
  const sensitive = new Set<string>()
  const hints: string[] = []

  const file: { key: string; value: string }[] = [
    { key: 'Name', value: basename(path) },
    { key: 'Größe', value: `${info.size.toLocaleString('de-DE')} Byte` },
    { key: 'Zuletzt geändert', value: info.mtime.toLocaleString('de-DE') }
  ]
  groups.push({ title: 'Datei', items: file })

  if (info.isFile() && info.size <= 400 * 1024 * 1024) {
    if (IMAGE_EXIF.has(extension) || extension === 'gif') {
      await readImage(await readFile(path), extension, groups, sensitive, hints)
    } else if (extension === 'pdf') {
      await readPdf(await readFile(path), groups, sensitive, hints)
    } else if (OFFICE.has(extension)) {
      await readOffice(await readFile(path), extension, groups, sensitive, hints)
    } else if (MEDIA.has(extension)) {
      await readMedia(path, groups, sensitive)
    }
  }

  return { name: basename(path), size: info.size, kind: kindOf(extension), groups, sensitive: [...sensitive], hints }
}
