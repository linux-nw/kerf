SizeDelta ist das Erkennungszeichen des Produkts: Vorher, Nachher und Ersparnis in einer Mono-Zeile.

**Du lieferst:** zwei Größen in Bytes. Die Komponente formatiert mit Dezimalkomma und geschütztem Leerzeichen (`3,1 MB`, `412 KB`) und rechnet die Prozentzahl mit echtem Minuszeichen (`−87 %`).

**Varianten**
- Standard: Prozent in `success` auf `success-subtle`.
- `kf-delta--none`: gleiche Größe, Prozent als `±0 %` in `ink-muted`.
- `kf-delta--bad`: Ergebnis ist größer, Prozent mit Plus in `warning`. Das Tool behält dann die Originaldatei und sagt es.
- `kf-total` fasst eine ganze Warteschlange zusammen: große Zahl in `display-lg`, Balken in `accent`, darunter Summe vorher und nachher.

**Regeln**
- Zahlen stehen immer in `mono-md`, damit Spalten bündig bleiben.
- Das Wort "gespart" gehört zur Summe, die Zeile zeigt nur den Pfeil.
- Der Balken der Summe trägt `role="img"` und eine Prozentangabe im Label.
