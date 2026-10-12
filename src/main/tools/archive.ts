import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { extensionOf } from '@shared/tools'
import type { ArchiveOptions } from '@shared/types'
import { sevenZipBinary } from '../engines/binaries'
import { uniquePath } from '../engines/pdf/output'
import { CancelledError, EngineError } from '../errors'
import { withDefaults, type ToolRunner } from './types'

const defaults: ArchiveOptions = { mode: 'pack', format: 'zip', password: '', name: '', outputDir: null }

export const UNPACKABLE = ['zip', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'cab', 'iso', 'wim', 'rar']

interface RunResult {
  code: number
  output: string
}

function runSevenZip(
  binary: string,
  args: string[],
  cwd: string | undefined,
  _password: string,
  onPercent: (percent: number) => void,
  signal: AbortSignal
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    const handle = (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      output = (output + text).slice(-8000)
      const matches = text.match(/(\d{1,3})%/g)
      const last = matches?.at(-1)
      if (last) onPercent(Number.parseInt(last, 10))
    }
    child.stdout.on('data', handle)
    child.stderr.on('data', handle)
    child.on('error', () => reject(new EngineError('toolmissing', '7-Zip konnte nicht gestartet werden')))
    child.on('close', (code) => {
      signal.removeEventListener('abort', onAbort)
      resolve({ code: code ?? 1, output })
    })
    const onAbort = () => {
      child.kill()
      reject(new CancelledError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    child.stdin.end()
  })
}

function failure(result: RunResult, hasPassword: boolean, fallback: 'unknown' | 'unreadable' = 'unknown'): EngineError {
  const text = result.output
  if (/wrong password|Cannot open encrypted archive|Data Error in encrypted file/i.test(text)) {
    return new EngineError('password', hasPassword ? 'Das Passwort stimmt nicht' : 'Das Archiv braucht ein Passwort')
  }
  if (/Enter password/i.test(text) && !hasPassword) return new EngineError('password', 'Das Archiv braucht ein Passwort')
  if (/Can not open the file as archive|is not supported archive|Headers Error/i.test(text)) {
    return new EngineError('unreadable', 'Das ist kein gültiges Archiv oder es ist beschädigt')
  }
  if (/No space left|There is not enough space/i.test(text)) return new EngineError('write', 'Nicht genug Speicherplatz')
  if (fallback === 'unreadable') return new EngineError('unreadable', 'Das Archiv ist beschädigt oder kein gültiges Archiv')
  const line = text.split(/\r?\n/).filter((entry) => /error/i.test(entry)).pop()
  return new EngineError('unknown', line?.trim() ?? 'Das Archiv konnte nicht verarbeitet werden')
}

function passwordArgs(password: string): string[] {
  return password ? [`-p${password}`] : []
}

