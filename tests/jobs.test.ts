import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { decideOutcome, nextOutputPath, uniquePath } from '../src/main/engines/pdf/output'
import { CancelledError, EngineError } from '../src/main/errors'
import { HistoryStore } from '../src/main/history'
import { JobRunner } from '../src/main/jobs'
import { createCompressTool, type CompressFn } from '../src/main/tools/compress'
import type { ToolContext, ToolRunner } from '../src/main/tools/types'
import type { CompressOptions, JobUpdate } from '../src/shared/types'

const baseOptions: CompressOptions = { preset: 'kompakt', stripMetadata: false, outputDir: null }

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
    return { bytes: new Uint8Array(size), stats: { images: 1, recompressed: 1, grayscale: 0, bilevel: 0, structure: false, fontsSubset: false } }
  }
}

async function run(options: CompressOptions, compress: CompressFn, path = original) {
  const updates: JobUpdate[] = []
  const history = new HistoryStore(join(dir, 'verlauf.json'))
  const runner = new JobRunner({ compress: createCompressTool(compress) }, history, () => 1)
  await runner.start('compress', [{ id: 'a', paths: [path] }], options, (u) => updates.push(u))
  return { updates, history }
}

describe('decideOutcome', () => {
  it('unterscheidet fertig, kein Gewinn und größer', () => {
    expect(decideOutcome(1000, 400)).toBe('done')
    expect(decideOutcome(1000, 995)).toBe('nogain')
    expect(decideOutcome(1000, 1000)).toBe('nogain')
    expect(decideOutcome(1000, 1050)).toBe('larger')
  })
})

describe('Ausgabepfade', () => {
  it('hängt .klein an und überschreibt nie etwas', () => {
    const taken = new Set<string>()
    const first = nextOutputPath(join(dir, 'a.pdf'), null, (p) => taken.has(p))
    expect(first).toBe(join(dir, 'a.klein.pdf'))
    taken.add(first)
    expect(nextOutputPath(join(dir, 'a.pdf'), null, (p) => taken.has(p))).toBe(join(dir, 'a.klein-2.pdf'))
  })

  it('nutzt den Ausgabeordner und die Endung der Quelle', () => {
    expect(nextOutputPath(join(dir, 'a.JPG'), join(dir, 'out'), () => false)).toBe(join(dir, 'out', 'a.klein.jpg'))
    expect(nextOutputPath(join(dir, 'a.png'), null, () => false, 'ocr', '.txt')).toBe(join(dir, 'a.ocr.txt'))
  })

  it('uniquePath zählt hoch', () => {
    const taken = new Set([join(dir, 'x.zip'), join(dir, 'x-2.zip')])
    expect(uniquePath(dir, 'x', '.zip', (p) => taken.has(p))).toBe(join(dir, 'x-3.zip'))
  })
})

describe('Komprimieren-Werkzeug im JobRunner', () => {
  it('schreibt das Ergebnis neben das Original, lässt das Original unverändert und merkt es im Verlauf', async () => {
    const before = readFileSync(original)
    const { updates, history } = await run(baseOptions, fakeCompress([2_000]))
    const last = updates.at(-1)
    expect(last?.status).toBe('done')
    expect(last?.outputPath).toBe(join(dir, 'rechnung.klein.pdf'))
    expect(last?.outputSize).toBe(2_000)
    expect(statSync(last?.outputPath ?? '').size).toBe(2_000)
    expect(readFileSync(original).equals(before)).toBe(true)
    expect(readdirSync(dir).some((name) => name.endsWith('.part'))).toBe(false)
    const list = await history.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'a', tool: 'compress', inputName: 'rechnung.pdf', inputSize: 10_000, outputSize: 2_000, exists: true })
  })

  it('schreibt nichts und merkt nichts im Verlauf, wenn es keinen Gewinn gibt', async () => {
    const { updates, history } = await run(baseOptions, fakeCompress([9_950]))
    expect(updates.at(-1)?.status).toBe('nogain')
    expect(updates.at(-1)?.outputSize).toBe(9_950)
    expect(readdirSync(dir).filter((n) => n.endsWith('.pdf'))).toEqual(['rechnung.pdf'])
    expect(await history.list()).toEqual([])
  })

  it('schreibt nichts, wenn das Ergebnis größer wäre', async () => {
    const { updates } = await run(baseOptions, fakeCompress([12_000]))
    expect(updates.at(-1)?.status).toBe('larger')
    expect(readdirSync(dir).filter((n) => n.endsWith('.pdf'))).toEqual(['rechnung.pdf'])
  })

  it('meldet fehlende Dateien', async () => {
    const { updates } = await run(baseOptions, fakeCompress([1]), join(dir, 'weg.pdf'))
    expect(updates.at(-1)).toMatchObject({ status: 'error', errorCode: 'missing' })
  })

  it('meldet nicht unterstützte Dateitypen', async () => {
    const txt = join(dir, 'a.txt')
    writeFileSync(txt, 'x')
    const { updates } = await run(baseOptions, fakeCompress([1]), txt)
    expect(updates.at(-1)).toMatchObject({ status: 'error', errorCode: 'unsupported' })
  })

  it('reicht Fehlercodes der Engine durch', async () => {
    const failing: CompressFn = async () => {
      throw new EngineError('password', 'geschützt')
    }
    const { updates } = await run(baseOptions, failing)
    expect(updates.at(-1)).toMatchObject({ status: 'error', errorCode: 'password' })
  })

  it('meldet Abbruch', async () => {
    const cancelling: CompressFn = async () => {
      throw new CancelledError()
    }
    const { updates } = await run(baseOptions, cancelling)
    expect(updates.at(-1)?.status).toBe('cancelled')
  })
})

