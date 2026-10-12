import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectPdfs } from '../src/main/files'

describe('collectPdfs', () => {
  it('nimmt PDFs aus Ordnern auf, meldet den Rest und doppelte nur einmal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-files-'))
    mkdirSync(join(dir, 'unter'))
    writeFileSync(join(dir, 'a.pdf'), 'x'.repeat(10))
    writeFileSync(join(dir, 'unter', 'b.PDF'), 'x'.repeat(20))
    writeFileSync(join(dir, 'c.docx'), 'x')
    const known = new Set<string>()
    const first = await collectPdfs([dir, join(dir, 'fehlt.pdf')], known)
    expect(first.files.map((f) => f.name)).toEqual(['a.pdf', 'b.PDF'])
    expect(first.files.map((f) => f.size)).toEqual([10, 20])
    expect(first.skipped.sort()).toEqual(['c.docx', 'fehlt.pdf'])
    const second = await collectPdfs([dir], known)
    expect(second.files).toEqual([])
  })
})
