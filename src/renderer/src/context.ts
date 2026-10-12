import { createContext, useContext, type Dispatch } from 'react'
import type { NavId, ToolId } from '@shared/tools'
import type { AddResult, Capabilities, HistoryEntry, StartJob } from '@shared/types'
import type { Action, AppState } from './store'

export interface ForgetTarget {
  id: string
  name: string
  fileName: string
  onDone?: () => void
}

export interface AppApi {
  state: AppState
  dispatch: Dispatch<Action>
  nav: NavId
  go: (nav: NavId) => void
  caps: Capabilities | null
  history: HistoryEntry[]
  refreshHistory: () => void
  receive: (tool: ToolId, result: AddResult) => void
  pick: (tool: ToolId) => void
  pickFolder: (tool: ToolId) => void
  paste: (tool: ToolId) => void
  drop: (tool: ToolId, files: File[]) => void
  run: (tool: ToolId, ids: string[], jobs: StartJob[], options: unknown, groupId?: string | null) => void
  cancel: (id: string) => void
  askForget: (target: ForgetTarget) => void
  askClearHistory: () => void
}

export const AppContext = createContext<AppApi | null>(null)

export function useApp(): AppApi {
  const value = useContext(AppContext)
  if (!value) throw new Error('AppContext fehlt')
  return value
}
