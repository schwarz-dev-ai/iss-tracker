# Leaflet — Fallen, die in diesem Projekt schon zugeschlagen haben

Zwei Fehler sind beim Bau der ersten Version aufgetreten. Beide waren im
Quellcode nicht zu sehen, beide sind erst im Browser aufgefallen, und beide
hätte ein Build-Test nie gefunden. Wer neuen Leaflet-Code schreibt, sollte sie
kennen.

## 1. Die Datumsgrenze reißt Marker und Spur aus dem Bild

**Symptom:** Die ISS fliegt über 180° — die Länge springt von `+179.9` auf
`-179.9`. Die Spur zieht sich als gerade Linie einmal quer über die ganze Karte,
und der Marker verschwindet aus dem sichtbaren Bereich (im Test: `x = -3467`).

**Ursache:** Leaflet projiziert Vektoren **linear und ohne Umschlag**. Es gibt
zwar `worldCopyJump`, das betrifft aber nur die Kartenmitte beim Verschieben,
nicht die Projektion von Markern und Linien. Ein Sprung um 360° Länge ist in
Projektionskoordinaten ein Sprung um eine ganze Weltbreite.

**Lösung:** Die Länge **fortlaufend weiterzählen** statt sie roh zu verwenden —
`…, 179, 180, 181, …` — und diesen durchgehenden Wert für Marker, Spur **und**
`setView` benutzen. Angezeigt wird weiterhin der Rohwert der API, damit der
Nutzer `178° W` sieht und nicht `182° E`.

```js
let longitude = next.longitude;
const previousLongitude = unwrappedLngRef.current;
if (previousLongitude !== null) {
  while (longitude - previousLongitude > 180) longitude -= 360;
  while (longitude - previousLongitude < -180) longitude += 360;
}
unwrappedLngRef.current = longitude;
applyToMap([next.latitude, longitude]);
```

**Wichtig:** `worldCopyJump: true` muss dabei **aus** bleiben. Leaflet holt damit
die Kartenmitte beim Verschieben zurück in `[-180°, 180°]` und reißt genau die
fortlaufende Zählung wieder auf.

**Naheliegender, aber falscher Ansatz:** Die Spur an der Datumsgrenze in zwei
Segmente teilen. Das verhindert zwar die Linie quer über die Karte, schiebt die
alten Punkte aber in eine andere Weltkopie — sie sind dann nicht mehr neben dem
Marker, sondern außerhalb des Bildes. Die fortlaufende Zählung ist der einzige
Ansatz, bei dem Karte, Marker und Spur in derselben Kopie bleiben.

## 2. Bei niedrigem Zoom bewegt sich der Marker unsichtbar

**Symptom:** Das Akzeptanzkriterium "der Marker bewegt sich innerhalb von
10 Sekunden sichtbar" fällt durch, obwohl der Code korrekt ist.

**Ursache:** Zoomstufe 2 zeigt die ganze Welt auf ~1024 px, also rund
2,8 px pro Längengrad. Die ISS schafft etwa 0,06° pro Sekunde — das sind
**2 px in 10 Sekunden**. Technisch eine Bewegung, praktisch unsichtbar.

**Lösung:** Bei der ersten bekannten Position auf die ISS springen und dabei
näher heranzoomen (Zoom 4 ≈ 11 px pro Grad ≈ 6 px pro 10 s). Der Weltüberblick
beim Start bleibt, aber sobald die erste Position da ist, wird fokussiert.

Merkregel: Ein positionsabhängiges Feature wird bei Zoom ≥ 4 geprüft. Bei
Zoom 2 oder 3 lässt sich Bewegung nicht beurteilen.

## 3. HTTP 200 heißt noch nicht, dass eine Karte kommt

**Symptom:** Der Dunkelmodus zeigt eine leere Karte mit der kachelfüllenden
Aufschrift „API KEY REQUIRED — carto.com/basemaps/apikey". Alle automatischen
Prüfungen bestehen trotzdem: HTTP 200, `Content-Type: image/png`, Kacheln im
DOM, keine Konsolenfehler.

**Ursache:** CARTO liefert ohne API-Schlüssel nur noch Platzhalter aus — auf
beiden Hostnamen (`*.basemaps.cartocdn.com` und `*.global.ssl.fastly.net`),
über alle Kacheln hinweg **byteweise identisch** und exakt 2513 Byte groß.
Statuscode und Content-Type sehen dabei völlig korrekt aus.

**Lehre:** Bei Kachelanbietern den Bildinhalt prüfen, nicht den Statuscode.
Platzhalter sind über alle Kacheln identisch, echte Kartenkacheln nie — der
Byte-Vergleich in `feature-check.mjs` fängt das.

**Zweite Falle an derselben Stelle:** OpenStreetMap beantwortet einen `fetch`
aus Node (ohne Browser-Kennung) mit HTTP 200 und einer 6987 Byte großen
Sperrkachel, dem Browser dagegen mit der echten Kachel (ca. 25 KB). Eine
Prüfung, die Kacheln in Node nachlädt, meldet deshalb falschen Alarm. Richtig
ist der Umweg über die Seite: beide Anbieter senden
`Access-Control-Allow-Origin: *`, die Bytes sind also im Browser lesbar — und
zwar genau die, die auch angezeigt werden.

## 4. Kleinigkeiten, die sonst Zeit kosten

- **Leaflet braucht das DOM.** Karte immer erst im `useEffect` aufbauen, nie
  beim Rendern. Der dynamische `import('leaflet')` löst asynchron auf — im
  Cleanup deshalb ein `disposed`-Flag setzen, sonst baut der Import nach dem
  Unmount noch eine Karte in einen verschwundenen Container.
- **`reactStrictMode` ist im App Router standardmäßig an.** Effekte laufen im
  Dev-Modus doppelt. Das Cleanup muss die Karte wirklich abräumen
  (`map.remove()`) und die Refs auf `null` setzen, sonst gibt es
  "Map container is already initialized".
- **Das Marker-Symbol nicht über `L.Icon.Default` laden.** Die Pfade der
  Standardgrafik gehen durch Bundler kaputt. `L.divIcon` mit eigenem HTML
  umgeht das Problem vollständig und lässt sich per CSS gestalten.
- **Kacheln und Attribution gehören zusammen.** OpenStreetMap-Kacheln nur mit
  `&copy; OpenStreetMap-Mitwirkende` verwenden.
