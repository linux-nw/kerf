# Screens und Abläufe

> **Abweichung in der Umsetzung:** Der rechte Inspector ist entfallen. Optionen und der Starten-Button sitzen in einer Aktionsleiste am unteren Rand der Arbeitsfläche (`kf-actionbar`), längere Auswahlen öffnen als Popover (`kf-pill`). Verlauf ist eine eigene Ansicht in der Sidebar. Die Aussagen zum Inspector unten gelten sinngemäß für diese Leiste.

## Layout der Workbench

Alle Module teilen ein Gerüst: Sidebar links, Arbeitsfläche in der Mitte, Inspector rechts, Statusleiste unten.

```
┌────────────┬─────────────────────────────────────┬──────────────┐
│ Sidebar    │ Kopf: Modultitel            Verlauf │ Inspector    │
│ 232 px     ├─────────────────────────────────────┤ 320 px       │
│            │ Dropzone (kompakt ab Datei 1)       │              │
│ Suche      │ Dateiliste aus FileRow              │ Preset       │
│ Module     │                                     │ Optionen     │
│ Verlauf    │ Summe (kf-total)                    │ Ausgabe      │
│ 100 % lokal│                                     │ [Starten]    │
├────────────┴─────────────────────────────────────┴──────────────┤
│ Statusleiste: Keine Daten verlassen diesen Rechner.  Netzwerk: aus │
└──────────────────────────────────────────────────────────────────┘
```

- Der Starten-Button sitzt unten im Inspector, `kf-btn--lg`, einzige Fläche in `accent`.
- Ohne Dateien zeigt die Arbeitsfläche die große Dropzone und der Inspector ist inaktiv mit erklärendem Text.
- Unter 1100 px Breite rutscht der Inspector unter die Dateiliste.

## Screen-Inventar

| Nr. | Screen | Zweck | Wichtige Bausteine |
| --- | --- | --- | --- |
| 1 | Onboarding | Offline-Zusage, Ausgabeordner wählen, Theme wählen. Drei Schritte, überspringbar | `LocalBadge` groß, `Field`, `Segmented` |
| 2 | Start | Globale Dropzone, Raster der Module, Zuletzt benutzt | `Dropzone`, `ToolCard`, Verlaufsliste |
| 3 | Workbench Komprimieren | Dateien, Preset, Röntgen, Starten | `FileRow`, `PresetCard`, `Field`, `SizeDelta` |
| 4 | Workbench Konvertieren | Zielformat wählen, Optionen je Format | Formatwähler, `Field`, `Banner` |
| 5 | Vergleich | Original gegen Ergebnis prüfen und speichern | `CompareView` |
| 6 | PDF-Seitenraster | Seiten ordnen, drehen, löschen, teilen | Thumbnails, Auswahl, `Button` |
| 7 | Warteschlange und Verlauf | Laufende und fertige Aufträge aller Module | `FileRow`, Filter als `Segmented` |
| 8 | Einstellungen | Allgemein, Ausgabe, Leistung, Datenschutz, Über | `Field`, Schalter, Liste |
| 9 | Kommandopalette | Schnellzugriff auf alles | `CommandPalette` |
| 10 | Dialoge | Passwort, Bestätigen, Namensschema, Preset speichern | Dialog mit `shadow-lg` auf `overlay` |
| 11 | Leere und Fehlerzustände | Nichts da, nicht lesbar, Datei zu groß, Platte voll | `Dropzone`, `Banner` |
| 12 | Über und Lizenzen | Versionen, eingesetzte Engines mit Lizenz, Offline-Nachweis | Liste, `LocalBadge` |

## Ablauf Komprimieren

1. **Ablegen.** Dateien oder Ordner ziehen, die Dropzone wird kompakt, die Liste füllt sich. Zu jeder Datei erscheint sofort die Größe.
2. **Wählen.** Im Inspector ein Preset. Das Größen-Röntgen zeigt, wie viel möglich ist, bevor man startet.
3. **Starten.** Ein Klick auf "Komprimieren". Jede Zeile zeigt Fortschritt, die Summe zählt mit.
4. **Prüfen.** Ein Klick auf eine fertige Zeile öffnet den Vergleich. "Ergebnis speichern" legt die Dateien ab, "Ordner öffnen" zeigt sie.

Ziel: von der Datei bis zum Ergebnis in drei Klicks.

## Zustände einer Datei

