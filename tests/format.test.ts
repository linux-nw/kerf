import { describe, expect, it } from 'vitest'
import { formatBytes, formatPercent, parseTargetBytes, savedPercent } from '../src/shared/format'

const nbsp = ' '
const minus = '−'

describe('formatBytes', () => {
  it('nutzt Dezimalkomma und geschütztes Leerzeichen', () => {
    expect(formatBytes(3.1 * 1024 * 1024)).toBe(`3,1${nbsp}MB`)
    expect(formatBytes(38.4 * 1024 * 1024)).toBe(`38,4${nbsp}MB`)
  })

  it('zeigt ab 100 keine Nachkommastellen', () => {
    expect(formatBytes(412 * 1024)).toBe(`412${nbsp}KB`)
    expect(formatBytes(212 * 1024)).toBe(`212${nbsp}KB`)
  })

  it('kommt mit kleinen und ungültigen Werten klar', () => {
    expect(formatBytes(0)).toBe(`0${nbsp}B`)
    expect(formatBytes(512)).toBe(`512${nbsp}B`)
    expect(formatBytes(-5)).toBe(`0${nbsp}B`)
    expect(formatBytes(Number.NaN)).toBe(`0${nbsp}B`)
  })

  it('rechnet binär wie der Windows-Explorer', () => {
    expect(formatBytes(1024)).toBe(`1${nbsp}KB`)
    expect(formatBytes(1024 * 1024)).toBe(`1${nbsp}MB`)
  })
})

describe('formatPercent', () => {
  it('nutzt das echte Minuszeichen', () => {
    expect(formatPercent(3_250_000, 420_000)).toBe(`${minus}87${nbsp}%`)
  })

  it('zeigt ±0 bei gleicher Größe und Plus bei Zuwachs', () => {
    expect(formatPercent(1000, 1000)).toBe(`±0${nbsp}%`)
    expect(formatPercent(1000, 1080)).toBe(`+8${nbsp}%`)
  })

  it('schützt vor Division durch null', () => {
    expect(savedPercent(0, 10)).toBe(0)
  })
})

describe('parseTargetBytes', () => {
  it('liest Zahlen mit Punkt oder Komma', () => {
    expect(parseTargetBytes('500', 'KB')).toBe(500 * 1024)
    expect(parseTargetBytes('1,5', 'MB')).toBe(Math.round(1.5 * 1024 * 1024))
    expect(parseTargetBytes('2.5', 'MB')).toBe(Math.round(2.5 * 1024 * 1024))
  })

  it('lehnt Unsinn ab', () => {
    expect(parseTargetBytes('', 'KB')).toBeNull()
    expect(parseTargetBytes('abc', 'KB')).toBeNull()
    expect(parseTargetBytes('0', 'KB')).toBeNull()
    expect(parseTargetBytes('-4', 'MB')).toBeNull()
  })
})
