import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AddResult, JobUpdate, KerfApi } from '@shared/types'

function listen<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: KerfApi = {
  pickFiles: (tool) => ipcRenderer.invoke('files:pick', tool),
  pickFolder: (tool) => ipcRenderer.invoke('files:pickFolder', tool),
  addPaths: (tool, paths) => ipcRenderer.invoke('files:add', tool, paths),
  addBlobs: (tool, blobs) => ipcRenderer.invoke('files:addBlobs', tool, blobs),
  readClipboardFiles: (tool) => ipcRenderer.invoke('files:clipboard', tool),
  pathsForFiles: (files) =>
    files
      .map((file) => {
        try {
          return webUtils.getPathForFile(file)
        } catch {
          return ''
        }
      })
      .filter((path) => path !== ''),
  pickOutputDir: () => ipcRenderer.invoke('output:pick'),
  startJobs: (tool, jobs, options) => ipcRenderer.invoke('jobs:start', tool, jobs, options),
  cancelJob: (id) => ipcRenderer.invoke('jobs:cancel', id),
  cancelAll: () => ipcRenderer.invoke('jobs:cancelAll'),
  showInFolder: (path) => ipcRenderer.invoke('shell:show', path),
  openPath: (path) => ipcRenderer.invoke('shell:open', path),
  getNetworkStatus: () => ipcRenderer.invoke('network:status'),
  getCapabilities: () => ipcRenderer.invoke('capabilities'),
  listHistory: () => ipcRenderer.invoke('history:list'),
  removeHistory: (ids) => ipcRenderer.invoke('history:remove', ids),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  pdfInfo: (path) => ipcRenderer.invoke('pdf:info', path),
  pdfPage: (path, page, width) => ipcRenderer.invoke('pdf:page', path, page, width),
  pdfFind: (path, terms, patterns) => ipcRenderer.invoke('pdf:find', path, terms, patterns),
  readMetadata: (path) => ipcRenderer.invoke('meta:read', path),
  saveText: (defaultName, content) => ipcRenderer.invoke('text:save', defaultName, content),
  onJobUpdate: (listener) => listen<JobUpdate>('jobs:update', listener),
  onFilesOpened: (listener) => listen<AddResult>('files:opened', listener),
  onHistoryChanged: (listener) => listen<undefined>('history:changed', () => listener())
}

contextBridge.exposeInMainWorld('kerf', api)
