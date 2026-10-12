import { describe, expect, it } from 'vitest'
import { activeCount, initialState, isPending, reducer } from '../src/renderer/src/store'
import type { FileInfo, JobUpdate } from '../src/shared/types'

const file = (id: string, path = `/x/${id}.pdf`): FileInfo => ({ id, path, name: `${id}.pdf`, size: 100 })
const update = (id: string, status: JobUpdate['status'], extra: Partial<JobUpdate> = {}): JobUpdate => ({ id, status, percent: 0, step: null, outputPath: null, outputSize: null, outputs: [], errorCode: null, detail: null, data: null, ...extra })

describe('App-Zustand', () => {
  it('behält Listen je Werkzeug und merkt sich doppelte Dateien nicht', () => {
    let state = initialState()
    state = reducer(state, { type: 'add', tool: 'compress', files: [file('a'), file('b')], skipped: [] })
    state = reducer(state, { type: 'add', tool: 'convert', files: [file('c')], skipped: [] })
    state = reducer(state, { type: 'add', tool: 'compress', files: [file('a2', '/x/a.pdf')], skipped: [] })
    expect(state.compress.entries.map((e) => e.info.id)).toEqual(['a', 'b'])
    expect(state.convert.entries).toHaveLength(1)
    expect(state.compress.notice).toMatch(/schon in der Liste/)
  })

  it('meldet übersprungene Dateien als Hinweis', () => {
    const state = reducer(initialState(), { type: 'add', tool: 'redact', files: [], skipped: ['a.txt', 'b.txt', 'c.txt', 'd.txt'] })
    expect(state.redact.notice).toBe('4 Dateien passen hier nicht und wurden übersprungen: a.txt, b.txt, c.txt und 1 weitere')
  })

  it('leitet Updates an das richtige Werkzeug und an Gruppenaufträge', () => {
    let state = initialState()
    state = reducer(state, { type: 'add', tool: 'pdf', files: [file('p1'), file('p2')], skipped: [] })
    state = reducer(state, { type: 'queue', tool: 'pdf', ids: [], groupId: 'g1' })
    state = reducer(state, { type: 'update', update: update('g1', 'running', { percent: 40 }) })
    expect(state.pdf.group?.percent).toBe(40)
    state = reducer(state, { type: 'update', update: update('p2', 'done') })
    expect(state.pdf.entries[1]?.update?.status).toBe('done')
    expect(reducer(state, { type: 'update', update: update('unbekannt', 'done') })).toBe(state)
    expect(activeCount(state)).toBe(1)
  })

  it('stellt Einträge zum Neustart bereit und sortiert um', () => {
    let state = initialState()
    state = reducer(state, { type: 'add', tool: 'compress', files: [file('a'), file('b'), file('c')], skipped: [] })
    state = reducer(state, { type: 'queue', tool: 'compress', ids: ['a'], groupId: null })
    expect(state.compress.entries[0]?.update?.status).toBe('waiting')
    expect(isPending(state.compress.entries[1]!)).toBe(true)
    state = reducer(state, { type: 'move', tool: 'compress', id: 'c', direction: -1 })
    expect(state.compress.entries.map((e) => e.info.id)).toEqual(['a', 'c', 'b'])
    state = reducer(state, { type: 'move', tool: 'compress', id: 'a', direction: -1 })
    expect(state.compress.entries[0]?.info.id).toBe('a')
    state = reducer(state, { type: 'remove', tool: 'compress', id: 'c' })
    expect(state.compress.entries.map((e) => e.info.id)).toEqual(['a', 'b'])
    state = reducer(state, { type: 'clear', tool: 'compress' })
    expect(state.compress.entries).toEqual([])
  })
})