async function pack(paths: string[], options: ArchiveOptions, binary: string, progress: (p: number, s: string) => void, signal: AbortSignal) {
  const first = paths[0]
  if (!first) throw new EngineError('missing', 'Keine Dateien angegeben')
  for (const path of paths) {
    if (!existsSync(path)) throw new EngineError('missing', `${basename(path)} wurde nicht gefunden`)
  }
  const directory = options.outputDir ?? dirname(first)
  await mkdir(directory, { recursive: true })
  const baseName = options.name.trim() !== '' ? options.name.trim().replace(/[\\/:*?"<>|]/g, '_') : paths.length === 1 ? basename(first, extname(first)) : 'Archiv'
  const extension = options.format === 'tar.gz' ? '.tar.gz' : `.${options.format}`
  if (options.format === 'tar.gz' && options.password) {
    throw new EngineError('unsupported', 'tar.gz unterstützt kein Passwort. Nimm ZIP oder 7z.')
  }
  const target = uniquePath(directory, baseName, extension, existsSync)
  const sameParent = paths.every((path) => dirname(path) === dirname(first))
  const cwd = sameParent ? dirname(first) : undefined
  const inputs = sameParent ? paths.map((path) => basename(path)) : paths

  if (options.format === 'tar.gz') {
    const temp = await mkdtemp(join(tmpdir(), 'kerf-tar-'))
    try {
      const tarPath = join(temp, 'inhalt.tar')
      const tar = await runSevenZip(binary, ['a', '-ttar', '-bsp1', '-y', tarPath, ...inputs], cwd, '', (p) => progress(p * 0.5, 'Dateien werden gesammelt'), signal)
      if (tar.code > 1) throw failure(tar, false)
      const gz = await runSevenZip(binary, ['a', '-tgzip', '-bsp1', '-y', target, tarPath], undefined, '', (p) => progress(50 + p * 0.5, 'Wird komprimiert'), signal)
      if (gz.code > 1) throw failure(gz, false)
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
    return target
  }

  const args = ['a', `-t${options.format}`, '-bsp1', '-y', ...passwordArgs(options.password)]
  if (options.password) {
    if (options.format === 'zip') args.push('-mem=AES256')
    else args.push('-mhe=on')
  }
  args.push(target, ...inputs)
  const result = await runSevenZip(binary, args, cwd, options.password, (p) => progress(p, 'Wird gepackt'), signal)
  if (result.code > 1 || !existsSync(target)) {
    await rm(target, { force: true })
    throw failure(result, Boolean(options.password))
  }
  return target
}

async function unpack(path: string, options: ArchiveOptions, binary: string, progress: (p: number, s: string) => void, signal: AbortSignal) {
  if (!existsSync(path)) throw new EngineError('missing', 'Die Datei wurde nicht gefunden')
  const extension = extensionOf(path)
  if (!UNPACKABLE.includes(extension)) throw new EngineError('unsupported', `.${extension} ist kein bekanntes Archivformat`)
  const directory = options.outputDir ?? dirname(path)
  const stem = basename(path).replace(/\.(tar\.(gz|bz2|xz)|tgz|[^.]+)$/i, '')
  const target = uniquePath(directory, stem === '' ? 'Entpackt' : stem, '', existsSync)
  await mkdir(target, { recursive: true })
  const args = ['x', '-bsp1', '-y', '-aou', ...passwordArgs(options.password), `-o${target}`, path]
  const result = await runSevenZip(binary, args, undefined, options.password, (p) => progress(p, 'Wird entpackt'), signal)
  if (result.code > 1) {
    await rm(target, { recursive: true, force: true })
    throw failure(result, Boolean(options.password), 'unreadable')
  }
  const entries = await readdir(target)
  const only = entries.length === 1 ? entries[0] : undefined
  if (only && /\.tar$/i.test(only) && (await stat(join(target, only))).isFile()) {
    const inner = join(target, only)
    const second = await runSevenZip(binary, ['x', '-bsp1', '-y', '-aou', `-o${target}`, inner], undefined, '', (p) => progress(p, 'Wird entpackt'), signal)
    if (second.code <= 1) await rm(inner, { force: true })
  }
  return target
}

export const archiveTool: ToolRunner = async (job, rawOptions, ctx) => {
  const options = withDefaults(defaults, rawOptions)
  const binary = await sevenZipBinary()
  if (!binary) throw new EngineError('toolmissing', '7-Zip wurde nicht gefunden. Bitte npm install erneut ausführen.')
  if (options.mode === 'unpack') {
    const first = job.paths[0]
    if (!first) throw new EngineError('missing', 'Keine Datei angegeben')
    const target = await unpack(first, options, binary, ctx.progress, ctx.signal)
    return { outputs: [target], outputSize: null, summary: 'Entpackt' }
  }
  const target = await pack(job.paths, options, binary, ctx.progress, ctx.signal)
  return { outputs: [target], summary: options.password ? 'Gepackt mit Passwort' : 'Gepackt' }
}
