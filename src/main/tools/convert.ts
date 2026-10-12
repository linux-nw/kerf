import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { extensionOf } from '@shared/tools'
import { sourceKind } from '@shared/convertTargets'
import type { ConvertOptions } from '@shared/types'
import { ffmpegBinary } from '../engines/binaries'
import { convertImage } from '../engines/convert/image'
import { convertMedia } from '../engines/convert/media'
import { cleanupLibreOffice, detectMsOffice, familyOf, findLibreOffice, libreOfficeConvert, msOfficeToPdf, type MsOfficeApps } from '../engines/convert/office'
import { convertText, TEXT_SOURCES } from '../engines/convert/text'
import { uniquePath } from '../engines/pdf/output'
import { openPdf } from '../engines/pdf/open'
import { CancelledError, EngineError } from '../errors'
import { withDefaults, type ToolRunner } from './types'

const defaults: ConvertOptions = { target: 'png', quality: 85, icoSizes: [16, 32, 48, 256], outputDir: null, pdfDpi: 150 }

export interface ConvertDeps {
  soffice: () => string | null
  msOffice: () => Promise<MsOfficeApps>
  ffmpeg: () => Promise<string | null>
}

const realDeps: ConvertDeps = { soffice: findLibreOffice, msOffice: detectMsOffice, ffmpeg: ffmpegBinary }

async function writeAtomic(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const partial = `${path}.part`
  await writeFile(partial, bytes)
  await rename(partial, path)
}

async function moveFile(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true })
  try {
    await rename(from, to)
  } catch {
    await copyFile(from, to)
    await rm(from, { force: true })
  }
}

