import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { BrowserWindow, app, dialog, ipcMain, safeStorage, session, shell } from 'electron'
import { TOOLS, type ToolId } from '@shared/tools'
import type { AddResult, AiPullUpdate, AiStatus, AppInfo, BlobInput, Capabilities, MetaReport, NetworkStatus, PdfInfo, Settings, SettingsPatch, StartJob, TextMatch } from '@shared/types'
import { aiStatus, pullModel, type AiConnection } from './ai/client'
import { readClipboard } from './clipboard'
import { setHtmlToPdf } from './engines/convert/htmlPdf'
import { detectCapabilities } from './engines/capabilities'
import { readMetadata } from './engines/meta/read'
import { setPdfOpener } from './engines/pdf/open'
import { PATTERNS, escapeRegex } from './engines/pdf/renderCore'
import { openPdfInWorker } from './engines/pdf/renderSession'
import { compressInWorker } from './engines/pdf/workerClient'
import { EngineError } from './errors'
import { collectFiles, collectTopLevel, saveBlobs } from './files'
import { HistoryStore } from './history'
import { htmlToPdfWindow } from './htmlWindow'
import { JobRunner } from './jobs'
import { isLocalUrl } from './network'
import { PdfCache } from './pdfCache'
import { SettingsStore } from './settings'
import { createCompressTool } from './tools/compress'
import { createConvertTool } from './tools/convert'
import { archiveTool } from './tools/archive'
import { hashTool } from './tools/hash'
import { metaCleanTool } from './tools/meta'
import { ocrTool } from './tools/ocr'
import { pdfTool } from './tools/pdf'
import { redactTool } from './tools/redact'

const devServerUrl = process.env['ELECTRON_RENDERER_URL']
const allowed = new Set<string>()
let blockedRequests = 0
let mainWindow: BrowserWindow | null = null
let history: HistoryStore
let settings: SettingsStore
let pullController: AbortController | null = null
let runner: JobRunner
let capabilities: Promise<Capabilities> | null = null
const pdfCache = new PdfCache()

const CONCURRENCY: Record<ToolId, number> = { compress: 2, convert: 2, pdf: 2, ocr: 1, metaread: 1, metaclean: 3, redact: 1, hash: 2, archive: 1 }

function acceptFor(tool: ToolId): string[] | '*' {
  return TOOLS.find((entry) => entry.id === tool)?.accept ?? '*'
}

function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && TOOLS.some((entry) => entry.id === value)
}

function startupPaths(argv: string[]): string[] {
  const appPath = resolve(app.getAppPath())
  return argv.slice(app.isPackaged ? 1 : 2).filter((arg) => !arg.startsWith('-') && arg.length > 1 && resolve(arg) !== appPath && resolve(arg) !== resolve('.'))
}

function installNetworkBlock(): void {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (isLocalUrl(details.url, devServerUrl)) {
      callback({})
      return
    }
    blockedRequests += 1
    callback({ cancel: true })
  })
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0e1113',
    title: 'Kerf',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (!isLocalUrl(url, devServerUrl)) event.preventDefault()
  })
  if (devServerUrl) void window.loadURL(devServerUrl)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
  return window
}

function requireAllowed(path: unknown): string {
  if (typeof path !== 'string' || !allowed.has(path)) throw new EngineError('missing', 'Diese Datei wurde nicht ausgewählt')
  return path
}

async function addWithAccept(tool: ToolId, paths: string[]): Promise<AddResult> {
  const clean = paths.filter((entry) => typeof entry === 'string')
  if (tool === 'archive') return collectTopLevel(clean, allowed)
  return collectFiles(clean, acceptFor(tool), allowed)
}

function withPastedOutput(job: StartJob, options: unknown): unknown {
  const pastedRoot = join(tmpdir(), 'kerf-eingefuegt')
  if (!job.paths.every((path) => path.startsWith(pastedRoot))) return options
  const base = typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {}
  if (base['outputDir']) return options
  return { ...base, outputDir: app.getPath('downloads') }
}

function withSettings(tool: ToolId, options: unknown): unknown {
  const current = settings.current()
  const next: Record<string, unknown> = typeof options === 'object' && options !== null ? { ...(options as Record<string, unknown>) } : {}
  if (!next['outputDir'] && current.outputDir) next['outputDir'] = current.outputDir
  if (tool === 'ocr') {
    const { provider, baseUrl, apiKey, model } = current.ai
    next['ai'] = next['useAi'] === true && model !== '' ? { provider, baseUrl, apiKey, model } : null
  }
  return next
}

