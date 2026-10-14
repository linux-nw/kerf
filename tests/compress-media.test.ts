import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { JobRunner } from '../src/main/jobs'
import { createCompressTool } from '../src/main/tools/compress'
import type { JobUpdate } from '../src/shared/types'
import { photoJpeg, photoPng } from './helpers/make-pdf'

const fakePdf = async () => ({ bytes: new Uint8Array(1), stats: { images: 0, recompressed: 0, grayscale: 0, bilevel: 0, structure: false, fontsSubset: false } })

async function compress(path: string, preset: 'kompakt' | 'winzig' = 'kompakt') {
  const updates: JobUpdate[] = []
  const runner = new JobRunner({ compress: createCompressTool(fakePdf) }, null, () => 1)
  await runner.start('compress', [{ id: 'x', paths: [path] }], { preset, stripMetadata: true, outputDir: null }, (u) => updates.push(u))
  return updates.at(-1) as JobUpdate
}

describe('Bilder komprimieren', () => {
  it('verkleinert ein JPEG deutlich und begrenzt bei Winzig die Kantenlänge', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-img-'))
    const path = join(dir, 'foto.jpg')
    writeFileSync(path, await photoJpeg(3600, 2400))
    const result = await compress(path, 'winzig')
    expect(result.status).toBe('done')
    expect(result.outputPath).toBe(join(dir, 'foto.klein.jpg'))
    expect(result.outputSize ?? Infinity).toBeLessThan(readFileSync(path).length * 0.5)
    const meta = await sharp(result.outputPath ?? '').metadata()
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(3000)
  })

  it('verkleinert ein PNG und erhält die Endung', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-img-'))
    const path = join(dir, 'scan.png')
    writeFileSync(path, await photoPng(2000, 1500))
    const result = await compress(path, 'kompakt')
    expect(result.status).toBe('done')
    expect(result.outputPath?.endsWith('scan.klein.png')).toBe(true)
  })

  it('wird bei Winzig nie größer als bei Kompakt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-img-'))
    const path = join(dir, 'foto.jpg')
    writeFileSync(path, await photoJpeg(3000, 2000))
    const kompakt = await compress(path, 'kompakt')
    const winzig = await compress(path, 'winzig')
    expect(kompakt.status).toBe('done')
    expect(winzig.status).toBe('done')
    expect(winzig.outputSize ?? Infinity).toBeLessThanOrEqual(kompakt.outputSize ?? 0)
  })

  it('meldet kaputte Bilder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-img-'))
    const path = join(dir, 'kaputt.jpg')
    writeFileSync(path, 'kein bild')
    const result = await compress(path)
    expect(result).toMatchObject({ status: 'error', errorCode: 'unreadable' })
  })
})

describe('Office-Dateien komprimieren', () => {
  it('rechnet eingebettete Bilder neu und lässt den Rest unverändert', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-office-'))
    const path = join(dir, 'bericht.docx')
    const text = new TextEncoder().encode('<w:document>Hallo</w:document>')
    const photo = new Uint8Array(await photoJpeg(3000, 2000))
    writeFileSync(path, zipSync({ '[Content_Types].xml': new TextEncoder().encode('<Types/>'), 'word/document.xml': text, 'word/media/image1.jpg': [photo, { level: 0 }] }))
    const result = await compress(path, 'kompakt')
    expect(result.status).toBe('done')
    const files = unzipSync(readFileSync(result.outputPath ?? ''))
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', 'word/document.xml', 'word/media/image1.jpg'])
    expect(new TextDecoder().decode(files['word/document.xml'])).toBe('<w:document>Hallo</w:document>')
    expect(files['word/media/image1.jpg']?.length ?? Infinity).toBeLessThan(photo.length * 0.5)
  })

  it('meldet beschädigte Office-Dateien', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-office-'))
    const path = join(dir, 'kaputt.pptx')
    writeFileSync(path, 'kein zip')
    expect(await compress(path)).toMatchObject({ status: 'error', errorCode: 'unreadable' })
  })
})
