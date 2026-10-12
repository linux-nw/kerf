# Kerf

Kerf ist ein Desktop-Werkzeug für Dateien, das komplett lokal arbeitet: PDFs und Bilder verkleinern, zwischen fast allen Formaten konvertieren und ein paar Dinge erledigen, für die man sonst eine Website mit Upload-Feld öffnet. Nichts verlässt den Rechner. Kein Konto, kein Netzwerk, keine Telemetrie.

> **Status: in Planung.** Es gibt noch keinen Code. Dieses Repo enthält bisher das Design System und den Plan.

## Der Name

Kerf heißt die Schnittbreite einer Säge, also das Material, das beim Schneiden verloren geht. Kerf macht Dateien kleiner, indem es wegschneidet, was keiner braucht.

## Was Kerf können soll

**Komprimieren.** PDF, JPG, PNG, WebP, AVIF und Office-Dateien deutlich verkleinern. Presets für E-Mail, Standard und Druck, außerdem ein Zielgrößen-Modus ("mach das unter 500 KB"). Vorher und Nachher stehen in jeder Zeile.

**Konvertieren.** Bilder (inklusive ICO mit mehreren Größen und Favicon-Sets), Office-Formate nach und von PDF, Text und Daten, Audio und Video, E-Books.

**PDF-Werkzeuge.** Zusammenführen, teilen, Seiten ordnen und drehen, Passwort, Wasserzeichen, Seitenzahlen.

**Privatsphäre.** Metadaten entfernen, PDFs wirklich schwärzen, Hashes, Texterkennung (OCR) offline.

Die vollständige Liste mit Stufen (MVP, V1, später) steht in [`design-system/modules.md`](design-system/modules.md).

## Prinzipien

1. Alles bleibt lokal. Die App blockiert Netzwerkzugriffe und zeigt das auf jedem Screen an.
2. Originale werden nie überschrieben.
3. Die Verarbeitung läuft über bewährte Programme (Ghostscript, LibreOffice, FFmpeg, Pandoc, Tesseract), die mit der App ausgeliefert werden. Kerf ist die Oberfläche und die Steuerung darum.
4. Einfach bedienbar: Dateien ablegen, Preset wählen, starten.

## Geplante Technik

Noch nicht entschieden, aktueller Stand der Überlegung:

- Desktop-App mit TypeScript, vermutlich Electron
- Die Verarbeitungsprogramme laufen als Kindprozesse, Fortschritt und Ergebnisse gehen an die Oberfläche
- Schriften und alle Ressourcen werden mit der App ausgeliefert

Offen ist auch die Lizenz. Ghostscript steht unter der AGPL, das beeinflusst, wie Kerf verteilt werden darf.

## Repo-Struktur

```
design-system/   Design System: Tokens, Komponenten, Screens, Funktionsumfang
```

Einstieg ins Design System ist [`design-system/README.md`](design-system/README.md).