export function createConvertTool(overrides: Partial<ConvertDeps> = {}): ToolRunner {
  const deps = { ...realDeps, ...overrides }
  return async (job, rawOptions, ctx) => {
    const options = withDefaults(defaults, rawOptions)
    const path = job.paths[0]
    if (!path) throw new EngineError('missing', 'Keine Datei angegeben')
    const extension = extensionOf(path)
    const kind = sourceKind(extension)
    if (!kind) throw new EngineError('unsupported', `Dateityp .${extension} wird nicht unterstützt`)
    const target = options.target
    const directory = options.outputDir ?? dirname(path)
    const base = basename(path, extname(path))
    const exists = (candidate: string) => existsSync(candidate)

    let size: number
    try {
      size = (await stat(path)).size
    } catch {
      throw new EngineError('missing', 'Die Datei wurde nicht gefunden')
    }
    void size
    ctx.progress(5, 'Datei wird gelesen')

    if (kind === 'image') {
      const input = await readFile(path)
      ctx.progress(30, 'Bild wird umgewandelt')
      const result = await convertImage(input, extension === 'jpeg' ? 'jpg' : extension, target, base, { quality: options.quality, icoSizes: options.icoSizes })
      if (result.kind === 'file') {
        const out = uniquePath(directory, base, `.${result.extension}`, exists)
        await writeAtomic(out, result.bytes)
        return { outputs: [out], summary: `Nach ${target.toUpperCase()}` }
      }
      const folder = uniquePath(directory, `${base}_favicon`, '', exists)
      await mkdir(folder, { recursive: true })
      for (const file of result.files) await writeAtomic(join(folder, file.name), file.bytes)
      return { outputs: [folder], outputSize: null, summary: 'Favicon-Set' }
    }

    if (kind === 'pdf') {
      const input = await readFile(path)
      const doc = await openPdf(input)
      try {
        if (target === 'txt') {
          const info = await doc.info()
          const parts: string[] = []
          for (let page = 1; page <= info.pages; page += 1) {
            if (ctx.signal.aborted) throw new CancelledError()
            parts.push(await doc.text(page))
            ctx.progress(10 + (page / info.pages) * 85, `Seite ${page} von ${info.pages}`)
          }
          const text = parts.map((part) => part.trim()).join('\n\n')
          if (text.trim() === '') throw new EngineError('unsupported', 'Im PDF steckt kein Text. Es ist wahrscheinlich ein Scan, nutze die Texterkennung.')
          const out = uniquePath(directory, base, '.txt', exists)
          await writeAtomic(out, new TextEncoder().encode(text))
          return { outputs: [out], summary: 'Text ausgelesen' }
        }
        if (target === 'png' || target === 'jpg') {
          const info = await doc.info()
          const folder = uniquePath(directory, `${base}_Seiten`, '', exists)
          await mkdir(folder, { recursive: true })
          const digits = String(info.pages).length
          for (let page = 1; page <= info.pages; page += 1) {
            if (ctx.signal.aborted) {
              await rm(folder, { recursive: true, force: true })
              throw new CancelledError()
            }
            const rendered = await doc.render(page, { dpi: options.pdfDpi, format: target === 'jpg' ? 'jpeg' : 'png', quality: options.quality })
            await writeAtomic(join(folder, `${base}-${String(page).padStart(digits, '0')}.${target}`), rendered.data)
            ctx.progress(10 + (page / info.pages) * 88, `Seite ${page} von ${info.pages}`)
          }
          return { outputs: [folder], outputSize: null, summary: `${info.pages} Seiten als ${target.toUpperCase()}` }
        }
        throw new EngineError('unsupported', `PDF nach .${target} wird nicht unterstützt`)
      } finally {
        await doc.close()
      }
    }

    if (kind === 'audio' || kind === 'video') {
      const binary = await deps.ffmpeg()
      if (!binary) throw new EngineError('toolmissing', 'FFmpeg wurde nicht gefunden. Bitte npm install erneut ausführen.')
      const out = uniquePath(directory, base, `.${target}`, exists)
      await mkdir(directory, { recursive: true })
      const partial = `${out}.part.${target}`
      try {
        await convertMedia(binary, path, partial, target, (fraction) => ctx.progress(5 + fraction * 93, 'Wird umgewandelt'), ctx.signal)
        await rename(partial, out)
      } catch (error) {
        await rm(partial, { force: true })
        throw error
      }
      return { outputs: [out], summary: `Nach ${target.toUpperCase()}` }
    }

    const officeKinds = ['writer', 'calc', 'impress', 'visio']
    const internalOffice = (extension === 'docx' && ['html', 'txt', 'pdf'].includes(target)) || (extension === 'xlsx' && ['csv', 'json', 'pdf'].includes(target))
    const internalText = !officeKinds.includes(kind) || (officeKinds.includes(kind) && internalOffice)

    if (officeKinds.includes(kind)) {
      const family = familyOf(extension)
      const soffice = deps.soffice()
      const ms = await deps.msOffice()
      const msAvailable = (family === 'word' && ms.word) || (family === 'excel' && ms.excel) || (family === 'powerpoint' && ms.powerpoint)
      if (target === 'pdf') {
        const out = uniquePath(directory, base, '.pdf', exists)
        await mkdir(directory, { recursive: true })
        if (msAvailable) {
          ctx.progress(20, 'Microsoft Office wandelt um')
          const partial = `${out}.part.pdf`
          try {
            await msOfficeToPdf(family, path, partial, ctx.signal)
            await rename(partial, out)
            return { outputs: [out], summary: 'Mit Microsoft Office zu PDF' }
          } catch (error) {
            await rm(partial, { force: true })
            if (!soffice && !internalOffice) throw error
          }
        }
        if (soffice) {
          ctx.progress(25, 'LibreOffice wandelt um')
          const produced = await libreOfficeConvert(soffice, path, 'pdf', ctx.signal)
          await moveFile(produced, out)
          await cleanupLibreOffice(produced)
          return { outputs: [out], summary: 'Mit LibreOffice zu PDF' }
        }
        if (!internalOffice) {
          throw new EngineError('toolmissing', 'Für diese Datei braucht Kerf Microsoft Office oder LibreOffice auf diesem Rechner.')
        }
      } else if (!internalOffice) {
        if (!soffice) throw new EngineError('toolmissing', 'Für diese Umwandlung braucht Kerf LibreOffice auf diesem Rechner.')
        ctx.progress(25, 'LibreOffice wandelt um')
        const produced = await libreOfficeConvert(soffice, path, target, ctx.signal)
        const out = uniquePath(directory, base, `.${target}`, exists)
        await moveFile(produced, out)
        await cleanupLibreOffice(produced)
        return { outputs: [out], summary: `Nach ${target.toUpperCase()}` }
      }
    }

    if (internalText && (TEXT_SOURCES.includes(extension) || extension === 'docx' || extension === 'xlsx')) {
      const input = await readFile(path)
      ctx.progress(30, 'Wird umgewandelt')
      const result = await convertText(input, extension, target, base)
      const out = uniquePath(directory, base, `.${result.extension}`, exists)
      await writeAtomic(out, result.bytes)
      const note = target === 'pdf' && officeKinds.includes(kind) ? 'Vereinfachte Darstellung ohne Microsoft Office oder LibreOffice' : null
      return { outputs: [out], summary: `Nach ${target.toUpperCase()}`, detail: note }
    }

    throw new EngineError('unsupported', `Von .${extension} nach .${target} wird nicht unterstützt`)
  }
}
