Die Dropzone nimmt Dateien und Ordner per Ziehen, Auswählen oder Einfügen an und ist der Einstieg in jedes Modul.

**Du lieferst:** die Liste der Formate, die das Modul liest (als `kf-chip`), und den Handler fürs Hinzufügen. Die Dropzone verarbeitet nichts selbst.

**Zustände**
- Ruhig: gestrichelter Rahmen in `line-control`, Fläche `surface-1`.
- Aktiv beim Ziehen (`is-over`): durchgezogener Rahmen in `accent`, Fläche `accent-subtle`, Text nennt Anzahl und Gesamtgröße.
- Fehler (`is-error`): Rahmen und Fläche in `danger`, Text nennt Datei, Grund und den Ausweg.
- Kompakt (`kf-drop--compact`): sobald die Liste Einträge hat, schrumpft die Zone über die Liste und bleibt als Ziel erreichbar.

**Do**
- Den Satz "Alles bleibt auf diesem Rechner" in der Hinweiszeile lassen. Er ist die Zusage des Produkts.
- Strg V als Alternative nennen.

**Don't**
- Nie das Wort "Hochladen" verwenden. Es gibt keinen Upload. Sag "ablegen" oder "hinzufügen".
- Keine Fortschrittsanzeige in der Zone selbst.
