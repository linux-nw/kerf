export type PresetId = 'email' | 'standard' | 'print' | 'target'

export interface CompressOptions {
  preset: PresetId
  targetBytes: number | null
  stripMetadata: boolean
  outputDir: string | null
}

export interface FileInfo {
  id: string
  path: string
  name: string
  size: number
}

export type JobStatus = 'waiting' | 'running' | 'done' | 'nogain' | 'larger' | 'error' | 'cancelled'

export type JobErrorCode = 'password' | 'unreadable' | 'missing' | 'write' | 'unknown'

export interface JobUpdate {
  id: string
  status: JobStatus
  percent: number
  step: string | null
  outputPath: string | null
  outputSize: number | null
  errorCode: JobErrorCode | null
  detail: string | null
}

export interface StartJob {
  id: string
  path: string
}

export interface NetworkStatus {
  blocked: boolean
  blockedRequests: number
}

export interface AddResult {
  files: FileInfo[]
  skipped: string[]
}

export interface KerfApi {
  pickFiles(): Promise<AddResult>
  addPaths(paths: string[]): Promise<AddResult>
  pathsForFiles(files: File[]): string[]
  pickOutputDir(): Promise<string | null>
  startJobs(jobs: StartJob[], options: CompressOptions): Promise<void>
  cancelJob(id: string): Promise<void>
  cancelAll(): Promise<void>
  showInFolder(path: string): Promise<void>
  openFolder(path: string): Promise<void>
  getNetworkStatus(): Promise<NetworkStatus>
  onJobUpdate(listener: (update: JobUpdate) => void): () => void
  onFilesOpened(listener: (result: AddResult) => void): () => void
}