describe('JobRunner', () => {
  const quick: ToolRunner = async (job, _options, ctx) => {
    ctx.progress(50, 'halb')
    await new Promise((resolve) => setTimeout(resolve, 20))
    if (ctx.signal.aborted) throw new CancelledError()
    const out = join(dir, `${job.id}.out`)
    writeFileSync(out, 'x')
    return { outputs: [out], summary: 'ok' }
  }

  it('arbeitet alle Aufträge ab und begrenzt die Parallelität', async () => {
    let active = 0
    let peak = 0
    const runner: ToolRunner = async (job, options, ctx) => {
      active += 1
      peak = Math.max(peak, active)
      const result = await quick(job, options, ctx)
      active -= 1
      return result
    }
    const jobs = Array.from({ length: 6 }, (_, index) => ({ id: String(index), paths: [original] }))
    const finals = new Map<string, string>()
    await new JobRunner({ convert: runner }, null, () => 2).start('convert', jobs, {}, (u) => finals.set(u.id, u.status))
    expect([...finals.values()].every((status) => status === 'done')).toBe(true)
    expect(finals.size).toBe(6)
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('bricht wartende Aufträge ab, bevor sie starten', async () => {
    const jobs = ['a', 'b', 'c'].map((id) => ({ id, paths: [original] }))
    const finals = new Map<string, string>()
    const runner = new JobRunner({ convert: quick }, null, () => 1)
    const done = runner.start('convert', jobs, {}, (u) => finals.set(u.id, u.status))
    runner.cancelAll()
    await done
    expect([...finals.values()].every((status) => status === 'cancelled')).toBe(true)
  })

  it('meldet unbekannte Werkzeuge als Fehler', async () => {
    const finals: JobUpdate[] = []
    await new JobRunner({}, null, () => 1).start('hash', [{ id: 'x', paths: [original] }], {}, (u) => finals.push(u))
    expect(finals.at(-1)).toMatchObject({ status: 'error', errorCode: 'unsupported' })
  })

  it('reicht Werkzeug-Daten und mehrere Ausgaben durch', async () => {
    const runner: ToolRunner = async () => ({ outputs: [join(dir, 'a.txt'), join(dir, 'b.txt')], data: { treffer: 3 }, history: false })
    const finals: JobUpdate[] = []
    await new JobRunner({ ocr: runner }, null, () => 1).start('ocr', [{ id: 'x', paths: [original] }], {}, (u) => finals.push(u))
    expect(finals.at(-1)?.data).toEqual({ treffer: 3 })
    expect(finals.at(-1)?.outputs).toHaveLength(2)
  })

  it('übergibt Fortschritt und Abbruch-Signal', async () => {
    const seen: ToolContext['signal'][] = []
    const runner: ToolRunner = async (_job, _options, ctx) => {
      seen.push(ctx.signal)
      ctx.progress(30, 'Schritt')
      return { outputs: [] }
    }
    const updates: JobUpdate[] = []
    await new JobRunner({ hash: runner }, null, () => 1).start('hash', [{ id: 'x', paths: [original] }], {}, (u) => updates.push(u))
    expect(updates.some((u) => u.status === 'running' && u.percent === 30 && u.step === 'Schritt')).toBe(true)
    expect(seen[0]?.aborted).toBe(false)
  })
})
