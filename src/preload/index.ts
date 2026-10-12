import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AddResult, JobUpdate, KerfApi } from '@shared/types'

const api: KerfApi = {
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  addPaths: (paths) => ipcRenderer.invoke('files:add', paths),
  pathsForFiles: (files) => files.map((file) => webUtils.getPathForFile(file)).filter((path) => path !== ''),
  pickOutputDir: () => ipcRenderer.invoke('output:pick'),
  startJobs: (jobs, options) => ipcRenderer.invoke('jobs:start', jobs, options),
  cancelJob: (id) => ipcRenderer.invoke('jobs:cancel', id),
  cancelAll: () => ipcRenderer.invoke('jobs:cancelAll'),
  showInFolder: (path) => ipcRenderer.invoke('shell:show', path),
  openFolder: (path) => ipcRenderer.invoke('shell:open', path),
  getNetworkStatus: () => ipcRenderer.invoke('network:status'),
  onJobUpdate: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, update: JobUpdate) => listener(update)
    ipcRenderer.on('jobs:update', handler)
    return () => ipcRenderer.removeListener('jobs:update', handler)
  },
  onFilesOpened: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, result: AddResult) => listener(result)
    ipcRenderer.on('files:opened', handler)
    return () => ipcRenderer.removeListener('files:opened', handler)
  }
}

contextBridge.exposeInMainWorld('kerf', api)