function parseConnection(value: unknown): AiConnection | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as Record<string, unknown>
  const provider = input['provider'] === 'openai' ? 'openai' : input['provider'] === 'ollama' ? 'ollama' : null
  if (!provider || typeof input['baseUrl'] !== 'string') return null
  return { provider, baseUrl: input['baseUrl'], apiKey: typeof input['apiKey'] === 'string' ? input['apiKey'] : '' }
}

function registerIpc(): void {
  const send = (channel: string, payload?: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
  }

  ipcMain.handle('files:pick', async (_event, tool: unknown): Promise<AddResult> => {
    if (!mainWindow || !isToolId(tool)) return { files: [], skipped: [] }
    const accept = acceptFor(tool)
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Dateien auswählen',
      properties: ['openFile', 'multiSelections'],
      filters: accept !== '*' && accept.length ? [{ name: 'Unterstützte Dateien', extensions: accept }, { name: 'Alle Dateien', extensions: ['*'] }] : undefined
    })
    if (result.canceled) return { files: [], skipped: [] }
    return addWithAccept(tool, result.filePaths)
  })

  ipcMain.handle('files:pickFolder', async (_event, tool: unknown): Promise<AddResult> => {
    if (!mainWindow || !isToolId(tool)) return { files: [], skipped: [] }
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Ordner auswählen', properties: ['openDirectory'] })
    if (result.canceled) return { files: [], skipped: [] }
    return addWithAccept(tool, result.filePaths)
  })

  ipcMain.handle('files:add', (_event, tool: unknown, paths: unknown) => (isToolId(tool) && Array.isArray(paths) ? addWithAccept(tool, paths as string[]) : { files: [], skipped: [] }))

  ipcMain.handle('files:addBlobs', async (_event, tool: unknown, blobs: unknown) => {
    if (!isToolId(tool) || !Array.isArray(blobs)) return { files: [], skipped: [] }
    const clean = (blobs as BlobInput[]).filter((blob) => blob && typeof blob.name === 'string' && blob.data instanceof Uint8Array && blob.data.length > 0)
    return saveBlobs(clean, acceptFor(tool), allowed)
  })

  ipcMain.handle('files:clipboard', async (_event, tool: unknown): Promise<AddResult> => {
    if (!isToolId(tool)) return { files: [], skipped: [] }
    const content = await readClipboard()
    if (content.paths.length > 0) return addWithAccept(tool, content.paths)
    if (content.image) return saveBlobs([content.image], acceptFor(tool), allowed)
    return { files: [], skipped: [] }
  })

  ipcMain.handle('output:pick', async (): Promise<string | null> => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Ausgabeordner wählen', properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('jobs:start', async (_event, tool: unknown, jobs: unknown, options: unknown) => {
    if (!isToolId(tool) || !Array.isArray(jobs)) return
    const valid = (jobs as StartJob[]).filter((job) => job && typeof job.id === 'string' && Array.isArray(job.paths) && job.paths.length > 0 && job.paths.every((path) => allowed.has(path)))
    const first = valid[0]
    const effective = withSettings(tool, first ? withPastedOutput(first, options) : options)
    await runner.start(tool, valid, effective, (update) => {
      send('jobs:update', update)
      if (update.status === 'done') send('history:changed')
    })
  })
  ipcMain.handle('jobs:cancel', (_event, id: string) => runner.cancel(id))
  ipcMain.handle('jobs:cancelAll', () => runner.cancelAll())

  ipcMain.handle('shell:show', (_event, path: string) => {
    if (typeof path === 'string') shell.showItemInFolder(path)
  })
  ipcMain.handle('shell:open', async (_event, path: string) => {
    if (typeof path === 'string') await shell.openPath(path)
  })

  ipcMain.handle('network:status', (): NetworkStatus => ({ blocked: true, blockedRequests }))
  ipcMain.handle('capabilities', () => (capabilities ??= detectCapabilities()))

  ipcMain.handle('history:list', () => history.list())
  ipcMain.handle('history:remove', async (_event, ids: unknown) => {
    if (Array.isArray(ids)) await history.remove(ids.filter((id): id is string => typeof id === 'string'))
    send('history:changed')
  })
  ipcMain.handle('history:clear', async () => {
    await history.clear()
    send('history:changed')
  })

  ipcMain.handle('pdf:info', async (_event, path: unknown): Promise<PdfInfo> => (await pdfCache.get(requireAllowed(path))).info())
  ipcMain.handle('pdf:page', async (_event, path: unknown, page: number, width: number): Promise<Uint8Array> => {
    const doc = await pdfCache.get(requireAllowed(path))
    const rendered = await doc.render(Math.max(1, Math.floor(page)), { width: Math.min(2400, Math.max(60, Math.floor(width))), format: 'png' })
    return rendered.data
  })
  ipcMain.handle('pdf:find', async (_event, path: unknown, terms: unknown, presets: unknown): Promise<TextMatch[]> => {
    const doc = await pdfCache.get(requireAllowed(path))
    const patterns = [
      ...(Array.isArray(terms) ? (terms as unknown[]).filter((term): term is string => typeof term === 'string' && term.trim() !== '').map((term) => escapeRegex(term.trim())) : []),
      ...(Array.isArray(presets) ? (presets as unknown[]).flatMap((id) => (typeof id === 'string' && PATTERNS[id] ? [PATTERNS[id]] : [])) : [])
    ]
    if (patterns.length === 0) return []
    const found = await doc.find(patterns, 'gi')
    return found.slice(0, 3000)
  })

  ipcMain.handle('meta:read', async (_event, path: unknown): Promise<MetaReport> => readMetadata(requireAllowed(path)))

  ipcMain.handle('settings:get', (): Promise<Settings> => settings.load())
  ipcMain.handle('settings:save', async (_event, patch: unknown): Promise<Settings> => {
    const saved = await settings.update((typeof patch === 'object' && patch !== null ? patch : {}) as SettingsPatch)
    history.enabled = saved.historyEnabled
    return saved
  })
  ipcMain.handle('ai:status', async (_event, request: unknown): Promise<AiStatus> => {
    const connection = parseConnection(request)
    if (!connection) return { reachable: false, hostAllowed: true, version: null, error: 'Ungültige Angaben', models: [] }
    return aiStatus(connection)
  })
  ipcMain.handle('ai:pull', (_event, baseUrl: unknown, model: unknown) => {
    if (typeof baseUrl !== 'string' || typeof model !== 'string' || !/^[\w.\-:/]{1,120}$/.test(model)) return
    pullController?.abort()
    const controller = new AbortController()
    pullController = controller
    const connection: AiConnection = { provider: 'ollama', baseUrl, apiKey: settings.current().ai.apiKey }
    void pullModel(connection, model, (update: AiPullUpdate) => send('ai:pull', update), controller.signal).finally(() => {
      if (pullController === controller) pullController = null
    })
  })
  ipcMain.handle('ai:pullCancel', () => pullController?.abort())
  ipcMain.handle('app:info', (): AppInfo => ({ version: app.getVersion(), dataPath: app.getPath('userData'), platform: process.platform }))

  ipcMain.handle('text:save', async (_event, defaultName: unknown, content: unknown): Promise<string | null> => {
    if (!mainWindow || typeof defaultName !== 'string' || typeof content !== 'string') return null
    const result = await dialog.showSaveDialog(mainWindow, { title: 'Speichern unter', defaultPath: defaultName })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, content, 'utf8')
    return result.filePath
  })
}

