import type { ToolId } from './tools'

export type PresetId = 'email' | 'standard' | 'print' | 'target'

export interface FileInfo {
  id: string
  path: string
  name: string
  size: number
}

export type JobStatus = 'waiting' | 'running' | 'done' | 'nogain' | 'larger' | 'error' | 'cancelled'

export type JobErrorCode =
  | 'password'
  | 'unreadable'
  | 'missing'
  | 'write'
  | 'unsupported'
  | 'toolmissing'
  | 'unknown'

export interface JobUpdate {
  id: string
  status: JobStatus
  percent: number
  step: string | null
  outputPath: string | null
  outputSize: number | null
  outputs: string[]
  errorCode: JobErrorCode | null
  detail: string | null
  data: unknown
}

export interface StartJob {
  id: string
  paths: string[]
}

export interface NetworkStatus {
  blocked: boolean
  blockedRequests: number
}

export interface AddResult {
  files: FileInfo[]
  skipped: string[]
}

export interface Capabilities {
  libreoffice: string | null
  msoffice: boolean
  ffmpeg: boolean
  sevenZip: boolean
  ocrLanguages: string[]
  platform: string
}

export interface HistoryEntry {
  id: string
  tool: ToolId
  time: number
  inputName: string
  inputSize: number | null
  outputPath: string
  outputSize: number | null
  summary: string
  exists: boolean
}

export interface BlobInput {
  name: string
  data: Uint8Array
}

export interface CompressOptions {
  preset: PresetId
  targetBytes: number | null
  stripMetadata: boolean
  outputDir: string | null
}

export interface ConvertOptions {
  target: string
  quality: number
  icoSizes: number[]
  outputDir: string | null
  pdfDpi: number
}

export type PdfMode = 'merge' | 'split' | 'pages' | 'watermark' | 'numbers'

export interface PageEdit {
  source: number
  rotation: number
}

export interface PdfOptions {
  mode: PdfMode
  outputDir: string | null
  splitRanges: string
  splitEvery: boolean
  pages: PageEdit[]
  watermarkText: string
  watermarkOpacity: number
  watermarkSize: number
  numberFormat: string
  numberPosition: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left'
  numberStart: number
}

export type OcrOutput = 'pdf' | 'txt' | 'md' | 'docx'

export type AiProvider = 'ollama' | 'openai'

export interface AiRequest {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
}

export interface AiSettings {
  enabled: boolean
  provider: AiProvider
  baseUrl: string
  apiKey: string
  model: string
}

export interface OcrOptions {
  languages: string[]
  outputs: OcrOutput[]
  outputDir: string | null
  skipTextPages: boolean
  useAi: boolean
  ai: AiRequest | null
}

export type OcrBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }

export interface OcrPage {
  number: number
  blocks: OcrBlock[]
  confidence: number | null
  source: 'ocr' | 'textlayer'
}

export interface AiReport {
  model: string
  refined: number[]
  skipped: number[]
  failed: string | null
}

export interface OcrResult {
  languages: string[]
  pages: OcrPage[]
  confidence: number | null
  words: number
  weakPages: number[]
  ai?: AiReport | null
}

export interface MetaCleanOptions {
  outputDir: string | null
}

export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512'

export interface HashOptions {
  algorithms: HashAlgorithm[]
}

export type ArchiveMode = 'pack' | 'unpack'
export type ArchiveFormat = 'zip' | '7z' | 'tar.gz'

export interface ArchiveOptions {
  mode: ArchiveMode
  format: ArchiveFormat
  password: string
  name: string
  outputDir: string | null
}

export interface RedactBox {
  page: number
  x: number
  y: number
  width: number
  height: number
}

export interface RedactOptions {
  boxes: RedactBox[]
  checkTerms: string[]
  outputDir: string | null
}

export interface PdfInfo {
  pages: number
  sizes: { width: number; height: number }[]
}

export interface TextMatch extends RedactBox {
  text: string
}

export interface MetaGroup {
  title: string
  items: { key: string; value: string }[]
}

export interface MetaReport {
  name: string
  size: number
  kind: string
  groups: MetaGroup[]
  sensitive: string[]
  hints: string[]
}

export interface Settings {
  outputDir: string | null
  historyEnabled: boolean
  ocrLanguages: string[]
  ocrOutputs: OcrOutput[]
  ai: AiSettings
}

export interface SettingsPatch {
  outputDir?: string | null
  historyEnabled?: boolean
  ocrLanguages?: string[]
  ocrOutputs?: OcrOutput[]
  ai?: Partial<AiSettings>
}

export interface AiModel {
  id: string
  label: string
  sizeBytes: number | null
  detail: string | null
}

export interface AiStatus {
  reachable: boolean
  hostAllowed: boolean
  version: string | null
  error: string | null
  models: AiModel[]
}

export interface AiPullUpdate {
  model: string
  status: string
  completed: number | null
  total: number | null
  done: boolean
  error: string | null
}

export interface AppInfo {
  version: string
  dataPath: string
  platform: string
}

export interface KerfApi {
  pickFiles(tool: ToolId): Promise<AddResult>
  pickFolder(tool: ToolId): Promise<AddResult>
  addPaths(tool: ToolId, paths: string[]): Promise<AddResult>
  addBlobs(tool: ToolId, blobs: BlobInput[]): Promise<AddResult>
  readClipboardFiles(tool: ToolId): Promise<AddResult>
  pathsForFiles(files: File[]): string[]
  pickOutputDir(): Promise<string | null>
  startJobs(tool: ToolId, jobs: StartJob[], options: unknown): Promise<void>
  cancelJob(id: string): Promise<void>
  cancelAll(): Promise<void>
  showInFolder(path: string): Promise<void>
  openPath(path: string): Promise<void>
  getNetworkStatus(): Promise<NetworkStatus>
  getCapabilities(): Promise<Capabilities>
  listHistory(): Promise<HistoryEntry[]>
  removeHistory(ids: string[]): Promise<void>
  clearHistory(): Promise<void>
  pdfInfo(path: string): Promise<PdfInfo>
  pdfPage(path: string, page: number, width: number): Promise<Uint8Array>
  pdfFind(path: string, terms: string[], patterns: string[]): Promise<TextMatch[]>
  readMetadata(path: string): Promise<MetaReport>
  saveText(defaultName: string, content: string): Promise<string | null>
  getSettings(): Promise<Settings>
  saveSettings(patch: SettingsPatch): Promise<Settings>
  aiStatus(request: Pick<AiRequest, 'provider' | 'baseUrl' | 'apiKey'>): Promise<AiStatus>
  aiPull(baseUrl: string, model: string): Promise<void>
  aiPullCancel(): Promise<void>
  getAppInfo(): Promise<AppInfo>
  onJobUpdate(listener: (update: JobUpdate) => void): () => void
  onFilesOpened(listener: (result: AddResult) => void): () => void
  onHistoryChanged(listener: () => void): () => void
  onAiPull(listener: (update: AiPullUpdate) => void): () => void
}
