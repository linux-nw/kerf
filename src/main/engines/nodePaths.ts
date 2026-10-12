import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, sep } from 'node:path'

const localRequire: NodeRequire = typeof require === 'function' ? require : createRequire(import.meta.url)

export function packageDir(name: string): string {
  const entry = localRequire.resolve(`${name}/package.json`)
  return dirname(entry)
}

export function unpackedPath(path: string): string {
  const packed = `app.asar${sep}`
  if (path.includes(packed)) {
    const candidate = path.replace(packed, `app.asar.unpacked${sep}`)
    if (existsSync(candidate)) return candidate
  }
  return path
}

export function packageFile(name: string, ...parts: string[]): string {
  return unpackedPath(join(packageDir(name), ...parts))
}
