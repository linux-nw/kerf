import type { ToolId } from '@shared/tools'
import type { FileInfo, JobUpdate } from '@shared/types'

export interface Entry {
  info: FileInfo
  update: JobUpdate | null
}

export interface ToolState {
  entries: Entry[]
  groupId: string | null
  group: JobUpdate | null
  notice: string | null
}

export type AppState = Record<ToolId, ToolState>

export type Action =
  | { type: 'add'; tool: ToolId; files: FileInfo[]; skipped: string[] }
  | { type: 'remove'; tool: ToolId; id: string }
  | { type: 'clear'; tool: ToolId }
  | { type: 'queue'; tool: ToolId; ids: string[]; groupId: string | null }
  | { type: 'update'; update: JobUpdate }
  | { type: 'notice'; tool: ToolId; text: string | null }
  | { type: 'move'; tool: ToolId; id: string; direction: -1 | 1 }

export const TOOL_IDS: ToolId[] = ['compress', 'convert', 'pdf', 'ocr', 'metaread', 'metaclean', 'redact', 'hash', 'archive']

export function emptyTool(): ToolState {
  return { entries: [], groupId: null, group: null, notice: null }
}

export function initialState(): AppState {
  return Object.fromEntries(TOOL_IDS.map((id) => [id, emptyTool()])) as AppState
}

export function isFinal(update: JobUpdate | null): boolean {
  const status = update?.status
  return status === 'done' || status === 'nogain' || status === 'larger' || status === 'error' || status === 'cancelled'
}

export function isActive(update: JobUpdate | null): boolean {
  return update?.status === 'waiting' || update?.status === 'running'
}

export function isPending(entry: Entry): boolean {
  return entry.update === null || entry.update.status === 'cancelled' || entry.update.status === 'error'
}

function skippedNotice(skipped: string[]): string | null {
  if (skipped.length === 0) return null
  const names = skipped.slice(0, 3).join(', ')
  const more = skipped.length > 3 ? ` und ${skipped.length - 3} weitere` : ''
  return `${skipped.length} ${skipped.length === 1 ? 'Datei passt' : 'Dateien passen'} hier nicht und ${skipped.length === 1 ? 'wurde' : 'wurden'} übersprungen: ${names}${more}`
}

export function reducer(state: AppState, action: Action): AppState {
  if (action.type === 'update') {
    const { update } = action
    let changed = false
    const next = { ...state }
    for (const id of TOOL_IDS) {
      const tool = state[id]
      if (tool.groupId === update.id) {
        next[id] = { ...tool, group: update }
        changed = true
        continue
      }
      if (tool.entries.some((entry) => entry.info.id === update.id)) {
        next[id] = { ...tool, entries: tool.entries.map((entry) => (entry.info.id === update.id ? { ...entry, update } : entry)) }
        changed = true
      }
    }
    return changed ? next : state
  }

  const tool = state[action.tool]
  switch (action.type) {
    case 'add': {
      const known = new Set(tool.entries.map((entry) => entry.info.path))
      const fresh = action.files.filter((file) => !known.has(file.path))
      const duplicates = action.files.length - fresh.length
      const notice = skippedNotice(action.skipped) ?? (duplicates > 0 && fresh.length === 0 ? 'Diese Dateien sind schon in der Liste' : null)
      return {
        ...state,
        [action.tool]: {
          ...tool,
          entries: [...tool.entries, ...fresh.map((info) => ({ info, update: null }))],
          notice
        }
      }
    }
    case 'remove':
      return { ...state, [action.tool]: { ...tool, entries: tool.entries.filter((entry) => entry.info.id !== action.id) } }
    case 'clear':
      return { ...state, [action.tool]: emptyTool() }
    case 'queue': {
      const ids = new Set(action.ids)
      const waiting = (id: string): JobUpdate => ({ id, status: 'waiting', percent: 0, step: null, outputPath: null, outputSize: null, outputs: [], errorCode: null, detail: null, data: null })
      return {
        ...state,
        [action.tool]: {
          ...tool,
          entries: tool.entries.map((entry) => (ids.has(entry.info.id) ? { ...entry, update: waiting(entry.info.id) } : entry)),
          groupId: action.groupId,
          group: action.groupId ? waiting(action.groupId) : null,
          notice: null
        }
      }
    }
    case 'notice':
      return { ...state, [action.tool]: { ...tool, notice: action.text } }
    case 'move': {
      const index = tool.entries.findIndex((entry) => entry.info.id === action.id)
      const target = index + action.direction
      if (index < 0 || target < 0 || target >= tool.entries.length) return state
      const entries = [...tool.entries]
      const [moved] = entries.splice(index, 1)
      if (!moved) return state
      entries.splice(target, 0, moved)
      return { ...state, [action.tool]: { ...tool, entries } }
    }
    default:
      return state
  }
}

export function activeCount(state: AppState): number {
  let count = 0
  for (const id of TOOL_IDS) {
    count += state[id].entries.filter((entry) => isActive(entry.update)).length
    if (isActive(state[id].group)) count += 1
  }
  return count
}
