import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectFiles, collectTopLevel, saveBlobs } from '../src/main/files'

function sample() {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-files-'))
  mkdirSync(join(dir, 'unter'))
  writeFileSync(join(dir, 'a.pdf'), 'x'.repeat(10))
  writeFileSync(join(dir, 'unter', 'b.PDF'), 'x'.repeat(20))
  writeFileSync(join(dir, 'c.docx'), 'x')
  return dir
}

describe('collectFiles', () => {
  it('nimmt nur passende Dateien aus Ordnern auf und meldet den Rest', async () => {
    const dir = sample()
    const allowed = new Set<string>()
    const result = await collectFiles([dir, join(dir, 'fehlt.pdf')], ['pdf'], allowed)
    expect(result.files.map((f) => f.name)).toEqual(['a.pdf', 'b.PDF'])
    expect(result.files.map((f) => f.size)).toEqual([10, 20])
    expect(result.skipped.sort()).toEqual(['c.docx', 'fehlt.pdf'])
    expect(allowed.has(join(dir, 'a.pdf'))).toBe(true)
  })

  it('nimmt mit Stern alles auf', async () => {
    const dir = sample()
    const result = await collectFiles([dir], '*', new Set())
    expect(result.files).toHaveLength(3)
  })

  it('liefert denselben Pfad nicht doppelt', async () => {
    const dir = sample()
    const result = await collectFiles([join(dir, 'a.pdf'), join(dir, 'a.pdf')], ['pdf'], new Set())
    expect(result.files).toHaveLength(1)
  })
})

describe('collectTopLevel', () => {
  it('nimmt Ordner als einen Eintrag auf', async () => {
    const dir = sample()
    const result = await collectTopLevel([dir, join(dir, 'a.pdf'), join(dir, 'nein')], new Set())
    expect(result.files.map((f) => f.name)).toHaveLength(2)
    expect(result.skipped).toEqual(['nein'])
  })
})

describe('saveBlobs', () => {
  it('speichert eingefügte Daten mit sicheren, eindeutigen Namen', async () => {
    const base = mkdtempSync(join(tmpdir(), 'kerf-blobs-'))
    const result = await saveBlobs(
      [
        { name: 'Bildschirmfoto.png', data: new Uint8Array([1, 2, 3]) },
        { name: 'Bildschirmfoto.png', data: new Uint8Array([4]) },
        { name: '../böse:name?.pdf', data: new Uint8Array([5]) },
        { name: 'ignoriert.xyz', data: new Uint8Array([6]) }
      ],
      ['png', 'pdf'],
      new Set(),
      base
    )
    expect(result.files.map((f) => f.name).sort()).toEqual(['.._böse_name_.pdf', 'Bildschirmfoto-2.png', 'Bildschirmfoto.png'])
    expect(result.skipped).toEqual(['ignoriert.xyz'])
    const first = result.files.find((f) => f.name === 'Bildschirmfoto.png')
    expect(readFileSync(first?.path ?? '')).toEqual(Buffer.from([1, 2, 3]))
    expect(first?.path.startsWith(base)).toBe(true)
  })
})