| Zustand | Icon und Wort | Aktion |
| --- | --- | --- |
| Wartet | Uhr, "Wartet" | Entfernen |
| Läuft | Pfeile, Satz zum Schritt, Prozent | Abbrechen |
| Fertig | `SizeDelta` mit Ersparnis | Vergleichen, Ordner zeigen |
| Kein Gewinn | `SizeDelta` mit "±0 %", "Schon optimal" | Stärker versuchen |
| Größer geworden | `SizeDelta` mit Plus, Original bleibt | Anderes Preset wählen |
| Fehler | Warndreieck, "Fehler" und Grund | Lösung als Button (Passwort, Reparatur) |
| Abgebrochen | Kreuz, "Abgebrochen" | Wiederholen |

## Startzustände

Jede Seite hat einen eigenen Startzustand, solange noch keine Datei da ist. Er erklärt in einem Blick, was die Seite kann. Sobald Dateien da sind, wird daraus die Arbeitsansicht mit kompakter Dropzone, Liste und unterer Aktionsleiste. Im Startzustand gibt es keine Aktionsleiste. Der Rahmen ist 40 px Seitenabstand, Kopf 20 px, Inhalt 28 px.

| Seite | Startzustand |
| --- | --- |
| Konvertieren | Zwei große Wähler "Von" (automatisch erkennen oder Format) und "In" (Format, gefiltert nach dem, was möglich ist), Dropzone, darunter beliebte Wege als Chips |
| PDF-Werkzeuge | Schritte 1, 2, 3 und fünf Aufgaben-Kacheln mit Illustration. Nach der Wahl: Reiter für die Aufgabe, Dropzone und das Feld "So läuft es" |
| Komprimieren | Breite Dropzone mit Formaten, vier Karten für die Stärke mit Balken, Zielgröße als Eingabe |
| Texterkennung | Dropzone neben einer Vorher-Nachher-Zeichnung, Karten für Sprachen und Ergebnis, Zeile zur KI-Aufbereitung |
| Metadaten lesen | Dropzone und vier Karten, was gefunden wird |
| Metadaten entfernen | Dropzone neben dem Vorher-Nachher-Vergleich, drei Fakten |
| Schwärzen | Dropzone neben einer Beispielseite mit Balken, drei Schritte |
| Prüfsummen | Dropzone, Verfahren als Chips, Feld zum Vergleichen |
| Archive | Zwei Zonen, Packen und Entpacken. Die Zone bestimmt den Modus |

Die Dropzone hat keine Zusatzknöpfe. Ziehen, klicken oder Strg V reicht. Die Seitenleiste bleibt unverändert, ergänzt um "Einstellungen" über dem Erscheinungsbild. Der Umschalter für Dunkel, Hell und System füllt die ganze Breite.

## Einstellungen

Vier Blöcke in einer Spalte: Allgemein (Standard-Ausgabeordner, Verlauf an oder aus), Texterkennung (Standardsprachen und Standardausgabe), KI-Aufbereitung und Über Kerf.

Die KI-Aufbereitung ist standardmäßig aus und wird ausdrücklich mit einem Schalter eingeschaltet. Anbieter ist Ollama oder ein beliebiger Server mit OpenAI-Schnittstelle (LM Studio, llama.cpp, vLLM). Erlaubt sind nur Adressen auf diesem Rechner oder im eigenen Netzwerk. Die Liste zeigt die Modelle, die der Server meldet, mit Größe. Bei Ollama lassen sich Gemma 4 E4B (empfohlen) und E2B (für schwächere Rechner) mit Fortschrittsanzeige laden, oder ein anderes Modell per Namen.

## Beispieltexte

| Situation | Text |
| --- | --- |
| Leer | Noch nichts da. Leg Dateien ab, um zu starten. |
| Dropzone aktiv | Loslassen zum Hinzufügen. 12 Dateien, 38,4 MB. |
| Fertig | 12 Dateien fertig. Du hast 38,4 MB gespart. Die Originale sind unverändert. |
| Fehler | Vertrag-geschuetzt.pdf braucht ein Passwort. Gib es ein, dann geht es weiter. |
| Bestätigen | Originale löschen? 12 Dateien (44,6 MB) werden in den Papierkorb verschoben. Buttons: "Abbrechen" und "In den Papierkorb" (`kf-btn--danger-solid`). |
| Platte voll | Auf D: ist nicht genug Platz. Für das Ergebnis brauchst du 2,1 GB, frei sind 800 MB. Wähle einen anderen Ordner. |
