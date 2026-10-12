import { describe, expect, it } from 'vitest'
import { anyTargets, describeSource, SOURCE_FORMATS, targetsFor } from '../src/shared/convertTargets'

const caps = { libreoffice: null, ffmpeg: false }

describe('Quellformate', () => {
  it('hat zu jedem Quellformat Ziele', () => {
    for (const format of SOURCE_FORMATS) {
      expect(targetsFor(format.id, caps).length, format.id).toBeGreaterThan(0)
    }
  })

  it('beschreibt Formate verständlich', () => {
    expect(describeSource('png')).toMatchObject({ label: 'PNG', tag: 'Bild', kind: 'image' })
    expect(describeSource('JPEG')).toMatchObject({ label: 'JPG', kind: 'image' })
    expect(describeSource('docx')).toMatchObject({ label: 'DOCX', tag: 'Textdokument' })
    expect(describeSource('mp4').tag).toBe('Video')
    expect(describeSource('xyz')).toMatchObject({ label: 'XYZ', tag: 'Datei', kind: null })
  })

  it('führt Zielformate für den Fall ohne Datei ohne Doppelte zusammen', () => {
    const list = anyTargets(caps)
    const ids = list.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.slice(0, 3)).toEqual(['png', 'jpg', 'webp'])
    for (const id of ['ico', 'pdf', 'mp3', 'docx', 'json']) expect(ids).toContain(id)
    expect(list.find((item) => item.id === 'png')?.label).toBe('PNG')
  })

  it('ordnet Bild vor Symbol vor Dokument', () => {
    const groups = [...new Set(anyTargets(caps).map((item) => item.group))]
    expect(groups.slice(0, 3)).toEqual(['Bild', 'Symbol', 'Dokument'])
  })
})