async function openStartup(argv: string[]): Promise<void> {
  const paths = startupPaths(argv)
  if (paths.length === 0) return
  const result = await collectTopLevel(paths, allowed)
  if (result.files.length > 0) mainWindow?.webContents.send('files:opened', result)
}

const lock = app.requestSingleInstanceLock()
if (!lock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    void openStartup(argv)
  })

  void app.whenReady().then(async () => {
    history = new HistoryStore(join(app.getPath('userData'), 'verlauf.json'))
    settings = new SettingsStore(
      join(app.getPath('userData'), 'einstellungen.json'),
      safeStorage.isEncryptionAvailable()
        ? { encrypt: (text) => safeStorage.encryptString(text).toString('base64'), decrypt: (text) => safeStorage.decryptString(Buffer.from(text, 'base64')) }
        : null
    )
    history.enabled = (await settings.load()).historyEnabled
    setPdfOpener(openPdfInWorker)
    setHtmlToPdf(htmlToPdfWindow)
    runner = new JobRunner(
      {
        compress: createCompressTool(compressInWorker),
        convert: createConvertTool(),
        pdf: pdfTool,
        ocr: ocrTool,
        metaclean: metaCleanTool,
        redact: redactTool,
        hash: hashTool,
        archive: archiveTool
      },
      history,
      (tool) => CONCURRENCY[tool]
    )
    installNetworkBlock()
    registerIpc()
    mainWindow = createWindow()
    mainWindow.on('closed', () => {
      pullController?.abort()
      runner.cancelAll()
      void pdfCache.closeAll()
      mainWindow = null
    })
    mainWindow.webContents.once('did-finish-load', () => void openStartup(process.argv))
  })

  app.on('window-all-closed', () => app.quit())
}
