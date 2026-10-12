import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'design-system/tokens.json')
const target = resolve(root, 'src/renderer/src/styles/tokens.css')

const tokens = JSON.parse(readFileSync(source, 'utf8'))
const themes = tokens.color.themes.map((theme) => theme.id)
const first = themes[0]

const alias = (value) => {
  const match = /^\{(.+)\}$/.exec(value)
  return match ? `var(--${match[1]})` : value
}

const valueFor = (token, theme) => {
  if (typeof token.value === 'string') return alias(token.value)
  return alias(token.value[theme] ?? token.value[first])
}

const block = (selector, lines) => `${selector} {\n${lines.map((line) => `  ${line}`).join('\n')}\n}\n`

const perTheme = (families) =>
  themes.map((theme) => {
    const lines = []
    for (const family of families) {
      for (const token of tokens[family].tokens) {
        const themed = typeof token.value !== 'string'
        if (theme === first || themed) lines.push(`--${token.name}: ${valueFor(token, theme)};`)
      }
    }
    return { theme, lines }
  })

const out = [`/* ${tokens.name} — generated from tokens.json */\n`]

const themed = perTheme(['color', 'shadow'])
for (const { theme, lines } of themed) {
  const selector = theme === first ? `:root,\n[data-theme="${theme}"]` : `[data-theme="${theme}"]`
  out.push(block(selector, lines))
}

const flat = []
for (const family of Object.keys(tokens)) {
  if (['name', 'version', 'color', 'shadow', 'type'].includes(family)) continue
  for (const token of tokens[family].tokens) flat.push(`--${token.name}: ${token.value};`)
}
for (const [key, stack] of Object.entries(tokens.type.families)) flat.push(`--font-${key}: ${stack};`)
out.push(block(':root', flat))

for (const group of tokens.type.groups) {
  for (const style of group.styles) {
    const family = style.family ?? group.family
    const lines = [
      `font-family: var(--font-${family});`,
      `font-size: ${style.fontSize};`,
      `line-height: ${style.lineHeight};`,
      `font-weight: ${style.fontWeight};`
    ]
    if (style.letterSpacing) lines.push(`letter-spacing: ${style.letterSpacing};`)
    out.push(block(`.${style.name}`, lines))
  }
}

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, out.join('\n'))
console.log(`tokens.css geschrieben (${out.length} Blöcke)`)
