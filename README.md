# iss-tracker

Live-Position der Internationalen Raumstation (ISS) auf einer Karte.
Reine Frontend-App auf Basis des Next.js App Router, ohne eigenes Backend.

## Starten

```bash
npm install
npm run dev          # http://localhost:3000
```

Für einen Produktionslauf:

```bash
npm run build
npm start            # http://localhost:3000
```

## Aufbau

| Pfad | Zweck |
|---|---|
| `app/page.js` | Einstiegsseite, rendert den Tracker |
| `app/layout.js` | HTML-Grundgerüst, Metadaten, Leaflet-CSS, Theme-Skript |
| `app/components/IssTracker.js` | Karte, Polling, Anzeige (Client-Komponente) |
| `app/components/GroundTrackPlot.js` | Bahnkurve: geografische Breite über Zeit |
| `app/components/SegmentedSwitch.js` | Umschalter für Ansicht und Farbschema |
| `app/components/useTheme.js` | Farbschema: System, Hell, Dunkel |
| `app/globals.css` | Layout und Gestaltung beider Farbschemata |
| `ai_docs/PRD.md` | Anforderungen |
| `ai_docs/features/` | Specs einzelner Features |

## Bedienung

- **Ansicht** – *Karte* zeigt die ISS auf der Weltkarte (mit Spur und
  Verfolgungsschalter), *Plot* zeigt die geografische Breite der letzten vier
  Stunden als Kurve. Der Verlauf wird beim Öffnen nachgeladen, nicht erst
  stundenlang gesammelt.
- **Farbschema** – *System*, *Hell* oder *Dunkel*. Die Wahl wird im Browser
  gemerkt; ohne Wahl folgt die App der Systemeinstellung. Im Dunkelmodus
  kommen dunkle Kartenkacheln zum Einsatz.

## Datenquelle

`https://api.wheretheiss.at/v1/satellites/25544` – HTTPS, kostenlos, ohne API-Key.
Die Position wird alle 5 Sekunden neu abgerufen.

Open Notify (`/iss-now.json`) wird bewusst **nicht** verwendet: die API ist nur über
HTTP erreichbar und würde nach dem Deploy an der Mixed-Content-Sperre des Browsers
scheitern.

Für den Plot werden beim Öffnen zusätzlich die letzten vier Stunden über
`…/positions?timestamps=…` nachgeladen — derselbe Anbieter, kein Schlüssel.
Der Endpunkt nimmt nur knapp 600 Zeichen URL an, deshalb zwei Aufrufe mit je
44 Zeitstempeln.

Kartenkacheln: OpenStreetMap (hell) und Esri „World Dark Gray" (dunkel).
CARTO `dark_all` wurde verworfen, weil CARTO ohne API-Key inzwischen nur noch
Platzhalterkacheln mit der Aufschrift „API KEY REQUIRED" ausliefert. Leaflet
wird ausschließlich clientseitig geladen, die Seite selbst wird vorgerendert
(statisch).

## Deployment

Mit dem App Router ist Vercel der einfachste Weg:

```bash
npx vercel --prod
```

Die mitgelieferte `vercel.json` setzt `"framework": "nextjs"`. Ohne sie richtet
sich Vercel nach dem Framework-Preset des Projekts; steht das auf „Other",
sucht Vercel nach dem Build ein Ausgabeverzeichnis `public` und bricht ab:

```
Error: No Output Directory named "public" found after the Build completed.
```

Ein Next.js-Projekt hat kein `public`-Ausgabeverzeichnis (es hat höchstens einen
`public/`-Ordner für statische Dateien), sondern baut nach `.next`. Die Angabe in
`vercel.json` überschreibt das Preset und macht die Einstellung mit dem Code
versionierbar. Alternativ im Dashboard unter *Settings → Build and Deployment*
das Preset auf **Next.js** stellen und das Feld *Output Directory* leeren.
