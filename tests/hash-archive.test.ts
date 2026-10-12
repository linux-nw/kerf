import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JobRunner } from '../src/main/jobs'
import { archiveTool } from '../src/main/tools/archive'
import { hashFile, hashTool } from '../src/main/tools/hash'
import type { JobUpdate } from '../src/shared/types'

async function run(tool: 'archive' | 'hash', paths: string[], options: unknown) {
  const updates: JobUpdate[] = []
  const runner = new JobRunner({ archive: archiveTool, hash: hashTool }, null, () => 1)
  await runner.start(tool, [{ id: 'j', paths }], options, (u) => updates.push(u))
  return updates.at(-1) as JobUpdate
}

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-arch-'))
  writeFileSync(join(dir, 'a.txt'), 'Hallo Welt')
  mkdirSync(join(dir, 'ordner'))
  writeFileSync(join(dir, 'ordner', 'b.txt'), 'Zweite Datei')
  return dir
}

describe('Prüfsummen', () => {
  it('berechnet mehrere Verfahren in einem Durchgang', async () => {
    const dir = workspace()
    const result = await hashFile(join(dir, 'a.txt'), ['md5', 'sha1', 'sha256', 'sha512'], () => undefined, new AbortController().signal)
    const expected = (name: string) => createHash(name).update('Hallo Welt').digest('hex')
    expect(result.hashes).toEqual({ md5: expected('md5'), sha1: expected('sha1'), sha256: expected('sha256'), sha512: expected('sha512') })
    expect(result.size).toBe(10)
  })

  it('läuft als Werkzeug und merkt sich nichts im Verlauf', async () => {
    const dir = workspace()
    const last = await run('hash', [join(dir, 'a.txt')], { algorithms: ['sha256'] })
    expect(last.status).toBe('done')
    expect((last.data as { hashes: Record<string, string> }).hashes['sha256']).toBe(createHash('sha256').update('Hallo Welt').digest('hex'))
  })

  it('meldet fehlende Dateien und Ordner', async () => {
    const dir = workspace()
    expect(await run('hash', [join(dir, 'nein.txt')], {})).toMatchObject({ status: 'error', errorCode: 'missing' })
    expect(await run('hash', [join(dir, 'ordner')], {})).toMatchObject({ status: 'error', errorCode: 'unsupported' })
  })
})

describe('Archive', () => {
  it('packt als ZIP und entpackt wieder, ohne etwas zu überschreiben', async () => {
    const dir = workspace()
    const packed = await run('archive', [join(dir, 'a.txt'), join(dir, 'ordner')], { mode: 'pack', format: 'zip', name: 'paket' })
    expect(packed.status).toBe('done')
    expect(packed.outputPath).toBe(join(dir, 'paket.zip'))
    const again = await run('archive', [join(dir, 'a.txt')], { mode: 'pack', format: 'zip', name: 'paket' })
    expect(again.outputPath).toBe(join(dir, 'paket-2.zip'))
    const unpacked = await run('archive', [join(dir, 'paket.zip')], { mode: 'unpack' })
    expect(unpacked.status).toBe('done')
    expect(unpacked.outputPath).toBe(join(dir, 'paket'))
    expect(readFileSync(join(dir, 'paket', 'a.txt'), 'utf8')).toBe('Hallo Welt')
    expect(readFileSync(join(dir, 'paket', 'ordner', 'b.txt'), 'utf8')).toBe('Zweite Datei')
    const second = await run('archive', [join(dir, 'paket.zip')], { mode: 'unpack' })
    expect(second.outputPath).toBe(join(dir, 'paket-2'))
  })

  it('packt mit Passwort, verlangt es beim Entpacken und erkennt ein falsches', async () => {
    const dir = workspace()
    for (const format of ['zip', '7z']) {
      const packed = await run('archive', [join(dir, 'a.txt')], { mode: 'pack', format, name: `geheim-${format}`, password: 'S3cret!' })
      expect(packed.status).toBe('done')
      const without = await run('archive', [packed.outputPath ?? ''], { mode: 'unpack' })
      expect(without).toMatchObject({ status: 'error', errorCode: 'password' })
      const wrong = await run('archive', [packed.outputPath ?? ''], { mode: 'unpack', password: 'falsch' })
      expect(wrong).toMatchObject({ status: 'error', errorCode: 'password' })
      const right = await run('archive', [packed.outputPath ?? ''], { mode: 'unpack', password: 'S3cret!' })
      expect(right.status).toBe('done')
      expect(readFileSync(join(right.outputPath ?? '', 'a.txt'), 'utf8')).toBe('Hallo Welt')
    }
    expect(readdirSync(dir).filter((name) => name.startsWith('geheim'))).toHaveLength(4)
  })

  it('packt und entpackt tar.gz in einem Schritt', async () => {
    const dir = workspace()
    const packed = await run('archive', [join(dir, 'ordner')], { mode: 'pack', format: 'tar.gz', name: 'sicherung' })
    expect(packed.status).toBe('done')
    expect(packed.outputPath).toBe(join(dir, 'sicherung.tar.gz'))
    const unpacked = await run('archive', [packed.outputPath ?? ''], { mode: 'unpack' })
    expect(unpacked.status).toBe('done')
    expect(existsSync(join(unpacked.outputPath ?? '', 'ordner', 'b.txt'))).toBe(true)
    expect(readdirSync(unpacked.outputPath ?? '').some((name) => name.endsWith('.tar'))).toBe(false)
  })

  it('lehnt tar.gz mit Passwort ehrlich ab', async () => {
    const dir = workspace()
    const result = await run('archive', [join(dir, 'a.txt')], { mode: 'pack', format: 'tar.gz', password: 'x' })
    expect(result).toMatchObject({ status: 'error', errorCode: 'unsupported' })
  })

  it('meldet kaputte Archive und unbekannte Endungen', async () => {
    const dir = workspace()
    writeFileSync(join(dir, 'kaputt.zip'), 'das ist kein zip')
    expect(await run('archive', [join(dir, 'kaputt.zip')], { mode: 'unpack' })).toMatchObject({ status: 'error', errorCode: 'unreadable' })
    expect(await run('archive', [join(dir, 'a.txt')], { mode: 'unpack' })).toMatchObject({ status: 'error', errorCode: 'unsupported' })
    expect(existsSync(join(dir, 'kaputt'))).toBe(false)
  })

  it('schützt vor Pfaden außerhalb des Zielordners', async () => {
    const dir = workspace()
    const evil = join(dir, 'evil.zip')
    const python = `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1],'w');z.writestr('../../ausserhalb.txt','x');z.writestr('ok.txt','y');z.close()`
    const { execFileSync } = await import('node:child_process')
    execFileSync('python3', ['-c', python, evil])
    const result = await run('archive', [evil], { mode: 'unpack', outputDir: join(dir, 'ziel') })
    expect(existsSync(join(dir, 'ausserhalb.txt'))).toBe(false)
    expect(existsSync(join(dir, '..', 'ausserhalb.txt'))).toBe(false)
    expect(result.status === 'done' || result.status === 'error').toBe(true)
  })
})
