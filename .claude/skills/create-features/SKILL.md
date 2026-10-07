---
name: create-features
description: >
  Ein Feature des ISS-Trackers nach PRD umsetzen: auswaehlen, implementieren und
  im echten Browser gegen den Produktions-Build verifizieren. Nutze dieses Skill
  immer, wenn am ISS-Tracker ein Feature gebaut, ergaenzt oder umgesetzt werden
  soll - "bau Feature X", "setz B1 um", "naechstes Feature", "was fehlt noch",
  "erweitere den Tracker um ...", "implementier die Bonus-Aufgaben", "mach das
  PRD fertig", "build the next feature", "add feature X to the iss tracker".
  Auch dann nutzen, wenn nur "das PRD" oder "die offenen Punkte" genannt werden.
---

# Feature für den ISS-Tracker bauen

Ein Feature ist hier erst fertig, wenn es **im echten Browser nachweislich
läuft** — nicht, wenn der Build durchläuft.

## Schritt 0 — Umgebung

`node` und `npm` liegen auf dieser Maschine **nicht im PATH**. In jeder neuen
Shell zuerst:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
```

Ohne das schlägt jeder Aufruf mit "not recognized" fehl. Node ist installiert,
es fehlt nur der PATH-Eintrag.

## Schritt 1 — Offenes Feature bestimmen

1. `ai_docs/PRD.md` lesen (Abschnitt 4 = funktionale Anforderungen und Bonus).
2. Den aktuellen Code prüfen: Was ist schon da? Nicht dem PRD glauben, sondern
   `app/components/` ansehen — das PRD beschreibt den Soll-Zustand, nicht den Ist-Zustand.
3. Das nächste offene Feature vorschlagen und **vor dem Bauen kurz rückfragen**,
   wenn mehr als eines offen ist oder der Umfang unklar ist. Das PRD lässt
   bewusst Punkte offen (Abschnitt 9) — diese Punkte sind zu entscheiden, nicht
   zu raten.

Muss-Anforderungen (F) gehen den Bonus-Anforderungen (B) vor.

## Schritt 2 — Implementieren

Es gelten die Konventionen in `reference/konventionen.md`. Kurzfassung:

- Quellcode in `app/`, Karte und Abrufe nur clientseitig (`'use client'`).
- Kein Backend, keine API-Keys. Ausschließlich HTTPS-Quellen.
- Oberfläche und Kommentare auf Deutsch, Anzeigewerte mit `toLocaleString('de-DE')`.
- Robustheit: ein fehlgeschlagener Abruf darf die Seite nie leeren, und das
  Polling muss weiterlaufen und sich von selbst erholen.

Vor dem Schreiben von Leaflet-Code **`reference/leaflet-stolperfallen.md` lesen**.
Dort stehen zwei Fehler, die in diesem Projekt schon aufgetreten sind und die
man ohne den Hinweis sehr wahrscheinlich wieder einbaut.

## Schritt 3 — Produktions-Build

Nicht gegen `npm run dev` verifizieren: der Dev-Server hängt eine eigene
Schaltfläche (`nextjs-portal`, das "N"-Logo unten links) in die Seite, die im
Deployment nicht existiert und Screenshots verfälscht.

```powershell
npm run build
npx next start -p 3100
```

## Schritt 4 — Im Browser verifizieren (Pflicht)

```powershell
.\.claude\skills\create-features\scripts\run-check.ps1 -Url http://localhost:3100
```

Das Skript installiert beim ersten Lauf einmalig `puppeteer-core` in ein
Temp-Verzeichnis (das Projekt bleibt unberührt), startet Chrome headless und
prüft: Karte initialisiert, Kacheln geladen, Marker vorhanden, Kennwerte
gefüllt, Statusanzeige live, Marker bewegt sich, Spur vorhanden, keine
Konsolenfehler, keine externen `http://`-Quellen.

Dazu zwei weitere Skripte, die die Fälle abdecken, die ein normaler Durchlauf
nicht erwischt — je nach Feature das passende laufen lassen:

```powershell
# Farbschema, Kachelwechsel, Plot, Ansichtswechsel
.\.claude\skills\create-features\scripts\run-check.ps1 -Script feature-check.mjs

# Datumsgrenze und Fehlerpfad, mit geskripteten API-Antworten
.\.claude\skills\create-features\scripts\run-check.ps1 -Script robustness-check.mjs
```

Der Fehlerpfad und die Datumsgrenze stehen unten trotzdem als eigene Punkte:
`robustness-check.mjs` deckt sie automatisch ab, aber nur wenn es auch
ausgeführt wird.

Es legt einen Screenshot ab. **Den Screenshot mit dem Read-Tool ansehen** — die
automatischen Prüfungen erkennen "Element ist da", aber nicht "Linie läuft quer
über die Karte". Genau solche Fehler sind hier schon durchgerutscht.

Prüfungen für das neue Feature ergänzen, nicht nur die Standardprüfungen laufen
lassen. Beispiel:

```powershell
.\.claude\skills\create-features\scripts\run-check.ps1 -Url http://localhost:3100 -Expect ".astronauten-liste li"
```

Zusätzlich immer prüfen, was die automatischen Checks nicht abdecken:

- **Fehlerpfad:** API blockieren (Puppeteer-Request-Interception oder
  DevTools → Offline) und nachsehen, ob ein verständlicher Hinweis erscheint,
  die Seite bedienbar bleibt und sich die Anzeige nach dem Entsperren **ohne
  Neuladen** erholt.
- **Datumsgrenze:** Jedes Feature, das Positionen speichert oder zeichnet, muss
  den Sprung über 180° aushalten (siehe `reference/leaflet-stolperfallen.md`).

## Schritt 5 — Bericht

Kurz und belegbar:

- Was gebaut wurde, mit Dateipfaden.
- Die Prüftabelle aus Schritt 4 — auch die fehlgeschlagenen Versuche und was
  daraus folgte. Wenn ein Fehler gefunden und behoben wurde, das sagen.
- Was am PRD noch offen ist.

Keine Behauptung ohne Prüfung. Wenn ein Schritt übersprungen wurde, das
ausdrücklich sagen.

## Fertig ist es erst, wenn …

- [ ] `npm run build` ohne Fehler durchläuft.
- [ ] Das Ergebnis gegen `next start` geprüft wurde, nicht gegen `next dev`.
- [ ] Der Screenshot angesehen wurde, nicht nur der Exit-Code.
- [ ] Der Fehlerpfad geprüft wurde (Hinweis statt leerer Seite, Selbstheilung).
- [ ] Die Konsole keine Fehler und keine externen `http://`-Requests zeigt.
- [ ] Der Nutzer über alles Nicht-verifizierte informiert wurde.
