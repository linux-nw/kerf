import { randomUUID } from 'node:crypto'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { accepts } from '@shared/tools'
import type { AddResult, BlobInput, FileInfo } from '@shared/types'

const MAX_FILES = 2000
const MAX_DEPTH = 8

async function walk(path: string, depth: number, accept: string[] | '*', found: string[], skipped: string[]): Promise<void> {
  if (found.length >= MAX_FILES) return
  let info
  try {
    info = await stat(path)
  } catch {
    skipped.push(basename(path))
    return
  }
  if (info.isDirectory()) {
    if (depth > MAX_DEPTH) return
    const entries = await readdir(path).catch(() => [] as string[])
    for (const entry of entries.sort()) await walk(join(path, entry), depth + 1, accept, found, skipped)
    return
  }
  if (info.isFile() && accepts(accept, path)) found.push(path)
  else skipped.push(basename(path))
}

export async function collectFiles(paths: string[], accept: string[] | '*', allowed: Set<string>): Promise<AddResult> {
  const found: string[] = []
  const skipped: string[] = []
  for (const path of paths) await walk(path, 0, accept, found, skipped)
  const files: FileInfo[] = []
  const seen = new Set<string>()
  for (const path of found) {
    if (seen.has(path)) continue
    seen.add(path)
    const info = await stat(path)
    allowed.add(path)
    files.push({ id: randomUUID(), path, name: basename(path), size: info.size })
  }
  return { files, skipped }
}

export async function collectTopLevel(paths: string[], allowed: Set<string>): Promise<AddResult> {
  const files: FileInfo[] = []
  const skipped: string[] = []
  for (const path of paths) {
    try {
      const info = await stat(path)
      allowed.add(path)
      files.push({ id: randomUUID(), path, name: basename(path), size: info.isDirectory() ? 0 : info.size })
    } catch {
      skipped.push(basename(path))
    }
  }
  return { files, skipped }
}

function safeName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim()
  return cleaned === '' ? 'Datei' : cleaned.slice(0, 120)
}

export async function saveBlobs(blobs: BlobInput[], accept: string[] | '*', allowed: Set<string>, baseDir = tmpdir()): Promise<AddResult> {
  const directory = join(baseDir, 'kerf-eingefuegt', randomUUID())
  await mkdir(directory, { recursive: true })
  const written: string[] = []
  const used = new Set<string>()
  for (const blob of blobs) {
    let name = safeName(blob.name)
    let counter = 2
    while (used.has(name)) {
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      name = `${stem}-${counter}${ext}`
      counter += 1
    }
    used.add(name)
    const path = join(directory, name)
    await writeFile(path, blob.data)
    written.push(path)
  }
  return collectFiles(written, accept, allowed)
}
