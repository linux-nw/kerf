import { describe, expect, it } from 'vitest'
import { isLocalUrl } from '../src/main/network'

describe('isLocalUrl', () => {
  it('erlaubt nur lokale Quellen', () => {
    expect(isLocalUrl('file:///app/index.html', undefined)).toBe(true)
    expect(isLocalUrl('https://example.com/x', undefined)).toBe(false)
    expect(isLocalUrl('http://example.com/x', undefined)).toBe(false)
    expect(isLocalUrl('wss://example.com', undefined)).toBe(false)
  })

  it('erlaubt im Dev-Betrieb nur den eigenen Dev-Server', () => {
    const dev = 'http://localhost:5173'
    expect(isLocalUrl('http://localhost:5173/src/main.tsx', dev)).toBe(true)
    expect(isLocalUrl('ws://localhost:5173/', dev)).toBe(true)
    expect(isLocalUrl('http://localhost:9999/', dev)).toBe(false)
    expect(isLocalUrl('https://example.com', dev)).toBe(false)
  })
})
