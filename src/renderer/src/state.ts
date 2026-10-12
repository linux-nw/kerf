import type { CompressOptions, FileInfo, JobUpdate } from '@shared/types'

export interface Entry {
  info: FileInfo
  update: JobUpdate | null
}

export function applyUpdate(entries: Entry[], update: JobUpdate): Entry[] {
  return entries.map((entry) => (entry.info.id === update.id ? { ...entry, update } : entry))
}

export function addFiles(entries: Entry[], files: FileInfo[]): Entry[] {
  const known = new Set(entries.map((entry) => entry.info.path))
  return [...entries, ...files.filter((file) => !known.has(file.path)).map((info) => ({ info, update: null }))]
}

export function isFinal(entry: Entry): boolean {
  const status = entry.update?.status
  return status === 'done' || status === 'nogain' || status === 'larger' || status === 'error' || status === 'cancelled'
}

export function isActive(entry: Entry): boolean {
  const status = entry.update?.status
  return status === 'waiting' || status === 'running'
}

export interface Totals {
  finished: number
  before: number
  after: number
}

export function totals(entries: Entry[]): Totals {
  let finished = 0
  let before = 0
  let after = 0
  for (const entry of entries) {
    if (entry.update?.status === 'done' && entry.update.outputSize !== null) {
      finished += 1
      before += entry.info.size
      after += entry.update.outputSize
    }
  }
  return { finished, before, after }
}

export const defaultOptions: CompressOptions = { preset: 'standard', targetBytes: null, stripMetadata: false, outputDir: null }
