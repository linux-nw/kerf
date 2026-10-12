import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import type { Capabilities } from '@shared/types'
import { ffmpegBinary, sevenZipBinary } from './binaries'
import { detectMsOffice, findLibreOffice } from './convert/office'
import { tessdataDir } from './ocr/paths'

export async function detectCapabilities(): Promise<Capabilities> {
  const ms = await detectMsOffice()
  let languages: string[] = []
  const dir = tessdataDir()
  if (existsSync(dir)) {
    languages = (await readdir(dir)).filter((name) => name.endsWith('.traineddata.gz')).map((name) => name.replace('.traineddata.gz', '')).filter((name) => name !== 'osd')
  }
  return {
    libreoffice: findLibreOffice(),
    msoffice: ms.word || ms.excel || ms.powerpoint,
    ffmpeg: (await ffmpegBinary()) !== null,
    sevenZip: (await sevenZipBinary()) !== null,
    ocrLanguages: languages.sort(),
    platform: process.platform
  }
}
