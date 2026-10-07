# Projektkonventionen ISS-Tracker

Diese Konventionen stammen aus `ai_docs/PRD.md` und aus der ersten gebauten
Version. Neuer Code soll sich wie der vorhandene lesen.

## Ablage

| Pfad | Inhalt |
|---|---|
| `app/page.js` | Einstiegsseite, rendert die Ansicht |
| `app/layout.js` | HTML-Gerüst, Metadaten, Leaflet-CSS, Inline-Theme-Skript |
| `app/components/IssTracker.js` | Karte, Polling, Anzeige (Client-Komponente) |
| `app/components/GroundTrackPlot.js` | Bahnkurve als SVG (Breite über Zeit) |
| `app/components/SegmentedSwitch.js` | Umschalter (Radiogruppe) für Ansicht und Farbschema |
| `app/components/useTheme.js` | Farbschema System/Hell/Dunkel |
| `app/globals.css` | Layout und Gestaltung beider Farbschemata |
| `app/icon.svg` | Favicon (Dateikonvention von Next) |
| `ai_docs/PRD.md` | Anforderungen und offene Punkte |
| `ai_docs/features/` | Specs einzelner Features |

Der gesamte Quellcode der App liegt in `app/` (PRD §5). `package.json` und
`next.config.mjs` bleiben im Projektstamm — das ist Next-Konvention und kein
Widerspruch dazu.

## Harte Randbedingungen

- **Kein Backend.** Next.js wird nur als Frontend-Framework genutzt. Einzige
  erlaubte Ausnahme laut PRD: ein Route Handler unter `app/api/` als Proxy für
  Bonus B4, weil `astros.json` nur über HTTP erreichbar ist.
- **Nur HTTPS.** Jede externe Quelle muss über HTTPS laufen, sonst blockiert der
  Browser sie nach dem Deploy als Mixed Content. Das ist der Grund, warum
  `api.wheretheiss.at` statt Open Notify verwendet wird.
- **Keine API-Keys oder Secrets im Code.** Beide erlaubten APIs brauchen keinen.
- **Robustheit (PRD §5).** Ein fehlgeschlagener Abruf darf die Seite nicht leeren
  und nicht abstürzen lassen. Das Polling läuft weiter und die Anzeige erholt
  sich von selbst, sobald die API wieder antwortet — ohne Neuladen.

## Sprache und Darstellung

- Oberfläche, Kommentare und Commit-Messages auf **Deutsch**.
- Zahlen mit `toLocaleString('de-DE')` formatieren: Dezimalkomma, Tausenderpunkt.
- Koordinaten mit **Vorzeichen** statt Himmelsrichtung: `-25,0466°`, `170,1359°`.
  Das gibt das Vorbildbild vor (`ai_docs/images/darkmode-example.png`).
- Höhe ganzzahlig in `km`, Geschwindigkeit in `km/h`, die Einheit steht als
  eigene, kleinere Schrift **neben** dem Wert (`419` + `km`), nicht darin.
- Die Oberfläche soll einfach und übersichtlich bleiben (PRD §9).

## Farbschema

Zwei Zustände, umgeschaltet über `data-theme="light"|"dark"` am `<html>`.
Gesetzt wird das Attribut von einem Inline-Skript in `layout.js` noch vor dem
ersten Paint (sonst blitzt bei dunklem System die helle Oberfläche auf) und
danach von `useTheme`. Deshalb steht im CSS **keine**
`@media (prefers-color-scheme)`-Verdopplung — es gibt genau `:root` und
`:root[data-theme='dark']`.

Neue Farben gehören immer in beide Token-Blöcke. Für Leaflet-Ebenen, die ihre
Farbe als Attribut setzen (die Spur), reicht `var(--accent)` nicht — dort den
berechneten Wert über `getComputedStyle` holen.

## Aufbau der Komponente

Die bestehende `IssTracker.js` trennt drei Dinge sauber — neue Features sollten
sich daran halten:

1. **Anzeigezustand** (`useState`) — was der Nutzer sieht, z. B. `position`,
   `error`, `follow`.
2. **Zeichenzustand** (`useRef`) — Marker, Spur, Karte. Refs, weil Leaflet-
   Objekte außerhalb von React leben und Änderungen daran kein Re-Render
   auslösen sollen.
3. **Spiegel-Refs** für Werte, die in Callbacks gebraucht werden, die nur einmal
   erzeugt werden (`followRef`, `showTrailRef`). Ohne sie liest der
   Polling-Closure einen veralteten Stand.

Das Polling läuft in einem eigenen `useEffect` mit leerer Abhängigkeitsliste und
überlappt sich nicht (Flag `inFlight`), inklusive `AbortController` mit
Zeitlimit, damit eine hängende Anfrage den nächsten Versuch nicht blockiert.

Ein Fehler setzt `error`, löscht aber **nicht** `position` — die zuletzt
bekannte Position bleibt sichtbar und wird als solche gekennzeichnet.

## Vorhandene IDs aus dem PRD

| ID | Anforderung | Stand |
|---|---|---|
| F1 | Karte mit Leaflet und ISS-Marker | umgesetzt |
| F2 | Breite, Länge, Höhe, Geschwindigkeit | umgesetzt |
| F3 | Aktualisierung alle 5 s | umgesetzt |
| F4 | Verständlicher Hinweis bei API-Ausfall | umgesetzt |
| B1 | Spur der letzten Positionen | umgesetzt |
| B2 | Karte folgt der ISS, per Schalter | umgesetzt |
| B3 | Tag/Nacht über `visibility` | umgesetzt |
| B4 | Astronauten-Liste aus `astros.json` | **offen** (braucht Proxy) |

Dazu, außerhalb des PRD (Spec: `ai_docs/features/theme-umschalter.md`):

| ID | Anforderung | Stand |
|---|---|---|
| T1 | Farbschema System/Hell/Dunkel, gemerkt | umgesetzt |
| T2 | Dunkle Kacheln (Esri World Dark Gray) | umgesetzt |
| T3 | Plot der Bodenspur, vier Stunden nachgeladen | umgesetzt |

Maßgeblich ist der Code, nicht diese Tabelle — sie kann veralten.

## Kartenkacheln

| Schema | Anbieter |
|---|---|
| hell | OpenStreetMap, `tile.openstreetmap.org/{z}/{x}/{y}.png` |
| dunkel | Esri World Dark Gray, `server.arcgisonline.com/…/MapServer/tile/{z}/{y}/{x}` |

**Esri zählt die Achsen als `{z}/{y}/{x}`** — anders als Leaflet-Standard und
anders als OpenStreetMap. Vertauscht man sie, kommt eine Karte vom anderen Ende
der Welt.

Die Kachelebenen entstehen beide einmal beim Kartenaufbau; beim Themenwechsel
wird nur getauscht, nicht neu gebaut.

## Prüfskripte

| Skript | Prüft |
|---|---|
| `browser-check.mjs` | allgemeiner Rauchtest (Karte, Marker, Werte, Bewegung) |
| `feature-check.mjs` | Farbschema, Kachelwechsel, Plot, Ansichtswechsel |
| `robustness-check.mjs` | Datumsgrenze und Fehlerpfad mit geskripteten Antworten |

Alle über `run-check.ps1 -Script <name>`.
