import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import { CancelledError, EngineError, compressPdfBytes, filterPngUp, unfilterPng } from '../src/main/engines/pdf/compress'
import { makeSamplePdf } from './helpers/make-pdf'

const hasQpdf = (() => {
  try {
    execFileSync('qpdf', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

let sample: Uint8Array
let workDir: string

beforeAll(async () => {
  sample = await makeSamplePdf()
  workDir = mkdtempSync(join(tmpdir(), 'kerf-test-'))
})

describe('PNG-Prädiktor', () => {
  it('Filter und Rückfilter ergeben die Ausgangsdaten', () => {
    const rowBytes = 30
    const rows = 12
    const raw = Buffer.alloc(rowBytes * rows)
    for (let index = 0; index < raw.length; index += 1) raw[index] = (index * 37 + (index >> 3)) & 0xff
    const filtered = filterPngUp(raw, rowBytes, rows)
    const restored = unfilterPng(filtered, rowBytes, 3, rows)
    expect(restored).not.toBeNull()
    expect(restored?.equals(raw)).toBe(true)
  })

  it('lehnt unbekannte Filtertypen ab', () => {
    const data = Buffer.alloc(2 * 5)
    data[0] = 9
    expect(unfilterPng(data, 4, 1, 2)).toBeNull()
  })
})

describe('compressPdfBytes', () => {
  it('verkleinert ein bildlastiges PDF deutlich und lässt es gültig', async () => {
    const { bytes, stats } = await compressPdfBytes(sample, { level: 'kompakt', stripMetadata: false })
    expect(bytes.length).toBeLessThan(sample.length * 0.5)
    expect(stats.images).toBe(3)
    expect(stats.recompressed).toBeGreaterThanOrEqual(2)

    const reloaded = await PDFDocument.load(bytes)
    expect(reloaded.getPageCount()).toBe(2)
  })

  it('wird mit Winzig nie größer als mit Kompakt', async () => {
    const kompakt = await compressPdfBytes(sample, { level: 'kompakt', stripMetadata: false })
    const winzig = await compressPdfBytes(sample, { level: 'winzig', stripMetadata: false })
    expect(winzig.bytes.length).toBeLessThanOrEqual(kompakt.bytes.length)
  })

  it('entfernt Metadaten auf Wunsch', async () => {
    const kept = await compressPdfBytes(sample, { level: 'kompakt', stripMetadata: false })
    const stripped = await compressPdfBytes(sample, { level: 'kompakt', stripMetadata: true })
    const keptDoc = await PDFDocument.load(kept.bytes, { updateMetadata: false })
    const strippedDoc = await PDFDocument.load(stripped.bytes, { updateMetadata: false })
    expect(keptDoc.getTitle()).toBe('Beispiel')
    expect(strippedDoc.getTitle()).toBeUndefined()
    expect(strippedDoc.getAuthor()).toBeUndefined()
  })

  it.skipIf(!hasQpdf)('erzeugt ein Ergebnis, das qpdf als in Ordnung prüft', async () => {
    const { bytes } = await compressPdfBytes(sample, { level: 'kompakt', stripMetadata: true })
    const file = join(workDir, 'ergebnis.pdf')
    writeFileSync(file, bytes)
    const output = execFileSync('qpdf', ['--check', file], { encoding: 'utf8' })
    expect(output).toContain('No syntax or stream encoding errors found')
  })

  it.skipIf(!hasQpdf)('meldet passwortgeschützte Dateien mit eigenem Fehlercode', async () => {
    const plain = join(workDir, 'offen.pdf')
    const locked = join(workDir, 'geschuetzt.pdf')
    writeFileSync(plain, sample)
    execFileSync('qpdf', ['--encrypt', 'user', 'owner', '256', '--', plain, locked])
    const bytes = new Uint8Array(readFileSync(locked))
    await expect(compressPdfBytes(bytes, { level: 'kompakt', stripMetadata: false })).rejects.toMatchObject({
      code: 'password'
    })
  })

  it('meldet kaputte Dateien als nicht lesbar', async () => {
    const broken = new TextEncoder().encode('das ist kein pdf')
    const error = await compressPdfBytes(broken, { level: 'kompakt', stripMetadata: false }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(EngineError)
    expect((error as EngineError).code).toBe('unreadable')
  })

  it('bricht ab, wenn das Signal gesetzt ist', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      compressPdfBytes(sample, { level: 'kompakt', stripMetadata: false }, { signal: controller.signal })
    ).rejects.toBeInstanceOf(CancelledError)
  })

  it('meldet Fortschritt in steigender Reihenfolge', async () => {
    const seen: number[] = []
    await compressPdfBytes(sample, { level: 'kompakt', stripMetadata: false }, { onProgress: (fraction) => seen.push(fraction) })
    expect(seen.length).toBeGreaterThan(3)
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
    expect(seen.at(-1)).toBe(1)
  })
})
