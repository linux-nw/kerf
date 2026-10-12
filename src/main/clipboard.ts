import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clipboard } from 'electron'
import type { BlobInput } from '@shared/types'

export interface ClipboardContent {
  paths: string[]
  image: BlobInput | null
}

function fromUriList(text: string): string[] {
  const paths: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('file://')) continue
    try {
      paths.push(fileURLToPath(line))
    } catch {
      continue
    }
  }
  return paths
}

function fromPlainText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^"(.*)"$/, '$1'))
    .filter((line) => line !== '' && isAbsolute(line) && existsSync(line))
}

export async function readClipboard(): Promise<ClipboardContent> {
  const paths: string[] = []
  let image: BlobInput | null = null
  try {
    const items = await clipboard.read()
    for (const item of items) {
      if (item.types.includes('text/uri-list')) paths.push(...fromUriList(await (await item.getType('text/uri-list')).text()))
      if (item.types.includes('text/plain')) paths.push(...fromPlainText(await (await item.getType('text/plain')).text()))
      const imageType = item.types.find((type) => type === 'image/png')
      if (imageType && !image) {
        const blob = await item.getType(imageType)
        const data = new Uint8Array(await blob.arrayBuffer())
        if (data.length > 0) {
          const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
          image = { name: `Zwischenablage-${stamp}.png`, data }
        }
      }
    }
  } catch {
    return { paths: [...new Set(paths)], image }
  }
  return { paths: [...new Set(paths)], image }
}
