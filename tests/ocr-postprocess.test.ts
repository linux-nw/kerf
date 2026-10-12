import { describe, expect, it } from 'vitest'
import { blocksToText, buildBlocks, joinLines, normalizeText, pagesToMarkdown, pagesToText, textToBlocks, type RawLine, type RawPage } from '../src/main/engines/ocr/postprocess'

function line(text: string, y: number, height = 20, confidence = 95, x0 = 50): RawLine {
  return { text, confidence, x0, y0: y, x1: x0 + text.length * 10, y1: y + height, words: text.split(' ').map((word) => ({ text: word, confidence })) }
}

function page(...paragraphs: RawLine[][]): RawPage {
  return { width: 1000, height: 1400, paragraphs: paragraphs.map((lines) => ({ lines })) }
}

describe('Texte säubern', () => {
  it('ersetzt Ligaturen, Sonderleerzeichen und doppelte Leerzeichen', () => {
    expect(normalizeText('Ofﬁce  und   ﬂie­ßen')).toBe('Office und fließen')
  })

  it('entfernt Leerzeichen vor Satzzeichen, außer bei französischer Schreibweise', () => {
    expect(normalizeText('Hallo , Welt !')).toBe('Hallo, Welt!')
    expect(normalizeText('Bonjour : le monde', true)).toBe('Bonjour : le monde')
  })

  it('fügt Silbentrennung am Zeilenende wieder zusammen', () => {
    expect(joinLines(['Die Verarbeitung der Rech-', 'nung dauert lange'])).toBe('Die Verarbeitung der Rechnung dauert lange')
    expect(joinLines(['Das ist ein E-', 'Mail-System'])).toBe('Das ist ein E- Mail-System')
    expect(joinLines(['eins', 'zwei'])).toBe('eins zwei')
  })
})

describe('Seiten aufbauen', () => {
  it('macht aus Zeilen eines Absatzes einen Fließtext', () => {
    const blocks = buildBlocks(page([line('Dies ist der erste Satz und', 100), line('er geht in der nächsten Zeile weiter.', 125)]))
    expect(blocks).toEqual([{ kind: 'paragraph', text: 'Dies ist der erste Satz und er geht in der nächsten Zeile weiter.' }])
  })

  it('erkennt Überschriften an der Zeilenhöhe', () => {
    const blocks = buildBlocks(
      page(
        [line('Jahresbericht 2025', 50, 48)],
        [line('Zusammenfassung', 130, 30)],
        [line('Der Umsatz ist im Berichtsjahr deutlich gestiegen und', 200), line('lag über den Erwartungen der Geschäftsführung.', 225)],
        [line('Der Gewinn blieb stabil und die Kosten sanken leicht in', 300), line('allen Bereichen des Unternehmens im Vergleich.', 325)]
      )
    )
    expect(blocks[0]).toEqual({ kind: 'heading', level: 1, text: 'Jahresbericht 2025' })
    expect(blocks[1]).toEqual({ kind: 'heading', level: 2, text: 'Zusammenfassung' })
    expect(blocks[2]?.kind).toBe('paragraph')
    expect(blocks).toHaveLength(4)
  })

  it('macht Aufzählungen und nummerierte Listen zu Listen', () => {
    const blocks = buildBlocks(
      page(
        [line('• Äpfel kaufen', 100), line('• Birnen waschen und', 125), line('schneiden', 150), line('• Kuchen backen', 175)],
        [line('1. Ofen heizen', 300), line('2. Teig kneten', 325)]
      )
    )
    expect(blocks[0]).toEqual({ kind: 'list', ordered: false, items: ['Äpfel kaufen', 'Birnen waschen und schneiden', 'Kuchen backen'] })
    expect(blocks[1]).toEqual({ kind: 'list', ordered: true, items: ['Ofen heizen', 'Teig kneten'] })
  })

  it('wirft Rauschen und unsichere Zeilen weg, behält aber unsichere echte Wörter', () => {
    const blocks = buildBlocks(
      page(
        [line('Die Rechnung ist bezahlt.', 100, 20, 91)],
        [line('~ . ,|', 140, 20, 12)],
        [line('x7', 160, 20, 20)],
        [line('Danke für Ihren Auftrag', 200, 20, 58)]
      )
    )
    expect(blocksToText(blocks)).toBe('Die Rechnung ist bezahlt.\n\nDanke für Ihren Auftrag')
  })

  it('setzt Absätze fort, die mitten im Satz getrennt wurden', () => {
    const blocks = buildBlocks(page([line('Der Vertrag wurde am Montag und', 100), line('Dienstag', 125)], [line('von beiden Seiten unterschrieben.', 300)]))
    expect(blocks).toEqual([{ kind: 'paragraph', text: 'Der Vertrag wurde am Montag und Dienstag von beiden Seiten unterschrieben.' }])
  })

  it('erkennt Versalien-Zeilen als kleine Überschrift', () => {
    const blocks = buildBlocks(page([line('RECHNUNGSDETAILS', 100, 24)], [line('Position eins ist der Versand der Ware an den Kunden.', 160), line('Position zwei ist die Beratung vor Ort.', 185)]))
    expect(blocks[0]).toEqual({ kind: 'heading', level: 3, text: 'RECHNUNGSDETAILS' })
  })

  it('liefert für leere Seiten keine Blöcke', () => {
    expect(buildBlocks(page([line('.', 10, 20, 5)]))).toEqual([])
    expect(buildBlocks(page())).toEqual([])
  })
})

