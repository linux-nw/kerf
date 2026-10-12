Der Button löst genau eine Aktion aus und kommt in vier Varianten: primär, sekundär, ghost und Gefahr.

**Du lieferst:** ein Verb als Label ("Komprimieren", "Speichern"), optional ein Icon links. Icon-only-Buttons brauchen ein `aria-label`.

**Wann welche Variante**
- `kf-btn--primary` für die eine Hauptaktion einer Ansicht. Nie zwei Primärbuttons nebeneinander.
- `kf-btn--secondary` für Gleichrangiges wie "Dateien hinzufügen".
- `kf-btn--ghost` für Abbrechen, Zeilenaktionen und alles in dichten Listen.
- `kf-btn--danger` als Umriss, wenn etwas gelöscht wird. Gefüllt (`kf-btn--danger-solid`) nur im Bestätigungsdialog für Unumkehrbares.

**Größen:** `control-md` (36 px) ist Standard, `control-sm` in Tabellen und Zeilen, `control-lg` nur für "Starten" im Inspector.

**Do**
- Text auf Accent immer in `on-accent`, nie weiß.
- Fokus mit `focus-ring`, 2 px, 2 px Abstand.
- Deaktivierte Buttons erklären den Grund in einem Hilfetext daneben.

**Don't**
- Kein Spinner im Button für Fortschritt. Fortschritt zeigt die Dateizeile.
- Keine Labels wie "OK" oder "Absenden".
