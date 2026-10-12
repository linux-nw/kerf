import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { CancelledError, EngineError } from '../src/main/engines/pdf/compress'
import { decideOutcome, nextOutputPath } from '../src/main/engines/pdf/output'
import { JobRunner, processJob, type CompressFn } from '../src/main/jobs'
import type { CompressOptions, JobUpdate } from '../src/shared/types'

const baseOptions: CompressOptions = { preset: 'standard', targetBytes: null, stripMetadata: false, outputDir: null }

let dir: string
let original: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kerf-jobs-'))
  original = join(dir, 'rechnung.pdf')
  writeFileSync(original, Buffer.alloc(10_000, 1))
})

function fakeCompress(sizes: number[]): CompressFn {
  let call = 0
  return async (_input, _settings, hooks) => {
    hooks.onProgress?.(0.5, 'Bilder werden gerechnet')
    const size = sizes[Math.min(call, sizes.length - 1)] ?? 0
    call += 1
    return { bytes: new Uint8Array(size), stats: { images: 1, recompressed: 1 } }
  }
}

async function run(options: CompressOptions, compress: CompressFn, signal = new AbortController().signal) {
  const updates: JobUpdate[] = []
  await processJob({ id: 'a', path: original }, options, compress, signal, (u) => updates.push(u))
  return updates
}

describe('decideOutcome', () => {
  it('unterscheidet fertig, kein Gewinn und größer', () => {
    expect(decideOutcome(1000, 400)).toBe('done')
    expect(decideOutcome(1000, 995)).toBe('nogain')
    expect(decideOutcome(1000, 1000)).toBe('nogain')
    expect(decideOutcome(1000, 1050)).toBe('larger')
  })
})

describe('nextOutputPath', () => {
  it('hängt .klein an und überschreibt nie etwas', () => {
    const taken = new Set<string>()
    const first = nextOutputPath(join(dir, 'a.pdf'), null, (p) => taken.has(p))
    expect(first).toBe(join(dir, 'a.klein.pdf'))
    taken.add(first)
    const second = nextOutputPath(join(dir, 'a.pdf'), null, (p) => taken.has(p))
    expect(second).toBe(join(dir, 'a.klein-2.pdf'))
  })

  it('nutzt den Ausgabeordner, wenn einer gewählt ist', () => {
    expect(nextOutputPath(join(dir, 'a.pdf'), join(dir, 'out'), () => false)).toBe(join(dir, 'out', 'a.klein.pdf'))
  })
})

describe('processJob', () => {
  it('schreibt das Ergebnis neben das Original und lässt das Original unverändert', async () => {
    const before = readFileSync(original)
    const updates = await run(baseOptions, fakeCompress([2_000]))
    const last = updates.at(-1)
    expect(last?.status).toBe('done')
    expect(last?.outputPath).toBe(join(dir, 'rechnung.klein.pdf'))
    expect(last?.outputSize).toBe(2_000)
    expect(statSync(last?.outputPath ?? '').size).toBe(2_000)
    expect(readFileSync(original).equals(before)).toBe(true)
    expect(readdirSync(dir).some((name) => name.endsWith('.part'))).toBe(false)
  })

  it('schreibt nichts, wenn es keinen Gewinn gibt', async () => {
    const updates = await run(baseOptions, fakeCompress([9_950]))
    expect(updates.at(-1)?.status).toBe('nogain')
    expect(readdirSync(dir)).toEqual(['rechnung.pdf'])
  })

  it('schreibt nichts, wenn das Ergebnis größer wäre', async () => {
    const updates = await run(baseOptions, fakeCompress([12_000]))
    expect(updates.at(-1)?.status).toBe('larger')
    expect(readdirSync(dir)).toEqual(['rechnung.pdf'])
  })

  it('meldet fehlende Dateien', async () => {
    const updates: JobUpdate[] = []
    await processJob({ id: 'x', path: join(dir, 'weg.pdf') }, baseOptions, fakeCompress([1]), new AbortController().signal, (u) =>
      updates.push(u)
    )
    expect(updates.at(-1)).toMatchObject({ status: 'error', errorCode: 'missing' })
  })

  it('reicht Fehlercodes der Engine durch', async () => {
    const failing: CompressFn = async () => {
      throw new EngineError('password', 'geschützt')
    }
    const updates = await run(baseOptions, failing)
    expect(updates.at(-1)).toMatchObject({ status: 'error', errorCode: 'password' })
  })

  it('meldet Abbruch', async () => {
    const cancelling: CompressFn = async () => {
      throw new CancelledError()
    }
    const updates = await run(baseOptions, cancelling)
    expect(updates.at(-1)?.status).toBe('cancelled')
  })

  it('sucht im Zielgrößen-Modus die erste Stufe, die reicht', async () => {
    const options: CompressOptions = { ...baseOptions, preset: 'target', targetBytes: 5_000 }
    const updates = await run(options, fakeCompress([9_000, 7_000, 4_000, 3_000]))
    const last = updates.at(-1)
    expect(last?.status).toBe('done')
    expect(last?.outputSize).toBe(4_000)
    expect(last?.detail).toBeNull()
  })

  it('weist im Zielgrößen-Modus auf ein verfehltes Ziel hin und behält das beste Ergebnis', async () => {
    const options: CompressOptions = { ...baseOptions, preset: 'target', targetBytes: 100 }
    const updates = await run(options, fakeCompress([9_000, 8_000, 7_000, 6_000, 5_000, 4_000, 3_000]))
    const last = updates.at(-1)
    expect(last?.status).toBe('done')
    expect(last?.outputSize).toBe(3_000)
    expect(last?.detail).toBe('Zielgröße nicht erreicht')
  })
})

describe('JobRunner', () => {
  it('arbeitet alle Aufträge ab und begrenzt die Parallelität', async () => {
    let active = 0
    let peak = 0
    const compress: CompressFn = async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 20))
      active -= 1
      return { bytes: new Uint8Array(1_000), stats: { images: 0, recompressed: 0 } }
    }
    const jobs = Array.from({ length: 6 }, (_, index) => {
      const path = join(dir, `datei-${index}.pdf`)
      writeFileSync(path, Buffer.alloc(10_000, 1))
      return { id: String(index), path }
    })
    const finals = new Map<string, string>()
    await new JobRunner(compress, 2).start(jobs, baseOptions, (u) => finals.set(u.id, u.status))
    expect([...finals.values()].every((status) => status === 'done')).toBe(true)
    expect(finals.size).toBe(6)
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('bricht wartende Aufträge ab, bevor sie starten', async () => {
    const compress: CompressFn = async (_i, _s, hooks) => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      if (hooks.signal?.aborted) throw new CancelledError()
      return { bytes: new Uint8Array(1_000), stats: { images: 0, recompressed: 0 } }
    }
    const jobs = ['a', 'b', 'c'].map((id) => {
      const path = join(dir, `${id}.pdf`)
      writeFileSync(path, Buffer.alloc(10_000, 1))
      return { id, path }
    })
    const finals = new Map<string, string>()
    const runner = new JobRunner(compress, 1)
    const done = runner.start(jobs, baseOptions, (u) => finals.set(u.id, u.status))
    runner.cancelAll()
    await done
    expect([...finals.values()].every((status) => status === 'cancelled')).toBe(true)
  })
})