describe('Textlagen und Ausgabe', () => {
  it('baut Blöcke aus vorhandenem Text', () => {
    const blocks = textToBlocks('Erster Absatz mit Rech-\nnung.\n\n- eins\n- zwei\n\n\nLetzter Absatz.')
    expect(blocks).toEqual([
      { kind: 'paragraph', text: 'Erster Absatz mit Rechnung.' },
      { kind: 'list', ordered: false, items: ['eins', 'zwei'] },
      { kind: 'paragraph', text: 'Letzter Absatz.' }
    ])
  })

  it('schreibt sauberen Text und Markdown', () => {
    const pages = [
      { number: 1, confidence: 90, source: 'ocr' as const, blocks: [{ kind: 'heading' as const, level: 1 as const, text: 'Titel_1' }, { kind: 'paragraph' as const, text: 'Text * mit Stern' }, { kind: 'list' as const, ordered: true, items: ['a', 'b'] }] },
      { number: 2, confidence: 90, source: 'ocr' as const, blocks: [{ kind: 'paragraph' as const, text: 'Zweite Seite' }] }
    ]
    expect(pagesToText(pages)).toBe('Titel_1\n\nText * mit Stern\n\n1. a\n2. b\n\nZweite Seite')
    expect(pagesToMarkdown(pages, true)).toBe('<!-- Seite 1 -->\n\n# Titel\\_1\n\nText \\* mit Stern\n\n1. a\n2. b\n\n<!-- Seite 2 -->\n\nZweite Seite\n')
  })
})

describe('Vorsicht bei Listen', () => {
  it('hält einzelne nummerierte Zeile im Fließtext für keinen Listenpunkt', () => {
    const blocks = buildBlocks(page([line('2. Mai 2025 war der Stichtag für alle', 100), line('Beteiligten der Vereinbarung.', 125)]))
    expect(blocks).toEqual([{ kind: 'paragraph', text: '2. Mai 2025 war der Stichtag für alle Beteiligten der Vereinbarung.' }])
  })
})

describe('Aufzählungszeichen', () => {
  it('behält unsicher erkannte Aufzählungszeichen am Zeilenanfang', () => {
    const marker = (text: string, y: number): RawLine => ({ text: `* ${text}`, confidence: 80, x0: 50, y0: y, x1: 300, y1: y + 20, words: [{ text: '*', confidence: 31 }, ...text.split(' ').map((word) => ({ text: word, confidence: 90 }))] })
    const blocks = buildBlocks(page([marker('Eins', 100), marker('Zwei', 125), marker('Drei', 150)]))
    expect(blocks).toEqual([{ kind: 'list', ordered: false, items: ['Eins', 'Zwei', 'Drei'] }])
  })
})
