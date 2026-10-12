Das Feld fasst Beschriftung, Eingabe, Einheit und Hilfetext zusammen und deckt Text, Zahl, Regler und Schalter ab.

**Du lieferst:** ein Label, den Wert und bei Zahlen die Einheit (`kf-input__unit`). Pfade, Größen und Namensschemata setzt du in `kf-input--mono`.

**Regeln**
- Label steht über dem Feld in `caption`, nie als Platzhalter.
- Der Rahmen nutzt `line-control` und hält 3:1 auf `surface-0` bis `surface-2`.
- Fehler: Rahmen in `danger` und ein Hilfetext in `danger`, der sagt, was zu tun ist. Farbe allein reicht nie.
- Regler zeigen ihren Wert als Zahl daneben, zusätzlich zur Position. Beide Enden tragen Beschriftung.
- Schalter schalten sofort und brauchen keinen Speichern-Button. Ein Schalter, der eine andere Option erst freischaltet, steht darüber.

**Don't**
- Kein Schalter für Aktionen. Aktionen sind Buttons.
- Keine Pflichtfeld-Sternchen. Pflicht ist, was die Aktion braucht, und der Button erklärt es.
