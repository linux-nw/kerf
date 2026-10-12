# Kerf

Kerf ist ein Desktop-Werkzeug für Dateien, das komplett lokal arbeitet: PDFs und Bilder verkleinern, zwischen fast allen Formaten konvertieren und ein paar Dinge erledigen, für die man sonst eine Website mit Upload-Feld öffnet. Nichts verlässt den Rechner. Kein Konto, kein Netzwerk, keine Telemetrie.

> **Status: früher Prototyp.** Das Modul "PDFs komprimieren" funktioniert (Presets, Zielgröße, mehrere Dateien, Abbrechen). Alle anderen Module stehen in der Seitenleiste als "bald".

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
3. Die Verarbeitung läuft in der App selbst oder über bewährte Programme (LibreOffice, FFmpeg, Pandoc, Tesseract), die mit der App ausgeliefert werden. PDFs werden aktuell in reinem JavaScript komprimiert (pdf-lib und sharp), ohne Ghostscript.
4. Einfach bedienbar: Dateien ablegen, Preset wählen, starten.

## Technik

- Electron, React 19 und TypeScript, gebaut mit electron-vite
- Netzwerk ist doppelt gesperrt: Content-Security-Policy im Fenster und ein Filter im Hauptprozess, der jede nicht lokale Anfrage abbricht und zählt
- Fenster mit `contextIsolation` und `sandbox`, die Oberfläche hat keinen Zugriff auf Node
- PDF-Kompression läuft in einem Worker-Thread, damit die Oberfläche flüssig bleibt, und lässt sich abbrechen
- Schriften (IBM Plex) und alle Ressourcen liegen in der App

Offen ist die Lizenz. Sobald Ghostscript, FFmpeg oder Pandoc ausgeliefert werden, beeinflusst das (A)GPL, wie Kerf verteilt werden darf.

## Ausprobieren

Voraussetzung ist Node.js 24 oder neuer.

```
git clone https://github.com/linux-nw/kerf.git
cd kerf
npm install
npm start
```

`npm start` baut die App und öffnet sie. Wenn Windows beim Start von Electron nach einer Firewall-Freigabe fragt, ist Ablehnen in Ordnung, Kerf braucht kein Netzwerk.

Einen Installer baut GitHub: unter Actions den Workflow "Windows-Build" starten, danach unter Artifacts die Datei `Kerf-Windows` laden. Der Installer ist nicht signiert, Windows zeigt deshalb eine SmartScreen-Warnung.

## Entwickeln

```
npm run dev
npm test
npm run typecheck
```

Windows 11 ist die Zielplattform. Der Installer wird über GitHub Actions gebaut.

## Repo-Struktur

```
design-system/   Design System: Tokens, Komponenten, Screens, Funktionsumfang
src/main/        Hauptprozess, Auftragswarteschlange, PDF-Engine
src/preload/     Brücke zur Oberfläche
src/renderer/    Oberfläche (React)
src/shared/      Typen und Formatierung
tests/           Tests
```

Einstieg ins Design System ist [`design-system/README.md`](design-system/README.md).
