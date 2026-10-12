import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { extensionOf } from '@shared/tools'
import type { MetaCleanOptions } from '@shared/types'
import { cleanBytes } from '../engines/meta/clean'
import { readMetadata } from '../engines/meta/read'
import { nextOutputPath } from '../engines/pdf/output'
import { EngineError } from '../errors'
import { withDefaults, type ToolRunner } from './types'

const defaults: MetaCleanOptions = { outputDir: null }

export const metaCleanTool: ToolRunner = async (job, rawOptions, ctx) => {
  const options = withDefaults(defaults, rawOptions)
  const path = job.paths[0]
  if (!path) throw new EngineError('missing', 'Keine Datei angegeben')
  const extension = extensionOf(path)
  let input: Buffer
  try {
    input = await readFile(path)
  } catch {
    throw new EngineError('missing', 'Die Datei wurde nicht gefunden')
  }
  ctx.progress(10, 'Metadaten werden gelesen')
  const before = await readMetadata(path)
  if (before.sensitive.length === 0) {
    return { status: 'nogain', outputs: [], detail: 'Keine Metadaten gefunden, die entfernt werden müssten', data: { before: before.sensitive, after: [], hints: before.hints } }
  }
  ctx.progress(40, 'Metadaten werden entfernt')
  const cleaned = await cleanBytes(input, extension)
  const outputPath = nextOutputPath(path, options.outputDir, existsSync, 'bereinigt', `.${extension}`)
  try {
    await mkdir(dirname(outputPath), { recursive: true })
    const partial = `${outputPath}.part`
    await writeFile(partial, cleaned.bytes)
    await rename(partial, outputPath)
  } catch (error) {
    throw new EngineError('write', error instanceof Error ? error.message : String(error))
  }
  ctx.progress(85, 'Ergebnis wird geprüft')
  const after = await readMetadata(outputPath)
  const removed = before.sensitive.filter((item) => !after.sensitive.includes(item))
  return {
    outputs: [outputPath],
    summary: 'Metadaten entfernt',
    detail: cleaned.note,
    data: { before: before.sensitive, after: after.sensitive, removed, hints: after.hints }
  }
}
