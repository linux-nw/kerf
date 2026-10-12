Die Sidebar ist die feste Hauptnavigation links mit Suche, gruppierten Modulen, Warteschlange und Offline-Anzeige.

**Du lieferst:** die Modulliste mit Icon und Label, den Stand der Warteschlange als Zahl und das aktuelle Modul (`aria-current="page"`).

**Regeln**
- Breite `sidebar-width` (232 px), Fläche `surface-1`, rechts eine Haarlinie.
- Gruppenlabels als `overline` in `ink-faint`: Werkzeuge, Privatsphäre, Verlauf.
- Der aktive Eintrag hat `surface-3` und sein Icon in `accent-text`. Es gibt keine Akzentlinie am Rand.
- Jeder Eintrag hat Icon und Wort. Eine eingeklappte Variante zeigt nur Icons und braucht Tooltips.
- Ganz unten stehen Einstellungen und das Badge "100 % lokal", auf jedem Screen.
- Die Suche öffnet die Kommandopalette. Strg K funktioniert überall.

**Don't**
- Keine Konto- oder Anmelde-Elemente. Es gibt kein Konto.
- Kein Hinweis auf Updates in der Sidebar. Updates prüft man manuell in den Einstellungen.
