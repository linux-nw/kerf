import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { toolMeta, type NavId, type ToolId } from '@shared/tools'
import type { AddResult, AiPullUpdate, Capabilities, HistoryEntry, NetworkStatus, Settings, SettingsPatch, StartJob } from '@shared/types'
import { Dialog } from './components/Dialog'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { AppContext, type AppApi, type ForgetTarget } from './context'
import { initialState, isActive, reducer, TOOL_IDS } from './store'
import { applyTheme, loadTheme, saveTheme, type ThemeChoice } from './theme'
import { ArchiveView } from './views/ArchiveView'
import { CompressView } from './views/CompressView'
import { ConvertView } from './views/ConvertView'
import { HashView } from './views/HashView'
import { HistoryView } from './views/HistoryView'
import { MetaCleanView } from './views/MetaCleanView'
import { MetaReadView } from './views/MetaReadView'
import { OcrView } from './views/OcrView'
import { PdfView } from './views/PdfView'
import { RedactView } from './views/RedactView'
import { SettingsView } from './views/SettingsView'

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

function VIEW(nav: NavId) {
  switch (nav) {
    case 'compress':
      return <CompressView />
    case 'convert':
      return <ConvertView />
    case 'pdf':
      return <PdfView />
    case 'ocr':
      return <OcrView />
    case 'metaread':
      return <MetaReadView />
    case 'metaclean':
      return <MetaCleanView />
    case 'redact':
      return <RedactView />
    case 'hash':
      return <HashView />
    case 'archive':
      return <ArchiveView />
    case 'settings':
      return <SettingsView />
    default:
      return <HistoryView />
  }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const [nav, setNav] = useState<NavId>('compress')
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme)
  const [network, setNetwork] = useState<NetworkStatus | null>(null)
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [pulls, setPulls] = useState<Record<string, AiPullUpdate>>({})
  const [forget, setForget] = useState<ForgetTarget | null>(null)
  const [clearAsk, setClearAsk] = useState(false)
  const lastTool = useRef<ToolId>('compress')
  const navRef = useRef(nav)
  navRef.current = nav
  if (nav !== 'history' && nav !== 'settings') lastTool.current = nav

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
    if (theme !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: light)')
    const listener = () => applyTheme('system')
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [theme])

  const refreshHistory = useCallback(() => {
    void window.kerf.listHistory().then(setHistory)
  }, [])

  useEffect(() => {
    refreshHistory()
    void window.kerf.getCapabilities().then(setCaps)
    void window.kerf.getSettings().then(setSettings)
    const poll = () => void window.kerf.getNetworkStatus().then(setNetwork)
    poll()
    const timer = window.setInterval(poll, 5000)
    const offUpdate = window.kerf.onJobUpdate((update) => dispatch({ type: 'update', update }))
    const offHistory = window.kerf.onHistoryChanged(refreshHistory)
    const offPull = window.kerf.onAiPull((update) => setPulls((current) => ({ ...current, [update.model]: update })))
    return () => {
      window.clearInterval(timer)
      offUpdate()
      offHistory()
      offPull()
    }
  }, [refreshHistory])

  const receive = useCallback((tool: ToolId, result: AddResult) => {
    dispatch({ type: 'add', tool, files: result.files, skipped: result.skipped })
  }, [])

  useEffect(() => {
    const offOpened = window.kerf.onFilesOpened((result) => {
      const groups = new Map<ToolId, AddResult>()
      for (const file of result.files) {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
        const tool: ToolId = TOOL_IDS.find((id) => id !== 'metaread' && id !== 'hash' && id !== 'archive' && Array.isArray(toolMeta(id).accept) && (toolMeta(id).accept as string[]).includes(ext)) ?? 'hash'
        const group = groups.get(tool) ?? { files: [], skipped: [] }
        group.files.push(file)
        groups.set(tool, group)
      }
      const first = [...groups.keys()][0]
      for (const [tool, group] of groups) receive(tool, group)
      if (first) setNav(first)
    })
    return offOpened
  }, [receive])

  const pick = useCallback((tool: ToolId) => void window.kerf.pickFiles(tool).then((result) => receive(tool, result)), [receive])
  const paste = useCallback((tool: ToolId) => void window.kerf.readClipboardFiles(tool).then((result) => {
    if (result.files.length === 0 && result.skipped.length === 0) dispatch({ type: 'notice', tool, text: 'In der Zwischenablage liegt keine Datei und kein Bild' })
    else receive(tool, result)
  }), [receive])

  const addFromFiles = useCallback(
    async (tool: ToolId, files: File[]) => {
      const withPath: File[] = []
      const blobs: Array<{ name: string; data: Uint8Array }> = []
      for (const file of files) {
        const [path] = window.kerf.pathsForFiles([file])
        if (path) withPath.push(file)
        else blobs.push({ name: file.name || 'Zwischenablage.png', data: new Uint8Array(await file.arrayBuffer()) })
      }
      const paths = window.kerf.pathsForFiles(withPath)
      if (paths.length > 0) receive(tool, await window.kerf.addPaths(tool, paths))
      if (blobs.length > 0) receive(tool, await window.kerf.addBlobs(tool, blobs))
    },
    [receive]
  )

  const drop = useCallback((tool: ToolId, files: File[]) => void addFromFiles(tool, files), [addFromFiles])

  useEffect(() => {
    let timer: number | undefined
    const target = (): ToolId => (navRef.current === 'history' || navRef.current === 'settings' ? lastTool.current : navRef.current)
    const onPaste = (event: ClipboardEvent) => {
      if (isEditable(event.target)) return
      window.clearTimeout(timer)
      const files = Array.from(event.clipboardData?.files ?? [])
      event.preventDefault()
      if (files.length > 0) void addFromFiles(target(), files)
      else paste(target())
    }
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'v' || isEditable(event.target)) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => paste(target()), 200)
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKey)
    const prevent = (event: DragEvent) => event.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [addFromFiles, paste])

  const run = useCallback((tool: ToolId, ids: string[], jobs: StartJob[], options: unknown, groupId: string | null = null) => {
    dispatch({ type: 'queue', tool, ids, groupId })
    void window.kerf.startJobs(tool, jobs, options)
  }, [])

  const cancel = useCallback((id: string) => void window.kerf.cancelJob(id), [])

  const saveSettings = useCallback(async (patch: SettingsPatch) => {
    setSettings(await window.kerf.saveSettings(patch))
  }, [])

  const dismissPull = useCallback((model: string) => {
    setPulls((current) => {
      const { [model]: _removed, ...rest } = current
      return rest
    })
  }, [])

  const api: AppApi = useMemo(
    () => ({
      state,
      dispatch,
      nav,
      go: setNav,
      caps,
      settings,
      saveSettings,
      pulls,
      dismissPull,
      history,
      refreshHistory,
      receive,
      pick,
      paste,
      drop,
      run,
      cancel,
      askForget: setForget,
      askClearHistory: () => setClearAsk(true)
    }),
    [state, nav, caps, settings, saveSettings, pulls, dismissPull, history, refreshHistory, receive, pick, paste, drop, run, cancel]
  )

  const busy = useMemo(() => {
    const result: Partial<Record<ToolId, number>> = {}
    for (const id of TOOL_IDS) {
      const count = state[id].entries.filter((entry) => isActive(entry.update)).length + (isActive(state[id].group) ? 1 : 0)
      if (count > 0) result[id] = count
    }
    return result
  }, [state])

  const confirmForget = async () => {
    if (!forget) return
    const target = forget
    setForget(null)
    await window.kerf.removeHistory([target.id])
    target.onDone?.()
    refreshHistory()
  }

  const confirmClear = async () => {
    setClearAsk(false)
    await window.kerf.clearHistory()
    refreshHistory()
  }

  return (
    <AppContext.Provider value={api}>
      <div className="app">
        <div className="app__body">
          <Sidebar active={nav} busy={busy} historyCount={history.length} theme={theme} onNavigate={setNav} onTheme={setTheme} />
          <div className="app__col">{VIEW(nav)}</div>
        </div>
        <StatusBar network={network} />
      </div>
      {forget ? (
        <Dialog title="Nur aus dem Verlauf entfernen?" confirmLabel="Aus Verlauf entfernen" danger onConfirm={() => void confirmForget()} onCancel={() => setForget(null)}>
          <p>
            Es verschwindet nur der Eintrag im Verlauf. Die Datei <strong className="kf-mono">{forget.fileName}</strong> wird <strong>nicht gelöscht</strong> und bleibt unverändert auf deinem Rechner.
          </p>
        </Dialog>
      ) : null}
      {clearAsk ? (
        <Dialog title="Den ganzen Verlauf leeren?" confirmLabel="Verlauf leeren" danger onConfirm={() => void confirmClear()} onCancel={() => setClearAsk(false)}>
          <p>
            Es werden nur die Einträge im Verlauf entfernt. <strong>Keine einzige Datei wird gelöscht.</strong> Alle Ergebnisse bleiben auf deinem Rechner.
          </p>
        </Dialog>
      ) : null}
    </AppContext.Provider>
  )
}
