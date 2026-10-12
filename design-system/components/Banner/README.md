Das Banner meldet eine Lage in vier Stufen: Hinweis, Erfolg, Warnung, Fehler, jeweils mit Icon, Titel und einem Satz.

**Du lieferst:** Stufe, Titel, Text und optional eine Aktion rechts. Der Titel sagt, was los ist. Der Text sagt, was man tun kann.

**Regeln**
- Jede Stufe hat ein eigenes Icon und ein eigenes Wort im Titel. Die Farbe auf `*-subtle` ergänzt nur.
- Erfolg ist Türkis, nicht Grün. Fehler und Erfolg unterscheiden sich so nicht nur über Rot und Grün.
- Titel und Icon nutzen die Statusfarbe, der Fließtext bleibt `ink-muted`.
- Banner stehen im Inhalt, über der Liste. Sie blockieren nicht und verschwinden nicht von selbst, wenn sie eine Handlung brauchen.
- Fehler nennen den Dateinamen. Sie geben nie Fehlercodes ohne Erklärung aus.

**Don't**
- Keine Toasts, die nach drei Sekunden verschwinden, bei Fehlern.
- Kein Ausrufezeichen, keine Entschuldigungsfloskeln.
