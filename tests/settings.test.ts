import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SettingsStore, mergeSettings, type SecretBox } from '../src/main/settings'
import { HistoryStore } from '../src/main/history'

const box: SecretBox = {
  encrypt: (text) => Buffer.from(text.split('').reverse().join('')).toString('base64'),
  decrypt: (text) => Buffer.from(text, 'base64').toString('utf8').split('').reverse().join('')
}

describe('mergeSettings', () => {
  it('übernimmt gültige Werte und ignoriert Unsinn', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      outputDir: 'C:\\Ziel',
      historyEnabled: false,
      ocrLanguages: ['eng', 'xxx', 5],
      ocrOutputs: ['docx', 'kaputt', 'pdf'],
      ai: { enabled: true, provider: 'openai', baseUrl: ' http://localhost:1234/v1 ', model: ' qwen ', apiKey: 'k' }
    })
    expect(merged.outputDir).toBe('C:\\Ziel')
    expect(merged.historyEnabled).toBe(false)
    expect(merged.ocrLanguages).toEqual(['eng'])
    expect(merged.ocrOutputs).toEqual(['pdf', 'docx'])
    expect(merged.ai).toEqual({ enabled: true, provider: 'openai', baseUrl: 'http://localhost:1234/v1', model: 'qwen', apiKey: 'k' })
  })

  it('behält Standardwerte bei leeren oder falschen Angaben und setzt den Ordner mit null zurück', () => {
    const base = mergeSettings(DEFAULT_SETTINGS, { outputDir: 'D:\\X' })
    const merged = mergeSettings(base, { ocrLanguages: [], ocrOutputs: [], ai: { provider: 'cloud', baseUrl: '' }, outputDir: undefined })
    expect(merged.outputDir).toBe('D:\\X')
    expect(merged.ocrLanguages).toEqual(['deu', 'eng'])
    expect(merged.ocrOutputs).toEqual(['pdf', 'txt'])
    expect(merged.ai.provider).toBe('ollama')
    expect(merged.ai.baseUrl).toBe(DEFAULT_SETTINGS.ai.baseUrl)
    expect(mergeSettings(base, { outputDir: null }).outputDir).toBeNull()
    expect(mergeSettings(base, null)).toEqual(base)
  })

  it('hat die KI standardmäßig aus', () => {
    expect(DEFAULT_SETTINGS.ai.enabled).toBe(false)
    expect(DEFAULT_SETTINGS.ai.provider).toBe('ollama')
    expect(DEFAULT_SETTINGS.ai.baseUrl).toBe('http://127.0.0.1:11434')
  })
})

describe('SettingsStore', () => {
  it('speichert, lädt wieder und verschlüsselt den Schlüssel', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-settings-'))
    const file = join(dir, 'einstellungen.json')
    const store = new SettingsStore(file, box)
    await store.update({ historyEnabled: false, ai: { enabled: true, apiKey: 'geheim-123', model: 'gemma4:e4b' } })
    const raw = readFileSync(file, 'utf8')
    expect(raw).not.toContain('geheim-123')
    expect(raw).toContain('enc:')
    const again = new SettingsStore(file, box)
    const loaded = await again.load()
    expect(loaded.historyEnabled).toBe(false)
    expect(loaded.ai.apiKey).toBe('geheim-123')
    expect(loaded.ai.enabled).toBe(true)
    expect(loaded.ai.model).toBe('gemma4:e4b')
  })

  it('funktioniert auch ohne Verschlüsselung und überlebt eine kaputte Datei', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-settings-'))
    const file = join(dir, 'einstellungen.json')
    const plain = new SettingsStore(file, null)
    await plain.update({ ai: { apiKey: 'abc' } })
    expect((await new SettingsStore(file, null).load()).ai.apiKey).toBe('abc')
    writeFileSync(file, '{ kaputt')
    expect(await new SettingsStore(file, null).load()).toEqual(DEFAULT_SETTINGS)
  })

  it('verwirft einen Schlüssel, der sich nicht entschlüsseln lässt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-settings-'))
    const file = join(dir, 'einstellungen.json')
    await new SettingsStore(file, box).update({ ai: { apiKey: 'x' } })
    const broken: SecretBox = { encrypt: box.encrypt, decrypt: () => { throw new Error('nein') } }
    expect((await new SettingsStore(file, broken).load()).ai.apiKey).toBe('')
  })
})

describe('Verlauf ausgeschaltet', () => {
  it('speichert nichts, solange der Verlauf aus ist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kerf-settings-'))
    const store = new HistoryStore(join(dir, 'verlauf.json'))
    store.enabled = false
    await store.add({ id: 'a', tool: 'compress', time: 1, inputName: 'a.pdf', inputSize: 1, outputPath: join(dir, 'a'), outputSize: 1, summary: 'x' })
    expect(await store.list()).toEqual([])
    store.enabled = true
    await store.add({ id: 'b', tool: 'compress', time: 2, inputName: 'b.pdf', inputSize: 1, outputPath: join(dir, 'b'), outputSize: 1, summary: 'x' })
    expect((await store.list()).map((entry) => entry.id)).toEqual(['b'])
  })
})
