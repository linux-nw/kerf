import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HistoryStore, type StoredEntry } from '../src/main/history'

function entry(id: string, outputPath: string): StoredEntry {
  return { id, tool: 'compress', time: Date.now(), inputName: `${id}.pdf`, inputSize: 100, outputPath, outputSize: 40, summary: 'Komprimiert' }
}

describe('HistoryStore', () => {
  it('speichert, lädt wieder und markiert fehlende Dateien', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-history-'))
    const file = join(dir, 'verlauf.json')
    const real = join(dir, 'echt.pdf')
    writeFileSync(real, 'x')
    const store = new HistoryStore(file)
    await store.add(entry('a', real))
    await store.add(entry('b', join(dir, 'weg.pdf')))
    const again = new HistoryStore(file)
    const list = await again.list()
    expect(list.map((e) => e.id)).toEqual(['b', 'a'])
    expect(list.find((e) => e.id === 'a')?.exists).toBe(true)
    expect(list.find((e) => e.id === 'b')?.exists).toBe(false)
  })

  it('entfernt Einträge aus dem Verlauf und lässt die Datei unberührt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-history-'))
    const real = join(dir, 'ergebnis.klein.pdf')
    writeFileSync(real, 'inhalt')
    const store = new HistoryStore(join(dir, 'verlauf.json'))
    await store.add(entry('a', real))
    await store.add(entry('b', real))
    await store.remove(['a'])
    expect((await store.list()).map((e) => e.id)).toEqual(['b'])
    expect(readFileSync(real, 'utf8')).toBe('inhalt')
    await store.clear()
    expect(await store.list()).toEqual([])
    expect(readFileSync(real, 'utf8')).toBe('inhalt')
  })

  it('überlebt eine kaputte Verlaufsdatei', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-history-'))
    const file = join(dir, 'verlauf.json')
    writeFileSync(file, '{kaputt')
    const store = new HistoryStore(file)
    expect(await store.list()).toEqual([])
    await store.add(entry('a', join(dir, 'x.pdf')))
    expect(await store.list()).toHaveLength(1)
  })

  it('ersetzt einen Eintrag mit gleicher ID statt ihn doppelt zu führen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-history-'))
    const store = new HistoryStore(join(dir, 'v.json'))
    await store.add(entry('a', join(dir, '1.pdf')))
    await store.add(entry('a', join(dir, '2.pdf')))
    const list = await store.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.outputPath).toBe(join(dir, '2.pdf'))
  })
})
