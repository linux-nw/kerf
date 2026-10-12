import { join } from 'node:path'
import { BrowserWindow, app, dialog, ipcMain, session, shell } from 'electron'
import type { AddResult, CompressOptions, NetworkStatus, StartJob } from '@shared/types'
import { compressInWorker } from './engines/pdf/workerClient'
import { collectPdfs } from './files'
import { JobRunner } from './jobs'
import { isLocalUrl } from './network'

const devServerUrl = process.env['ELECTRON_RENDERER_URL']
const known = new Set<string>()
const runner = new JobRunner(compressInWorker, 2)
let blockedRequests = 0
let mainWindow: BrowserWindow | null = null

function startupPaths(argv: string[]): string[] {
  return argv.slice(app.isPackaged ? 1 : 2).filter((arg) => !arg.startsWith('-') && arg.toLowerCase().endsWith('.pdf'))
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

function registerIpc(): void {
  const send = (channel: string, payload: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
  }

  ipcMain.handle('files:pick', async (): Promise<AddResult> => {
    if (!mainWindow) return { files: [], skipped: [] }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'PDFs auswählen',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled) return { files: [], skipped: [] }
    return collectPdfs(result.filePaths, known)
  })

  ipcMain.handle('files:add', (_event, paths: string[]) => collectPdfs(paths.filter((p) => typeof p === 'string'), known))

  ipcMain.handle('output:pick', async (): Promise<string | null> => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Ausgabeordner wählen', properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('jobs:start', async (_event, jobs: StartJob[], options: CompressOptions) => {
    const allowed = jobs.filter((job) => known.has(job.path))
    await runner.start(allowed, options, (update) => send('jobs:update', update))
  })
  ipcMain.handle('jobs:cancel', (_event, id: string) => runner.cancel(id))
  ipcMain.handle('jobs:cancelAll', () => runner.cancelAll())

  ipcMain.handle('shell:show', (_event, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('shell:open', async (_event, path: string) => {
    await shell.openPath(path)
  })

  ipcMain.handle('network:status', (): NetworkStatus => ({ blocked: true, blockedRequests }))
}

const lock = app.requestSingleInstanceLock()
if (!lock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      void collectPdfs(startupPaths(argv), known).then((result) => {
        if (result.files.length > 0) mainWindow?.webContents.send('files:opened', result)
      })
    }
  })

  void app.whenReady().then(() => {
    installNetworkBlock()
    registerIpc()
    mainWindow = createWindow()
    mainWindow.on('closed', () => {
      runner.cancelAll()
      mainWindow = null
    })
    const initial = startupPaths(process.argv)
    if (initial.length > 0) {
      mainWindow.webContents.once('did-finish-load', () => {
        void collectPdfs(initial, known).then((result) => {
          if (result.files.length > 0) mainWindow?.webContents.send('files:opened', result)
        })
      })
    }
  })

  app.on('window-all-closed', () => app.quit())
}
