import { randomUUID } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { AddResult, FileInfo } from '@shared/types'

const MAX_FILES = 2000
const MAX_DEPTH = 8

async function walk(path: string, depth: number, found: string[], skipped: string[]): Promise<void> {
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
    for (const entry of entries.sort()) await walk(join(path, entry), depth + 1, found, skipped)
    return
  }
  if (info.isFile() && extname(path).toLowerCase() === '.pdf') found.push(path)
  else skipped.push(basename(path))
}

export async function collectPdfs(paths: string[], known: Set<string>): Promise<AddResult> {
  const found: string[] = []
  const skipped: string[] = []
  for (const path of paths) await walk(path, 0, found, skipped)
  const files: FileInfo[] = []
  for (const path of found) {
    if (known.has(path)) continue
    const info = await stat(path)
    known.add(path)
    files.push({ id: randomUUID(), path, name: basename(path), size: info.size })
  }
  return { files, skipped }
}
