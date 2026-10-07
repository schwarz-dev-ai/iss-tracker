# Spec: Theme-Umschalter, Oberflächen-Redesign und Plot-Ansicht

**Status:** entworfen, Umsetzung läuft
**Vorbild:** `ai_docs/images/darkmode-example.png`
**Bezug:** erweitert `ai_docs/PRD.md` (dort nicht vorgesehen, siehe „Abweichungen")

## 1. Ziel

Die App soll zwischen **Hell und Dunkel umschaltbar** sein — nicht mehr nur der
Systemeinstellung folgen. Das Dunkel-Erscheinungsbild richtet sich nach dem
Vorbildbild. Zusätzlich bekommt die App eine zweite Ansicht: einen **Plot der
Bodenspur** neben der bestehenden Landkarte.

## 2. Entscheidungen

Diese Punkte hat das Vorbildbild offengelassen; sie wurden am 2026-10-07
entschieden.

| # | Frage | Entscheidung |
|---|---|---|
| E1 | Umfang | Volles Redesign der Oberfläche nach Vorbild **und** Plot als neue Ansicht |
| E2 | Karte oder Plot? | **Beides.** Die Landkarte bleibt die Hauptansicht, der Plot kommt als umschaltbare zweite Ansicht dazu |
| E3 | Kacheln im Dunkelmodus | **Dunkler Kachel-Anbieter** (CARTO `dark_all`), nicht CSS-Filter |
| E4 | Umschalter | **Drei Zustände** (System / Hell / Dunkel), bewusste Wahl in `localStorage` gemerkt |
| E5 | Karte bleibt erhalten | Karte, Spur, Zoom-Verhalten und der Datumsgrenzen-Fix bleiben unangetastet |

## 3. Abweichungen vom PRD

Zwei bewusste Abweichungen, die im Bericht stehen müssen:

1. **Dritte Datenquelle.** Das PRD (§3) nennt OpenStreetMap für Kartenkacheln.
   Für den Dunkelmodus kommt Esri „World Dark Gray" hinzu. Kein API-Key, HTTPS,
   Attribution wird ergänzt. Rein kosmetisch — die Fachdaten kommen unverändert
   von `api.wheretheiss.at`.
2. **Zusätzlicher API-Aufruf.** Der `positions`-Endpunkt derselben Quelle wird
   zum Nachladen genutzt (siehe Abschnitt 6.3). Kein neuer Anbieter, kein Key.

Alles Übrige (kein Backend, keine Keys, nur HTTPS, Robustheit) gilt unverändert.

## 4. Teil A — Theme-Umschalter

### 4.1 Zustände und Speicherung

- Drei Zustände: `system`, `light`, `dark`.
- `localStorage`-Schlüssel `iss-tracker-theme` mit Wert `light` oder `dark`.
  **Fehlender Eintrag bedeutet `system`** — so ist der Erstbesuch automatisch
  systemgesteuert, ohne einen Wert schreiben zu müssen.
- Auflösung: `system` → `window.matchMedia('(prefers-color-scheme: dark)')`.
- Das Ergebnis wird als `data-theme="light"|"dark"` auf `<html>` gesetzt.
- Bei Zustand `system` wird ein `change`-Listener auf die MediaQuery gesetzt,
  damit ein Systemwechsel **live** übernommen wird.

### 4.2 Kein Flackern

Ein kurzes Inline-Skript im `<head>` (`app/layout.js`) setzt `data-theme`
**vor dem ersten Paint**. Ohne das würde bei dunklem System kurz die helle
Oberfläche aufblitzen.

Das CSS braucht dadurch **keine** `@media (prefers-color-scheme)`-Verdopplung:
Es gibt nur `:root` (hell) und `:root[data-theme='dark']` (dunkel).

> Bewusste Folge: Ohne JavaScript bleibt `data-theme` ungesetzt und die App hell.
> Das ist vertretbar, weil die App ohne JavaScript ohnehin nicht funktioniert
> (Karte, Polling, Leaflet). `<html>` bekommt `suppressHydrationWarning`, weil
> das Skript ein Attribut setzt, das React nicht kennt.

### 4.3 Bedienung

Segmentierter Umschalter im Kopfbereich mit drei Knöpfen (System / Hell / Dunkel).
Ein Kippschalter reicht nicht, weil drei Zustände abzubilden sind.

- `role="radiogroup"` mit `aria-label="Farbschema"`, Knöpfe als `role="radio"`
  mit `aria-checked`, Pfeiltasten wechseln die Auswahl.
- Sichtbarer Fokusring über `:focus-visible`.

## 5. Teil B — Visuelle Sprache nach Vorbild

### 5.1 Kopfbereich

| Element | Inhalt |
|---|---|
| Links, gross | `ISS · LIVE` |
| Links, klein darunter | `NORAD 25544` |
| Rechts | Statusanzeige, z. B. `● SIGNAL OK · 5 s` |

Die bisherige Status-Pille wird durch die Statusanzeige im Vorbild-Stil ersetzt:

| Zustand | Text | Farbe |
|---|---|---|
| Daten frisch | `SIGNAL OK · 5 s` | grün (`--live`) |
| noch keine Daten | `VERBINDE …` | gedämpft (`--text-muted`) |
| Fehler | `KEIN SIGNAL` | Warnfarbe (`--error`) |

Die Statusanzeige sitzt rechts oben und ersetzt den Theme-Umschalter **nicht** —
beide stehen im Kopfbereich, der Umschalter darunter bzw. daneben.

### 5.2 Kennwerte

Statt Karten mit Rahmen: **Zeilen mit feiner Trennlinie**, wie im Vorbild.

- Label: klein, Versalien, gesperrt, gedämpft (`BREITE`, `LÄNGE`, `HÖHE`, `GESCHWINDIGKEIT`, `TAG / NACHT`).
- Wert: gross, `font-variant-numeric: tabular-nums`.
- Einheit: klein und gedämpft **neben** dem Wert (`km`, `km/h`), nicht im Wert.

**Darstellung der Werte weicht vom Ist-Zustand ab** — das Vorbild gibt es vor:

| Wert | bisher | neu (nach Vorbild) |
|---|---|---|
| Breite | `25,0466° S` | `-25,0466°` |
| Länge | `170,1359° E` | `170,1359°` |
| Höhe | `423,9 km` | `424` + `km` |
| Geschwindigkeit | `27.574 km/h` | `27.574` + `km/h` |

Also **Vorzeichen statt Hemisphären-Buchstabe**, Höhe auf ganze Kilometer
gerundet, Einheit separat. Dezimaltrennzeichen bleibt das Komma (`de-DE`).

### 5.3 Fehlerhinweis

Rahmen in Warnfarbe, Titel fett, Text gedämpft — im Ton des Vorbilds:

> **KEIN SIGNAL**
> Die ISS-Daten sind gerade nicht erreichbar. Neuer Versuch läuft automatisch.

Wie bisher gibt es **zwei Varianten**, weil F4 verlangt, dass die zuletzt
bekannte Position sichtbar bleibt und als solche gekennzeichnet wird:

- Ohne je empfangene Daten: Text wie oben.
- Ausfall im Betrieb: `Keine Verbindung seit HH:MM:SS. Letzte bekannte Position wird weiter angezeigt.`

### 5.4 Farben

Der Akzent ist im Vorbild **grün**, nicht blau. Damit die Marke in beiden Themes
gleich bleibt, wird der Akzent in beiden Themes grün — das ändert die helle
Oberfläche gegenüber dem Ist-Zustand (blau → grün).

| Token | hell | dunkel |
|---|---|---|
| `--bg` | `#f5f7fb` | `#0a0e17` |
| `--surface` | `#ffffff` | `#0e1521` |
| `--surface-sunken` | `#eef2f8` | `#070b12` |
| `--border` | `#dde3ed` | `#1b2740` |
| `--text` | `#0f172a` | `#e9eff8` |
| `--text-muted` | `#64748b` | `#7e8ca6` |
| `--accent` | `#0f9d63` | `#3ddc97` |
| `--live` | `#0f9d63` | `#3ddc97` |
| `--error` | `#d93a1c` | `#ff6b4a` |

Marker und Spur benutzen `--accent`, damit sie in beiden Themes passen.

## 6. Teil C — Dunkle Kacheln

- Hell: OpenStreetMap wie bisher (`tile.openstreetmap.org`).
- Dunkel: Esri „World Dark Gray",
  `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`.
  **Achtung, abweichende Achsenreihenfolge: `{z}/{y}/{x}` statt `{z}/{x}/{y}`.**
- Attribution Hell: `&copy; OpenStreetMap-Mitwirkende`.
- Attribution Dunkel: `&copy; Esri, HERE, Garmin, &copy; OpenStreetMap-Mitwirkende, GIS-Community`.
- Beide Ebenen werden einmal erzeugt und beim Themenwechsel getauscht
  (eine entfernen, die andere hinzufügen) — kein Neubau der Karte.

### 6.1 Warum nicht CARTO

Ursprünglich war CARTO `dark_all` vorgesehen. **CARTO liefert ohne Schlüssel
inzwischen nur noch Platzhalterkacheln** mit der Aufschrift „API KEY REQUIRED"
— bei HTTP 200 und `Content-Type: image/png`, auf beiden Hostnamen
(`*.basemaps.cartocdn.com` und `*.global.ssl.fastly.net`), jeweils exakt
2513 Byte und über alle Kacheln byteweise identisch.

Das ist die Falle: eine Prüfung auf Statuscode und Content-Type besteht, die
Karte ist trotzdem unbrauchbar. Aufgefallen ist es erst im Screenshot. Die
Prüfung vergleicht deshalb jetzt die Kachel-Bytes untereinander — Platzhalter
sind identisch, echte Kacheln nie.

Ein Schlüssel wäre die Lösung, verstößt aber gegen die PRD-Vorgabe „keine
API-Keys oder Secrets im Code". Esri braucht keinen.

## 7. Teil D — Plot-Ansicht

### 7.1 Ansichtsumschalter

Zwei Knöpfe `Karte` / `Plot`. Der Zustand wird in `localStorage`
(`iss-tracker-view`) gemerkt. Die Kartenansicht bleibt die Voreinstellung.

### 7.2 Was geplottet wird

**Breite über Zeit**, nicht Breite über Länge. Begründung: Im Vorbild ist **eine
einzige durchgehende Sinuskurve** zu sehen. Bei Breite über Länge ergäbe jede
Runde eine um ~23° nach Westen versetzte Kurve, also mehrere versetzte Linien.
Eine einzige Sinuskurve mit der Periode eines Orbits (≈ 92 min) entsteht nur bei
**Zeit auf der x-Achse**.

Nebeneffekt, der die Umsetzung vereinfacht: Auf der x-Achse steht Zeit, die
Länge geht gar nicht ein — **das Datumsgrenzen-Problem berührt den Plot nicht.**

### 7.3 Daten

- Der Plot führt einen **eigenen Ringpuffer** (getrennt vom Karten-Trail, der bei
  240 Punkten bleibt).
- Live werden weiter alle 5 s Punkte angehängt.
- Beim Wechsel in die Plot-Ansicht (und beim Laden, wenn sie aktiv ist) werden
  die **letzten 4 Stunden nachgeladen**, damit die Kurve sofort steht statt
  stundenlang leer zu bleiben:
  `GET https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps=…&units=kilometers`
  mit ≤ 100 Zeitstempeln (4 h bei 150 s Abstand ≈ 96 Punkte). Ein einziger Aufruf.
- Geprüft: Der Endpunkt antwortet über HTTPS mit HTTP 200 und derselben
  Feldstruktur wie der Einzelabruf.

### 7.4 Zeichnung

Von Hand als SVG — **kein Leaflet**. Der Plot ist kein Geodatensatz; Leaflet
brächte für ein Diagramm nur Ballast mit. (PRD §5 verlangt HTML/CSS/JavaScript,
das ist damit erfüllt.)

- y-Achse fest **−90° bis +90°**, damit die Amplitude zwischen Aufrufen
  vergleichbar bleibt.
- x-Achse rollierendes Fenster der letzten 4 Stunden.
- Gitter: gleichmässige Karos von 48 px in beiden Richtungen, **ohne
  Achsenbeschriftung** — genau wie im Vorbild, das nur nackte Gitterlinien
  zeigt. Die Zahlen stehen in der Seitenleiste.
- Kurve in `--accent`.
- Aktuelle Position als **Fadenkreuz mit Punkt** (wie im Vorbild), nicht als
  ISS-Symbol. Das Fenster endet 7 % nach dem neuesten Punkt, sonst sässe das
  Fadenkreuz genau auf dem rechten Rand und wäre halb abgeschnitten.
- Die echte Grösse wird per `ResizeObserver` gemessen statt über
  `preserveAspectRatio="none"` gestreckt: Streckung würde die Strichstärke in
  der einen Richtung verzerren.

### 7.5 Robustheit

Schlägt das Nachladen fehl, zeigt der Plot nur die live gesammelten Punkte und
einen kurzen Hinweis. Kein Absturz, kein leeres Bild ohne Erklärung. Das
Live-Polling läuft unabhängig weiter.

## 8. Betroffene Dateien

| Datei | Änderung |
|---|---|
| `app/layout.js` | Inline-Theme-Skript, `suppressHydrationWarning` |
| `app/globals.css` | Tokens umgebaut, neue Stile für Kopfbereich, Kennwertzeilen, Umschalter, Fehlerbox, Plot |
| `app/components/IssTracker.js` | Kopfbereich, Ansichtswechsel, Kachelwechsel, Nachladen, neue Wertformatierung |
| `app/components/ThemeSwitch.js` | **neu** — segmentierter Umschalter |
| `app/components/GroundTrackPlot.js` | **neu** — SVG-Plot |
| `app/components/useTheme.js` | **neu** — Theme-Zustand, Auflösung, Speicherung |

Unverändert bleiben: `app/page.js`, `app/icon.svg`, `next.config.mjs`.

## 9. Nicht-Ziele

- Keine Bahndaten-Berechnung und keine Vorhersage künftiger Positionen.
- Kein Verlassen von Leaflet für die Kartenansicht.
- Keine neue Abhängigkeit in `package.json`.
- Keine Änderung an `ai_docs/PRD.md` (die Abweichungen stehen in Abschnitt 3).

## 10. Akzeptanzkriterien

**Theme**
- [ ] Drei Zustände im Kopfbereich bedienbar, Auswahl überlebt ein Neuladen.
- [ ] Bei `system` folgt die App der Systemeinstellung und reagiert live darauf.
- [ ] Kein Aufblitzen der hellen Oberfläche bei dunklem System beim Laden.
- [ ] Kontrast von Text zu Hintergrund in beiden Themes ausreichend.

**Oberfläche**
- [ ] Kopfbereich zeigt `ISS · LIVE`, `NORAD 25544` und die Statusanzeige.
- [ ] Kennwerte ohne Hemisphären-Buchstaben, Höhe ganzzahlig, Einheit separat.
- [ ] Fehlerbox erscheint im neuen Stil, beide Varianten korrekt.

**Karte**
- [ ] Kartenansicht im Dunkelmodus mit dunklen Kacheln und CARTO-Attribution.
- [ ] Marker und Spur in beiden Themes sichtbar.
- [ ] Datumsgrenzen-Verhalten (F1/B1) unverändert in Ordnung.

**Plot**
- [ ] Umschalter wechselt zwischen Karte und Plot, Zustand überlebt Neuladen.
- [ ] Plot zeigt nach dem Laden sofort ~4 h Kurve, nicht ein leeres Feld.
- [ ] Kurve läuft live weiter.
- [ ] Scheitert das Nachladen, bleibt der Plot bedienbar und erklärt sich.

**Allgemein**
- [ ] `npm run build` fehlerfrei, geprüft gegen `next start` (nicht `next dev`).
- [ ] Konsole ohne Fehler, keine externen `http://`-Quellen.
- [ ] Screenshot beider Themes angesehen, nicht nur der Exit-Code.

## 11. Offene Punkte

1. **Akzentfarbe im Hellmodus.** Das Vorbild zeigt nur Dunkel. Grün in beiden
   Themes ist eine Setzung, kein Beleg. Ein Klick in `--accent` ändert es.
2. **Höhe auf ganze Kilometer.** Folgt dem Vorbild, verliert aber die
   Nachkommastelle. Falls die Genauigkeit wichtiger ist: eine Zeile ändern.
3. **Plot-Fenster 4 h.** Ein Wert, der sich anfühlen muss. Zu kurz wirkt
   abgeschnitten, zu lang drängt sich die Kurve zusammen.
4. **Umschalter-Platzierung.** Im Vorbild ist kein Umschalter zu sehen; die
   Position im Kopfbereich ist ein Vorschlag.
5. **Plot ohne Achsenbeschriftung.** Folgt dem Vorbild, kostet aber die
   Ablesbarkeit: man sieht die Form der Kurve, nicht die absoluten Werte.
   Zwei Achsenbeschriftungen im SVG würden das beheben.
6. **Dunkle Kacheln sind grau, nicht near-black.** Esri World Dark Gray ist
   der einzige geprüfte schlüsselfreie Anbieter, der echte Kacheln liefert.
   Das Vorbild zeigt gar keine Karte, insofern gibt es dort nichts zu treffen —
   aber ein anderer Anbieter würde die Marke näher an das Vorbild bringen.
