import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBlocks, blocksToText } from '../src/main/engines/ocr/postprocess'
import { openOcr } from '../src/main/engines/ocr/recognize'

const fixtures = join(__dirname, 'fixtures')

async function read(name: string, languages: string[]) {
  const session = await openOcr(languages, new AbortController().signal)
  try {
    const output = await session.recognize(readFileSync(join(fixtures, name)), false)
    return { output, blocks: buildBlocks(output.raw, { frenchSpacing: languages[0] === 'fra' }) }
  } finally {
    await session.close()
  }
}

describe('Texterkennung', () => {
  it('liest deutschen Text mit Umlauten und baut Struktur', async () => {
    const { blocks, output } = await read('de.png', ['deu', 'eng'])
    const text = blocksToText(blocks)
    console.log(text, output.confidence)
    expect(text).toContain('Jahresbericht 2025')
    expect(text).toContain('Süddeutschland')
    expect(text).toContain('Größe')
    expect(text).toContain('Fußgängerzone')
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1 })
    expect(blocks.some((block) => block.kind === 'list' && block.items.length === 3)).toBe(true)
    expect(output.confidence).toBeGreaterThan(85)
  }, 120000)

  it('liest englischen Text', async () => {
    const { blocks } = await read('en.png', ['eng'])
    const text = blocksToText(blocks)
    console.log(text)
    expect(text).toContain('Quarterly Review')
    expect(text).toContain('response time')
  }, 120000)

  it('liest zwei Schriften in einem Lauf', async () => {
    const { blocks } = await read('ru.png', ['rus', 'eng'])
    const text = blocksToText(blocks)
    console.log(text)
    expect(text).toContain('Привет')
    expect(text).toContain('распознавания')
    expect(text).toContain('English text')
  }, 120000)

  it('liest hellen Text auf dunklem Grund', async () => {
    const { blocks } = await read('dark.png', ['deu'])
    const text = blocksToText(blocks)
    console.log(text)
    expect(text).toContain('Dunkler Hintergrund')
    expect(text).toContain('schwarzem Grund')
  }, 120000)

  it('kommt mit Rauschen, Schräglage und kleiner Auflösung zurecht', async () => {
    const { blocks, output } = await read('de-noisy.png', ['deu'])
    const text = blocksToText(blocks)
    console.log(text, output.confidence)
    expect(text).toContain('Jahresbericht')
    expect(text).toContain('Umsatz')
  }, 120000)

  it('meldet fehlende Sprachdaten', async () => {
    await expect(openOcr(['xxx'], new AbortController().signal)).rejects.toMatchObject({ code: 'toolmissing' })
  })
})
