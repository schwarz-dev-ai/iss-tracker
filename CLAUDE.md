# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Umgebung

`node` und `npm` liegen auf dieser Maschine **nicht im PATH**. In jeder neuen Shell zuerst:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
```

## Befehle

```powershell
npm run dev      # http://localhost:3000
npm run build
npm start        # http://localhost:3000
```

Es gibt **keinen Linter und keinen Unit-Test-Runner** — `package.json` kennt nur `dev`, `build`, `start`. Keinen erfinden. Die Verifikation läuft über die Puppeteer-Skripte in `.claude/skills/create-features/scripts/`:

```powershell
.\.claude\skills\create-features\scripts\run-check.ps1                               # Rauchtest
.\.claude\skills\create-features\scripts\run-check.ps1 -Script feature-check.mjs     # Farbschema, Kacheln, Plot
.\.claude\skills\create-features\scripts\run-check.ps1 -Script robustness-check.mjs  # Datumsgrenze, Fehlerpfad
```

Der erste Lauf richtet einmalig `puppeteer-core` in `%TEMP%\iss-browser-check` ein; das Projekt bleibt unberührt. `-Expect <selector>` prüft zusätzliche Selektoren.

## Verifikation

- Gegen `next start` prüfen, **nie gegen `next dev`**: der Dev-Server hängt ein eigenes Overlay (`nextjs-portal`) in die Seite, das im Deployment nicht existiert.
- **Den Screenshot ansehen.** Die Prüfungen erkennen „Element ist da", nicht „Linie läuft quer über die Karte". Die beiden ernsten Fehler der bisherigen Arbeit — CARTO-Platzhalterkacheln trotz HTTP 200 und ein am rechten Rand abgeschnittenes Fadenkreuz — haben alle Assertions bestanden.
- Fehlerpfad und Datumsgrenze sind Pflicht bei allem, was Positionen speichert oder zeichnet.

## Diese Next.js-Version weicht ab

Der Block in `AGENTS.md` ist keine Deko: APIs, Konventionen und Dateistruktur können von den Trainingsdaten abweichen. Vor dem Schreiben von Next-Code den passenden Leitfaden unter `node_modules/next/dist/docs/01-app/` lesen und Deprecation-Hinweise beachten. Den Block nicht aus einem Diff entfernen — `next dev` schreibt ihn neu.

## Architektur

`app/page.js` rendert nur `<IssTracker />`. Die gesamte App ist **eine Client-Komponente**; alles darunter ist zustandslos (Präsentation, Hooks, Geometrie).

**Leaflet lebt außerhalb von React.** Die Karte wird erst im `useEffect` aufgebaut, per dynamischem `import('leaflet')`, mit einem `disposed`-Flag im Cleanup. Leaflet-Objekte liegen in `useRef`, nicht im State — Änderungen daran sollen kein Re-Render auslösen. Werte, die ein nur einmal erzeugter Callback liest, brauchen Spiegel-Refs (`followRef`, `showTrailRef`), sonst liest der Closure einen veralteten Stand. Fallen und Gegenmittel: `.claude/skills/create-features/reference/leaflet-stolperfallen.md`.

**Datumsgrenze.** Leaflet projiziert Vektoren linear und ohne Umschlag. Die Länge wird deshalb fortlaufend weitergezählt (`…, 179, 180, 181, …`) und dieser Wert für Marker, Spur und `setView` benutzt; angezeigt wird der Rohwert der API. `worldCopyJump` muss dafür **aus** bleiben.

**Farbschema.** Drei Zustände (`system`/`light`/`dark`) in `useTheme.js`, gemerkt unter `iss-tracker-theme`. Gesetzt wird `data-theme` auf `<html>` — einmal von einem Inline-Skript in `layout.js` vor dem ersten Paint (sonst blitzt bei dunklem System kurz die helle Oberfläche auf), danach von `useTheme`. Deshalb steht im CSS **keine** `@media (prefers-color-scheme)`-Verdopplung, sondern nur `:root` und `:root[data-theme='dark']`. Neue Farben gehören immer in beide Token-Blöcke.

**Zwei Ansichten.** Karte und Plot sind zwei `position:absolute`-Ebenen; die inaktive wird per `display:none` versteckt statt ausgehängt, damit die Leaflet-Karte am Leben bleibt. Beim Zurückwechseln ist deshalb ein `invalidateSize()` nötig, sonst bleibt die Karte grau.

**Plot.** `GroundTrackPlot.js` zeichnet von Hand SVG — **kein Leaflet**, der Plot ist kein Geodatensatz. Die x-Achse ist **Zeit**, nicht Länge: nur so entsteht die eine durchgehende Sinuskurve statt einer um ~23° versetzten Kurve pro Runde, und das Datumsgrenzen-Problem berührt den Plot strukturell nicht. Die echte Größe kommt vom `ResizeObserver`, nicht von `preserveAspectRatio="none"` — Streckung würde die Strichstärke verzerren. Der Verlauf wird beim Öffnen über `…/positions?timestamps=…` nachgeladen; der Endpunkt nimmt nur knapp 600 Zeichen URL an, deshalb zwei Aufrufe mit je 44 Zeitstempeln.

## Randbedingungen

Aus `ai_docs/PRD.md`; sie gelten für jede Änderung, auch für neue Features:

- **Kein Backend.** Next.js ist nur Frontend. Einzige erlaubte Ausnahme: ein Route Handler unter `app/api/` als Proxy für Bonus B4.
- **Nur HTTPS.** Jede externe Quelle, sonst greift nach dem Deploy die Mixed-Content-Sperre des Browsers. Deshalb `api.wheretheiss.at` statt Open Notify.
- **Keine API-Keys oder Secrets im Code.** APIs und Kachel-Anbieter müssen schlüsselfrei sein. CARTO `dark_all` wurde genau deswegen verworfen — es liefert ohne Key nur Platzhalterkacheln.
- **Robustheit.** Ein fehlgeschlagener Abruf darf die Seite nie leeren; das Polling läuft weiter und erholt sich ohne Neuladen. Ein Fehler setzt `error`, löscht aber nicht die zuletzt bekannte Position.
- Oberfläche, Kommentare und Commit-Messages auf **Deutsch**; Zahlen mit `toLocaleString('de-DE')`, Koordinaten mit Vorzeichen statt Himmelsrichtung.

## Arbeitsweise

Features über das Skill `create-features` bauen — es beschreibt den Ablauf und die Prüfpflicht. Anforderungen stehen in `ai_docs/PRD.md` (Abschnitt 4 = F- und B-Anforderungen, Abschnitt 9 = bewusst offene Punkte: entscheiden, nicht raten), Specs einzelner Features in `ai_docs/features/`. Maßgeblich ist der Code, nicht das PRD.
