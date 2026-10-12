import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CancelledError, EngineError } from '../../errors'

export interface MsOfficeApps {
  word: boolean
  excel: boolean
  powerpoint: boolean
}

export type OfficeFamily = 'word' | 'excel' | 'powerpoint' | 'other'

export function familyOf(extension: string): OfficeFamily {
  const ext = extension.toLowerCase()
  if (['doc', 'docx', 'rtf', 'odt'].includes(ext)) return 'word'
  if (['xls', 'xlsx', 'ods'].includes(ext)) return 'excel'
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'powerpoint'
  return 'other'
}

const LO_FILTERS: Record<string, string> = {
  pdf: 'pdf',
  docx: 'docx:MS Word 2007 XML',
  odt: 'odt',
  rtf: 'rtf',
  txt: 'txt:Text',
  html: 'html',
  xlsx: 'xlsx:Calc MS Excel 2007 XML',
  ods: 'ods',
  csv: 'csv',
  pptx: 'pptx:Impress MS PowerPoint 2007 XML',
  odp: 'odp'
}

export function libreOfficeFilter(target: string): string {
  const filter = LO_FILTERS[target]
  if (!filter) throw new EngineError('unsupported', `LibreOffice kann nicht nach .${target} umwandeln`)
  return filter
}

export function libreOfficeCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  const list: string[] = []
  if (env['KERF_SOFFICE']) list.push(env['KERF_SOFFICE'])
  if (platform === 'win32') {
    const roots = [env['ProgramFiles'], env['ProgramFiles(x86)'], env['ProgramW6432'], env['LOCALAPPDATA'] ? join(env['LOCALAPPDATA'], 'Programs') : undefined].filter((entry): entry is string => Boolean(entry))
    for (const root of roots) list.push(join(root, 'LibreOffice', 'program', 'soffice.exe'))
  } else if (platform === 'darwin') {
    list.push('/Applications/LibreOffice.app/Contents/MacOS/soffice', join(homedir(), 'Applications/LibreOffice.app/Contents/MacOS/soffice'))
  } else {
    list.push('/usr/bin/soffice', '/usr/local/bin/soffice', '/usr/lib/libreoffice/program/soffice', '/opt/libreoffice/program/soffice', '/snap/bin/libreoffice')
  }
  return list
}

let sofficeCache: string | null | undefined

export function findLibreOffice(): string | null {
  if (sofficeCache !== undefined) return sofficeCache
  sofficeCache = libreOfficeCandidates(process.platform, process.env).find((candidate) => existsSync(candidate)) ?? null
  return sofficeCache
}

export function resetOfficeCache(): void {
  sofficeCache = undefined
  msCache = undefined
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, signal: AbortSignal, timeoutMs: number): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString('utf8')).slice(-6000)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const timer = setTimeout(() => {
      child.kill()
      reject(new EngineError('unknown', 'Die Umwandlung hat zu lange gedauert'))
    }, timeoutMs)
    const onAbort = () => {
      clearTimeout(timer)
      child.kill()
      reject(new CancelledError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    child.on('error', () => {
      clearTimeout(timer)
      reject(new EngineError('toolmissing', `${basename(command)} konnte nicht gestartet werden`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve({ code: code ?? 1, output })
    })
  })
}

export async function libreOfficeConvert(soffice: string, input: string, target: string, signal: AbortSignal): Promise<string> {
  const work = await mkdtemp(join(tmpdir(), 'kerf-lo-'))
  const profile = join(work, 'profil')
  const outDir = join(work, 'aus')
  try {
    const args = ['--headless', '--norestore', '--nolockcheck', '--nodefault', '--nologo', `-env:UserInstallation=${pathToFileURL(profile).href}`, '--convert-to', libreOfficeFilter(target), '--outdir', outDir, input]
    const result = await run(soffice, args, { ...process.env, HOME: process.env['HOME'] ?? work }, signal, 5 * 60 * 1000)
    const produced = join(outDir, `${basename(input, extname(input))}.${target}`)
    if (!existsSync(produced)) {
      if (/password|encrypted/i.test(result.output)) throw new EngineError('password', 'Die Datei ist passwortgeschützt')
      throw new EngineError('unreadable', 'LibreOffice konnte die Datei nicht umwandeln')
    }
    return produced
  } catch (error) {
    await rm(work, { recursive: true, force: true })
    throw error
  }
}

export async function cleanupLibreOffice(producedPath: string): Promise<void> {
  const work = join(producedPath, '..', '..')
  if (basename(work).startsWith('kerf-lo-')) await rm(work, { recursive: true, force: true })
}

let msCache: Promise<MsOfficeApps> | undefined

export function msOfficeScript(family: OfficeFamily): string {
  const common = `$ErrorActionPreference = 'Stop'\n$in = $env:KERF_IN\n$out = $env:KERF_OUT\n`
  if (family === 'word') {
    return `${common}$app = New-Object -ComObject Word.Application
$app.Visible = $false
$app.DisplayAlerts = 0
$doc = $null
try {
  $doc = $app.Documents.Open($in, $false, $true, $false)
  $doc.ExportAsFixedFormat($out, 17)
} finally {
  if ($doc) { $doc.Close(0) }
  $app.Quit()
}`
  }
  if (family === 'excel') {
    return `${common}$app = New-Object -ComObject Excel.Application
$app.Visible = $false
$app.DisplayAlerts = $false
$book = $null
try {
  $book = $app.Workbooks.Open($in, 0, $true)
  $book.ExportAsFixedFormat(0, $out)
} finally {
  if ($book) { $book.Close($false) }
  $app.Quit()
}`
  }
  return `${common}$app = New-Object -ComObject PowerPoint.Application
$pres = $null
try {
  $pres = $app.Presentations.Open($in, -1, 0, 0)
  $pres.SaveAs($out, 32)
} finally {
  if ($pres) { $pres.Close() }
  $app.Quit()
}`
}

export function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

export function detectMsOffice(): Promise<MsOfficeApps> {
  msCache ??= (async () => {
    if (process.platform !== 'win32') return { word: false, excel: false, powerpoint: false }
    const script = `foreach ($p in 'Word','Excel','PowerPoint') { if ([type]::GetTypeFromProgID($p + '.Application')) { $p } }`
    try {
      const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(script)], process.env, new AbortController().signal, 20000)
      const names = result.output.split(/\r?\n/).map((line) => line.trim())
      return { word: names.includes('Word'), excel: names.includes('Excel'), powerpoint: names.includes('PowerPoint') }
    } catch {
      return { word: false, excel: false, powerpoint: false }
    }
  })()
  return msCache
}

export async function msOfficeToPdf(family: OfficeFamily, input: string, output: string, signal: AbortSignal): Promise<void> {
  if (family === 'other') throw new EngineError('unsupported', 'Dieses Dateiformat wird von Microsoft Office hier nicht angesteuert')
  const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(msOfficeScript(family))], { ...process.env, KERF_IN: input, KERF_OUT: output }, signal, 5 * 60 * 1000)
  if (result.code !== 0 || !existsSync(output)) {
    if (/password|kennwort/i.test(result.output)) throw new EngineError('password', 'Die Datei ist passwortgeschützt')
    throw new EngineError('unreadable', 'Microsoft Office konnte die Datei nicht in PDF umwandeln')
  }
}
