Kerf ist ein Desktop-Werkzeug, das Dateien komprimiert, konvertiert und bearbeitet, ohne dass sie den Rechner verlassen. Die Oberfläche wirkt wie ein gutes Gerät: ruhig, präzise, ohne Dekoration. Eine Akzentfarbe, viel Luft, klare Zahlen. Den Funktionsumfang beschreibt der Abschnitt "Funktionsumfang", die Bildschirme der Abschnitt "Screens und Abläufe".

## Prinzipien

1. **Lokal ist sichtbar.** `LocalBadge` steht auf jedem Screen. Nichts im Produkt tut so, als gäbe es eine Cloud.
2. **Die Zahl ist der Held.** Das Ergebnis einer Aktion ist eine Größe: `SizeDelta`. Sie bekommt den meisten Raum und die klarste Schrift.
3. **Ein Primärschritt pro Ansicht.** Genau ein Button in `accent`, alles andere ist `secondary` oder `ghost`.
4. **Originale sind heilig.** Die Oberfläche überschreibt nie etwas und sagt bei jedem Ergebnis, wo es liegt.
5. **Ruhe vor Effekt.** Keine Bewegung ohne Funktion, keine Farbe ohne Bedeutung, kein Verlauf.

## Inhalt und Ton

- Sprache ist Deutsch, Anrede Du, kurze Sätze. Die Oberfläche sagt, was passiert ist und was man tun kann.
- Buttons tragen ein Verb im Infinitiv: "Komprimieren", "Ergebnis speichern", "Passwort eingeben". Nie "OK", "Absenden" oder "Weiter" allein.
- Groß- und Kleinschreibung wie im Satz. Keine Ausrufezeichen, keine Emojis, keine Floskeln wie "Leider" oder "Oops".
- Wörter: "ablegen" und "hinzufügen", nie "hochladen". "Rechner" statt "Cloud" oder "Server". "Ergebnis" statt "Output".
- Zahlen: Dezimalkomma, geschütztes Leerzeichen vor der Einheit (`3,1 MB`), echtes Minus (`−87 %`). Größen werden binär gerechnet wie im Windows-Explorer, damit die Zahl mit dem Explorer übereinstimmt.
- Fehler nennen den Dateinamen, den Grund und den nächsten Schritt: "Satzung.pdf lässt sich nicht öffnen. Die Datei ist beschädigt. Wähle eine andere oder versuche die Reparatur."
- Leere Zustände sind knapp: "Noch nichts da. Leg Dateien ab, um zu starten."

## Visuelle Grundlagen

**Themes.** `dark` (Dunkel) ist Standard, `light` (Hell) gleichwertig, "System" folgt dem Betriebssystem. Jedes Token hat beide Werte.

**Flächen.** Die Oberfläche schichtet sich von innen nach außen: `surface-0` ist der App-Grund, `surface-1` tragen Sidebar und Inspector, `surface-2` Karten, Felder und Dateizeilen, `surface-3` Hover und Auswahl. Trenne Flächen mit der Haarlinie `line`, nicht mit Schatten.

**Farbe.** Der Rest ist Stahlgrau, der Akzent ist ein kräftiges Orange (`accent`). Es kennzeichnet den Primärbutton, Fortschritt, die gewählte Preset-Karte und die verschiebbare Trennlinie im Vergleich, sonst nichts. Als Textfarbe nimm `accent-text`, nie `accent`. Auf Accent-Flächen steht `on-accent`, nie Weiß. Status haben eigene Farben: `success` (Türkis), `warning`, `danger`, `info`. Module haben keine eigenen Farben.

**Linien und Schatten.** Haarlinie `line` für Ruhendes, `line-strong` für Hover, `line-control` für alles, was bedient wird (Felder, Schalter, Dropzone). `shadow-sm` beim Ziehen einer Zeile, `shadow-md` für Menüs, `shadow-lg` für Dialoge und die Kommandopalette auf `overlay`.

