# Funktionsumfang

Jedes Modul ist eine Klinge: ein Eintrag in der Sidebar, eine Dropzone, eine Dateiliste und ein Inspector mit Optionen. Alle Module teilen Warteschlange, Verlauf und die Regel, dass Originale unberührt bleiben. Die Stufen bedeuten: **MVP** gehört in die erste Version, **V1** kommt direkt danach, **Später** ist geplant.

## Querschnitt, gilt in jedem Modul

| Funktion | Verhalten | Stufe |
| --- | --- | --- |
| Dateien hinzufügen | Ziehen, Auswählen, Einfügen mit Strg V, Ordner rekursiv | MVP |
| Warteschlange | Fortschritt je Datei, Abbrechen, Wiederholen, parallel nach Anzahl der Kerne | MVP |
| Originale schützen | Ergebnis als `name.klein.ext` oder im Ausgabeordner, nie überschreiben | MVP |
| Vorher und Nachher | Größen in jeder Zeile und als Summe | MVP |
| Offline-Garantie | Netzwerk gesperrt, `LocalBadge` auf jedem Screen | MVP |
| Themes | Dunkel, Hell, System | MVP |
| Vergleichsansicht | Original gegen Ergebnis vor dem Speichern | V1 |
| Presets | Eigene speichern, benennen, per Kommandopalette starten | V1 |
| Namensschema | Platzhalter `{name}`, `{datum}`, `{zähler}`, `{format}` mit Live-Vorschau | V1 |
| Verlauf | Letzte Aufträge, Ordner zeigen, Einstellungen wiederverwenden | V1 |
| Kommandopalette und Kürzel | Strg K, Strg 1 bis 8 für die Module | V1 |
| Explorer-Kontextmenü | "Mit Kerf komprimieren" per Rechtsklick | V1 |
| Ordnerüberwachung | Ordner beobachten, neue Dateien automatisch mit einem Preset verarbeiten | Später |
| Kommandozeile | Dieselbe Engine ohne Oberfläche, z. B. `kerf compress *.pdf --preset mail` | Später |
| Portable Version | Läuft ohne Installation vom USB-Stick | Später |

## Komprimieren (MVP)

| Thema | Inhalt |
| --- | --- |
| Eingaben | PDF, JPG, PNG, WebP, AVIF, DOCX, PPTX, XLSX. Später MP4 und MP3 |
| Presets | E-Mail, Standard, Druck, Zielgröße ("unter 500 KB") |
| Stellschrauben | Bildauflösung in dpi, JPEG-Qualität, Graustufen, Metadaten entfernen, Schriften auf genutzte Zeichen kürzen, doppelte Objekte zusammenfassen |
| Größen-Röntgen | Ein Balken zeigt, woraus die Datei besteht (Bilder, Schriften, Metadaten, Rest) und wie viel jeder Teil kostet. So sieht man, warum 3 MB sein müssen oder nicht |
| Besondere Oberfläche | `PresetCard`-Reihe, Röntgen-Balken, `CompareView`, `SizeDelta` je Zeile, Summe in `kf-total` |

## Konvertieren (MVP für Bilder und Office zu PDF)

| Gruppe | Formate |
| --- | --- |
| Bilder | PNG, JPG, WebP, AVIF, HEIC, TIFF, BMP, GIF, SVG, ICO, ICNS |
| Microsoft | DOCX, DOC, XLSX, XLS, PPTX, PPT, RTF, ODT, VSDX, PUB, MSG, EML, jeweils von und nach PDF |
| Text und Daten | Markdown, HTML, TXT, CSV, JSON, XML, YAML, Excel nach CSV und zurück |
| Audio und Video | MP3, WAV, FLAC, OGG, M4A, MP4, MKV, WEBM, GIF aus Video, Audio extrahieren |
| E-Books | EPUB, MOBI, PDF |

Besonderheiten der Oberfläche:

- **ICO** bekommt eine eigene Option: Größen 16, 32, 48, 64, 128 und 256 als Mehrfachauswahl in einer Datei. Ein **Favicon-Set** liefert ICO, PNGs, Apple-Touch-Icon und Manifest als Ordner.
- Der Formatwähler hat Suche und Kategorien und zeigt nur sinnvolle Ziele für das Quellformat.
- Verlustbehaftete Wege warnen im `Banner` vorher, z. B. "PNG nach JPG verliert Transparenz".

## PDF-Werkzeuge (V1)

Zusammenführen, teilen (nach Bereich, jede Seite, nach Lesezeichen), Seiten drehen, löschen und umsortieren in einem Seitenraster mit Ziehen und Ablegen, Passwort setzen und entfernen, Wasserzeichen (Text oder Bild, Position, Deckkraft), Seitenzahlen, PDF in Bilder, Bilder in PDF. Später: Formulare ausfüllen, Unterschrift einfügen.

## Texterkennung (V1)

Gescannte PDFs und Bilder durchsuchbar machen. Sprachpakete liegen lokal, Ausgabe als durchsuchbares PDF, TXT oder DOCX. Die Vorschau zeigt erkannte Bereiche mit Rahmen und Sicherheit je Wort.

## Bilder (V1)

Größe ändern (Pixel, Prozent, Seitenverhältnis), zuschneiden mit Raster und festen Verhältnissen, drehen, spiegeln, Hintergrund entfernen mit einem lokalen Modell, Wasserzeichen. Die Arbeitsfläche ist ein Canvas mit Griffen und Vorher-Nachher-Umschalter.

## Privatsphäre (V1)

| Funktion | Inhalt |
| --- | --- |
| Metadaten entfernen | EXIF, GPS, Autor, Kommentare, Revisionen. Vorher zeigt eine Liste "Das steckt in der Datei", jeder Eintrag lässt sich einzeln abschalten |
| Schwärzen | Bereiche in PDFs markieren, der Text wird wirklich entfernt. Danach prüft das Tool selbst: "Suche nach geschwärztem Text: 0 Treffer" |
| Hashes | SHA-256, SHA-1, MD5 für Dateien, zum Vergleichen und Kopieren |
| Verschlüsseln | Dateien und Ordner mit Passwort in ein Archiv packen |

## Dateien und Archive (Später)

ZIP, 7z und tar.gz packen und entpacken, optional mit Passwort. Batch-Umbenennen mit Muster und Vorschau-Tabelle alt gegen neu. Duplikate finden per Hash, Dateien vergleichen (Text-Diff), QR-Codes und Barcodes erzeugen und lesen.

## Ideen, die das Produkt unterscheiden

- **Größen-Röntgen** erklärt, warum eine Datei groß ist.
- **Zielgröße** statt Qualitätsregler: Man nennt das Limit, das Tool findet die beste Qualität darunter.
- **Schwärzen mit Selbstprüfung** macht den klassischen Fehler "nur schwarz übermalt" unmöglich.
- **Metadaten-Liste vor dem Entfernen** macht sichtbar, was in der Datei steckt.
- **Explorer-Kontextmenü und Ordnerüberwachung** machen aus dem Programm ein Werkzeug, das man nicht mehr öffnen muss.
- **Portable Version** als stärkster Beweis für "alles lokal".
