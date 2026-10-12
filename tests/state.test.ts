import { describe, expect, it } from 'vitest'
import type { FileInfo, JobUpdate } from '../src/shared/types'
import { addFiles, applyUpdate, isActive, isFinal, totals, type Entry } from '../src/renderer/src/state'

const file = (id: string, size = 1000): FileInfo => ({ id, path: `/x/${id}.pdf`, name: `${id}.pdf`, size })
const update = (id: string, status: JobUpdate['status'], outputSize: number | null = null): JobUpdate => ({
  id,
  status,
  percent: 0,
  step: null,
  outputPath: null,
  outputSize,
  errorCode: null,
  detail: null
})

describe('state', () => {
  it('fügt Dateien ohne Duplikate hinzu', () => {
    const first = addFiles([], [file('a'), file('b')])
    const second = addFiles(first, [{ ...file('a'), id: 'neu' }, file('c')])
    expect(second.map((e) => e.info.path)).toEqual(['/x/a.pdf', '/x/b.pdf', '/x/c.pdf'])
  })

  it('übernimmt Updates nur für die passende Datei', () => {
    const entries = addFiles([], [file('a'), file('b')])
    const next = applyUpdate(entries, update('b', 'running'))
    expect(next[0]?.update).toBeNull()
    expect(next[1]?.update?.status).toBe('running')
  })

  it('unterscheidet aktive und abgeschlossene Aufträge', () => {
    const entry = (status: JobUpdate['status']): Entry => ({ info: file('a'), update: update('a', status) })
    expect(isActive(entry('waiting'))).toBe(true)
    expect(isActive(entry('running'))).toBe(true)
    expect(isFinal(entry('done'))).toBe(true)
    expect(isFinal(entry('running'))).toBe(false)
  })

  it('summiert nur erfolgreiche Ergebnisse', () => {
    let entries = addFiles([], [file('a', 1000), file('b', 2000), file('c', 4000)])
    entries = applyUpdate(entries, update('a', 'done', 400))
    entries = applyUpdate(entries, update('b', 'nogain', 1990))
    entries = applyUpdate(entries, update('c', 'done', 1000))
    expect(totals(entries)).toEqual({ finished: 2, before: 5000, after: 1400 })
  })
})
