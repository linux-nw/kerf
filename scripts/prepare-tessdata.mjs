import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'resources', 'tessdata')
const scope = join(root, 'node_modules', '@tesseract.js-data')

if (!existsSync(scope)) {
  console.log('Keine Sprachpakete gefunden, Texterkennung bleibt ohne Sprachdaten')
  process.exit(0)
}

mkdirSync(target, { recursive: true })
let count = 0
for (const lang of readdirSync(scope)) {
  const source = join(scope, lang, '4.0.0_best_int', `${lang}.traineddata.gz`)
  if (!existsSync(source)) continue
  copyFileSync(source, join(target, `${lang}.traineddata.gz`))
  count += 1
}
console.log(`${count} Sprachpakete für die Texterkennung bereit`)
