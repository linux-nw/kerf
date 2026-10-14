# Kerf

Kerf ist ein Desktop-Werkzeug für Dateien, das komplett lokal arbeitet: PDFs und Bilder verkleinern, zwischen fast allen Formaten konvertieren und ein paar Dinge erledigen, für die man sonst eine Website mit Upload-Feld öffnet. Nichts verlässt den Rechner. Kein Konto, kein Netzwerk, keine Telemetrie.

> **Status:** Alle Module in der Seitenleiste sind umgesetzt und laufen offline. Getestet wurde vor allem unter Linux, Windows 11 ist Zielplattform.

## Der Name

Kerf heißt die Schnittbreite einer Säge, also das Material, das beim Schneiden verloren geht. Kerf macht Dateien kleiner, indem es wegschneidet, was keiner braucht.

## Was Kerf kann

**Komprimieren.** PDF, Bilder (JPG, PNG, WebP, AVIF, GIF, TIFF, SVG), Office-Dateien (DOCX, PPTX, XLSX), OpenDocument (ODT, ODP, ODS) und EPUB verkleinern, dazu Video und Audio. Es gibt zwei Stufen:

- **Kompakt** arbeitet wie die üblichen Programme: Bilder auf etwa 150 dpi und JPEG-Qualität 78, dazu die verlustfreie Aufräumarbeit unten.
- **Winzig** holt heraus, was technisch geht, ohne dass man es sieht. Für jedes Bild sucht Kerf die niedrigste Qualität, bei der die gemessene Ähnlichkeit zum Original (SSIM auf der Helligkeit) über 0,94 bleibt, und geht nie über die Qualität von Kompakt hinaus. Neutral graue RGB-Bilder werden als Graustufen gespeichert, reine Schwarz-Weiß-Bilder mit einem Bit pro Punkt.

Verlustfrei, in beiden Stufen: Schriften auf die genutzten Zeichen kürzen, doppelte Objekte und Schriften zusammenfassen, unbenutzte Objekte entfernen, alle Streams mit Flate Stufe 9 neu packen, Objektströme. Nach dem Umbau rendert Kerf Seiten vorher und nachher und vergleicht Bild und Text. Weicht etwas ab, nimmt es die vorsichtigere Variante oder lässt die Struktur unangetastet. Brotli-Kompression gibt es bewusst nicht, weil viele Programme solche PDFs nicht lesen können.

Bei DOCX, PPTX, XLSX, ODF und EPUB werden alle eingebetteten Bilder neu gerechnet (BMP wird in PNG gewandelt), Vorschaubilder und die XLSX-Rechenkette entfernt und alle Teile mit Stufe 9 gepackt. Die Verweise im Paket werden dabei mitgepflegt.

**Konvertieren.** Bilder (inklusive ICO mit mehreren Größen und Favicon-Set, HEIC), Office-Dateien nach PDF, PDF nach Bild, Text, Markdown, Daten, Audio und Video. Office nach PDF läuft über Microsoft Office, sonst LibreOffice, sonst über eine vereinfachte eingebaute Darstellung für DOCX und XLSX.

**PDF-Werkzeuge.** Zusammenführen, teilen, Seiten ordnen und drehen, Wasserzeichen, Seitenzahlen.

**Texterkennung.** Offline mit Tesseract (LSTM), 12 Sprachen eingebaut (Deutsch, Englisch, Französisch, Spanisch, Italienisch, Niederländisch, Polnisch, Portugiesisch, Türkisch, Tschechisch, Russisch, Ukrainisch), auch gemischt. Die Bilder werden vorher aufbereitet, der erkannte Text wird bereinigt und gegliedert (Absätze, Überschriften, Listen, Silbentrennung). Ausgabe als durchsuchbares PDF, TXT, Markdown oder DOCX. Optional bessert ein lokales Sprachmodell Erkennungsfehler aus (siehe Einstellungen).

**Privatsphäre.** Metadaten und EXIF lesen, Metadaten entfernen, PDFs wirklich schwärzen (die betroffenen Seiten werden zu Bildern gerechnet und geprüft).

**Weiteres.** Prüfsummen (MD5, SHA-1, SHA-256, SHA-512, mit Vergleich) und Archive (ZIP, 7z, tar.gz, mit Passwort, Entpacken).

**Einstellungen.** Standard-Ausgabeordner, Verlauf an oder aus, Standardsprachen und Standardausgabe der Texterkennung. Dazu die KI-Aufbereitung: Sie ist aus, bis du sie einschaltest. Standardmäßig spricht Kerf mit Ollama auf diesem Rechner (`http://127.0.0.1:11434`), jeder Server mit OpenAI-Schnittstelle geht auch, zum Beispiel LM Studio. Kerf zeigt die vorhandenen Modelle und lädt auf Wunsch Gemma 4 E4B (empfohlen, etwa 9,6 GB) oder E2B (etwa 7,2 GB, für schwächere Rechner). Es sind nur Adressen auf diesem Rechner oder im eigenen Netzwerk erlaubt. Das Modell darf nur kleine Korrekturen machen: Antworten, die zu weit vom erkannten Text abweichen oder Zahlen verändern, verwirft Kerf und behält den Originaltext.

**Verlauf.** Jedes Ergebnis steht im Verlauf. Löschen entfernt dort nur den Eintrag, die Datei bleibt auf der Festplatte.

**Dateien einfügen.** Ziehen, klicken oder aus dem Explorer kopieren und mit Strg V einfügen. Auch Screenshots aus der Zwischenablage funktionieren.

Der ursprüngliche Plan mit Stufen steht in [`design-system/modules.md`](design-system/modules.md).

## Prinzipien

1. Alles bleibt lokal. Die App blockiert Netzwerkzugriffe und zeigt das auf jedem Screen an. Die einzige Ausnahme ist die ausdrücklich eingeschaltete KI-Aufbereitung, und sie darf nur mit Adressen auf diesem Rechner oder im eigenen Netzwerk sprechen.
2. Originale werden nie überschrieben.
3. Die Verarbeitung läuft in der App selbst oder über bewährte Programme (LibreOffice, FFmpeg, Pandoc, Tesseract), die mit der App ausgeliefert werden. Die Engines sind JavaScript-Bibliotheken (pdf-lib, pdf.js, MuPDF als WebAssembly, sharp, svgo, tesseract.js) plus mitgelieferte Programme (7-Zip, FFmpeg). LibreOffice und Microsoft Office werden nur genutzt, wenn sie installiert sind.
4. Einfach bedienbar: Dateien ablegen, Preset wählen, starten.

## Technik

- Electron, React 19 und TypeScript, gebaut mit electron-vite
- Netzwerk ist doppelt gesperrt: Content-Security-Policy im Fenster und ein Filter im Hauptprozess, der jede nicht lokale Anfrage abbricht und zählt
- Fenster mit `contextIsolation` und `sandbox`, die Oberfläche hat keinen Zugriff auf Node
- PDF-Kompression läuft in einem Worker-Thread, damit die Oberfläche flüssig bleibt, und lässt sich abbrechen. Bilder tauscht pdf-lib mit sharp, Schriften und Struktur räumt MuPDF auf
- Schriften (IBM Plex) und alle Ressourcen liegen in der App

Offen ist die Lizenz. Weil FFmpeg, 7-Zip und MuPDF (AGPL-3.0) ausgeliefert werden, beeinflusst das (A)GPL, wie Kerf verteilt werden darf.

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
npm run icons
```

`npm run icons` erzeugt aus `build/icon.svg` das Programm-Symbol (`icon.ico` mit sieben Größen, `icon.png`).

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
