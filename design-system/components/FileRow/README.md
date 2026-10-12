Die Dateizeile zeigt eine Datei in der Warteschlange mit Format, Name, Zustand und Ergebnis.

**Du lieferst:** Dateiname, Endung (steht im Kästchen links), Größe und Seitenzahl bzw. Maße, und den Zustand. Der Name wird in der Mitte nicht gekürzt, nur am Ende mit Auslassung.

**Zustände**
- Wartet: `kf-status--wait` mit Uhr-Icon, Aktion Entfernen.
- Läuft: `kf-status--run`, Fortschrittsbalken mit Prozentzahl, Aktion Abbrechen. Der Text sagt, was gerade passiert ("Bilder werden gerechnet").
- Fertig: `SizeDelta` mit Vorher, Nachher und Prozent, darunter der neue Dateiname.
- Kein Gewinn: `kf-delta--none`, Hinweis "Schon optimal", Aktion "Stärker versuchen".
- Fehler: `is-error`, Icon und Wort "Fehler", der Grund in der Metazeile und die Lösung als Button.

**Do**
- Jede Zeile hat ein Wort und ein Icon für ihren Zustand. Die Farbe ergänzt nur.
- Das Ergebnis heißt `name.klein.pdf`, das Original wird nie überschrieben.

**Don't**
- Kein Fortschrittsbalken ohne Prozentzahl.
- Keine Löschen-Aktion für das Original in der Zeile.
