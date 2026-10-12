Der Segment-Umschalter wählt eine von zwei bis vier gleichrangigen Optionen, die sofort wirken.

**Du lieferst:** kurze Labels, ein Eintrag ist aktiv (`is-active`, `aria-pressed="true"`). Mit Icon nur, wenn jedes Segment eines hat.

**Wann statt etwas anderes**
- Bei mehr als vier Optionen oder langen Texten nimmst du die Select-Variante des Feldes.
- Für Presets mit Erklärung nimmst du PresetCard.
- Für Seitenwechsel im Vergleich oder Zoomstufen ist das Segment richtig.

**Regeln**
- Das aktive Segment hebt sich durch Fläche `surface-3` und einen Rahmen in `line-control` ab, nicht durch Farbe allein.
- Der Umschalter hat eine Beschriftung per `aria-label` an der Gruppe.
- Tastatur: Pfeile wechseln, Tab verlässt die Gruppe.