**Typografie.** IBM Plex Sans für die Oberfläche, IBM Plex Mono für alles Messbare: Größen, Prozente, Pfade, Hashes, Formatchips, Kürzel. Fließtext ist `body` (14/20), Hilfetexte `body-sm`, Zeitstempel `caption`. Gruppenlabels sind `overline` in Großbuchstaben. Nur Modultitel (`display-md`) und die Gesamtsumme (`display-lg`) sind groß.

**Abstand.** Raster von 4 px: `space-2` zwischen Icon und Label, `space-3` in Zeilen, `space-4` zwischen Elementen, `space-6` zwischen Gruppen, `space-12` als Rand der Workbench.

**Radien.** Controls `radius-sm`, Dateizeilen und Banner `radius-md`, Karten, Dropzone und Dialoge `radius-lg`, Fortschritt und Schalter `radius-pill`. Eine Familie, keine Mischformen.

**Layout.** Drei Spalten: Sidebar (`sidebar-width`), Arbeitsfläche, Inspector (`inspector-width`). Die Arbeitsfläche wächst, der Inspector hat feste Breite. Inhalt steht links ausgerichtet, nie zentriert, außer in Onboarding und leeren Zuständen.

**Zustände.** Hover hebt die Fläche um eine Stufe. Gedrückt geht eine Stufe darunter. Fokus ist `focus-ring`, 2 px, 2 px Abstand, auf jedem Element sichtbar. Deaktiviert ist `opacity-disabled` und nennt den Grund im Text.

**Bewegung.** Hover und Press 120 ms, Panels 200 ms, beides `ease-out`. Fortschrittsbalken laufen linear. Nichts blinkt, hüpft oder federt. Bei "Bewegung reduzieren" entfallen alle Übergänge bis auf den Fortschritt.

**Bilder.** Das Produkt hat keine Illustrationen. Die einzigen Bilder sind die Dateien des Nutzers in Vorschauen.

## Iconografie

Lucide-Icons (ISC-Lizenz), Linienstärke 1,5 px, in 16, 20 und 24 px, Farbe `ink` oder `ink-muted`. Das aktive Navigationsicon nimmt `accent-text`. Dateiformate zeigt ein Kästchen in `surface-3` mit der Endung in `mono-sm` (`PDF`, `JPG`). Icons stehen in der Navigation immer mit Wort. Keine Emojis. Die Vorschauen verwenden vereinfachte Platzhalter-Icons, im Produkt kommt das Lucide-Set zum Einsatz.

## Barrierefreiheit

- Text hält 4,5:1 auf den Flächen, die in der Notiz seines Tokens stehen, in beiden Themes. Rahmen von Controls und der Fokusring halten 3:1.
- Status werden nie allein über Farbe gezeigt: jede Stufe hat ein Wort und ein Icon. `success` ist türkis, damit Erfolg und Fehler nicht nur über Grün und Rot getrennt sind.
- Der Fortschrittsbalken zeigt immer die Prozentzahl daneben.
- Alles ist per Tastatur erreichbar. Tab-Reihenfolge folgt der Leserichtung, die Kommandopalette (Strg K) erreicht jedes Werkzeug. Kürzel stehen in Tooltips und in `kf-kbd`.
- Mindestgröße zum Klicken ist `control-sm` (28 px). Icon-only-Controls haben ein `aria-label`.
- Die Oberfläche bleibt bei 200 % Skalierung nutzbar: Inspector rutscht dann unter die Arbeitsfläche.

## Lokal und offline als Gestaltungsregel

- Schriften werden als woff2 mit der App ausgeliefert (IBM Plex steht unter der OFL). Das Produkt lädt nie etwas von Google Fonts oder einem CDN. Die Vorschauen in diesem System laden sie nur zur Ansicht.
- Keine externen Bilder, keine Analyse, keine Fehlerberichte, keine automatischen Updates. Eine Update-Prüfung ist eine Aktion des Nutzers in den Einstellungen, und `LocalBadge` zeigt währenddessen "Netzwerk: kurz an".
- Kein Konto, keine Anmeldung, kein Onboarding mit E-Mail-Adresse.
- Fehlerberichte lassen sich kopieren, nie senden.
