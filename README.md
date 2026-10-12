# Kerf

Kerf ist ein Desktop-Werkzeug für Dateien, das komplett lokal arbeitet: PDFs und Bilder verkleinern, zwischen fast allen Formaten konvertieren und ein paar Dinge erledigen, für die man sonst eine Website mit Upload-Feld öffnet. Nichts verlässt den Rechner. Kein Konto, kein Netzwerk, keine Telemetrie.

> **Status:** Alle Module in der Seitenleiste sind umgesetzt und laufen offline. Getestet wurde vor allem unter Linux, Windows 11 ist Zielplattform.

## Der Name

Kerf heißt die Schnittbreite einer Säge, also das Material, das beim Schneiden verloren geht. Kerf macht Dateien kleiner, indem es wegschneidet, was keiner braucht.

## Was Kerf kann

**Komprimieren.** PDF, JPG, PNG, WebP, AVIF, Video und Audio verkleinern. Presets für E-Mail, Standard und Druck, außerdem ein Zielgrößen-Modus. In jeder Zeile steht nur die Änderung in Prozent, der Rest bleibt im Verlauf.

**Konvertieren.** Bilder (inklusive ICO mit mehreren Größen und Favicon-Set, HEIC), Office-Dateien nach PDF, PDF nach Bild, Text, Markdown, Daten, Audio und Video. Office nach PDF läuft über Microsoft Office, sonst LibreOffice, sonst über eine vereinfachte eingebaute Darstellung für DOCX und XLSX.

**PDF-Werkzeuge.** Zusammenführen, teilen, Seiten ordnen und drehen, Wasserzeichen, Seitenzahlen.

**Texterkennung.** Offline mit Tesseract (LSTM), 12 Sprachen eingebaut (Deutsch, Englisch, Französisch, Spanisch, Italienisch, Niederländisch, Polnisch, Portugiesisch, Türkisch, Tschechisch, Russisch, Ukrainisch), auch gemischt. Die Bilder werden vorher aufbereitet, der erkannte Text wird bereinigt und gegliedert (Absätze, Überschriften, Listen, Silbentrennung). Ausgabe als durchsuchbares PDF, TXT, Markdown oder DOCX.

**Privatsphäre.** Metadaten und EXIF lesen, Metadaten entfernen, PDFs wirklich schwärzen (die betroffenen Seiten werden zu Bildern gerechnet und geprüft).

**Weiteres.** Prüfsummen (MD5, SHA-1, SHA-256, SHA-512, mit Vergleich) und Archive (ZIP, 7z, tar.gz, mit Passwort, Entpacken).

**Verlauf.** Jedes Ergebnis steht im Verlauf. Löschen entfernt dort nur den Eintrag, die Datei bleibt auf der Festplatte.

**Dateien einfügen.** Ziehen, klicken oder aus dem Explorer kopieren und mit Strg V einfügen. Auch Screenshots aus der Zwischenablage funktionieren.

Der ursprüngliche Plan mit Stufen steht in [`design-system/modules.md`](design-system/modules.md).

## Prinzipien

1. Alles bleibt lokal. Die App blockiert Netzwerkzugriffe und zeigt das auf jedem Screen an.
2. Originale werden nie überschrieben.
3. Die Verarbeitung läuft in der App selbst oder über bewährte Programme (LibreOffice, FFmpeg, Pandoc, Tesseract), die mit der App ausgeliefert werden. Die Engines sind JavaScript-Bibliotheken (pdf-lib, pdf.js, sharp, tesseract.js) plus mitgelieferte Programme (7-Zip, FFmpeg). LibreOffice und Microsoft Office werden nur genutzt, wenn sie installiert sind.
4. Einfach bedienbar: Dateien ablegen, Preset wählen, starten.

## Technik

- Electron, React 19 und TypeScript, gebaut mit electron-vite
- Netzwerk ist doppelt gesperrt: Content-Security-Policy im Fenster und ein Filter im Hauptprozess, der jede nicht lokale Anfrage abbricht und zählt
- Fenster mit `contextIsolation` und `sandbox`, die Oberfläche hat keinen Zugriff auf Node
- PDF-Kompression läuft in einem Worker-Thread, damit die Oberfläche flüssig bleibt, und lässt sich abbrechen
- Schriften (IBM Plex) und alle Ressourcen liegen in der App

Offen ist die Lizenz. Weil FFmpeg und 7-Zip ausgeliefert werden, beeinflusst das (A)GPL, wie Kerf verteilt werden darf.

## Ausprobieren

Voraussetzung ist Node.js 24 oder neuer.

```
git clone https://github.com/linux-nw/kerf.git
cd kerf
npm install
npm start
```

`npm install` legt außerdem die Sprachdaten für die Texterkennung unter `resources/tessdata` ab. `npm start` baut die App und öffnet sie. Wenn Windows beim Start von Electron nach einer Firewall-Freigabe fragt, ist Ablehnen in Ordnung, Kerf braucht kein Netzwerk.

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
src/main/        Hauptprozess, Auftragswarteschlange, Werkzeuge und Engines
src/preload/     Brücke zur Oberfläche
src/renderer/    Oberfläche (React)
src/shared/      Typen und Formatierung
tests/           Tests
```

Einstieg ins Design System ist [`design-system/README.md`](design-system/README.md).
