// Prüft die zwei Dinge, die kein normaler Durchlauf abdeckt:
//
//   1. Datumsgrenze — die ISS überquert 180°. Ohne fortlaufende Zählung der
//      Länge zieht die Spur quer über die Karte und der Marker verschwindet.
//   2. Fehlerpfad    — die API fällt aus. Es muss ein verständlicher Hinweis
//      erscheinen, die Seite bedienbar bleiben und sich ohne Neuladen erholen.
//
//   node robustness-check.mjs <url> [--out <verzeichnis>]
//
// Beide Fälle werden mit geskripteten API-Antworten erzeugt, statt auf den
// echten Überflug zu warten. Gegen next start richten, nicht gegen next dev.

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const argv = process.argv.slice(2);
const url = argv.find((a) => !a.startsWith('--')) ?? 'http://localhost:3100';

const outIndex = argv.indexOf('--out');
const outDir =
  outIndex !== -1
    ? resolve(argv[outIndex + 1])
    : resolve(process.env.TEMP ?? '.', 'iss-robustness-check');

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FEHL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// Längen, die 180° überqueren — roh, so wie die API sie liefert.
const LONGITUDES = [177.5, 179.0, 180.0, -179.5, -178.0, -176.5];

let mode = 'scripted'; // 'scripted' | 'blocked' | 'live'
let scriptedIndex = 0;

mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(e.message));

await page.setRequestInterception(true);
page.on('request', (request) => {
  const target = request.url();
  if (!target.includes('wheretheiss.at')) {
    request.continue();
    return;
  }

  if (mode === 'blocked') {
    request.abort('failed');
    return;
  }

  if (mode === 'live') {
    request.continue();
    return;
  }

  scriptedIndex += 1;
  request.respond({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      name: 'iss',
      id: 25544,
      latitude: 12.5,
      longitude: LONGITUDES[scriptedIndex % LONGITUDES.length],
      altitude: 419.2,
      velocity: 27587.3,
      visibility: 'daylight',
      footprint: 4530.1,
      timestamp: Math.floor(Date.now() / 1000),
      units: 'kilometers',
    }),
  });
});

const readState = () =>
  page.evaluate(() => {
    const marker = document.querySelector('.iss-marker');
    const map = document.querySelector('.leaflet-container');
    const markerRect = marker?.getBoundingClientRect();
    const mapRect = map?.getBoundingClientRect();

    let trailLeft = Infinity;
    let trailRight = -Infinity;
    for (const path of document.querySelectorAll('.leaflet-overlay-pane path')) {
      const rect = path.getBoundingClientRect();
      trailLeft = Math.min(trailLeft, rect.left);
      trailRight = Math.max(trailRight, rect.right);
    }

    return {
      markerX: markerRect ? Math.round(markerRect.x) : null,
      mapLeft: mapRect ? Math.round(mapRect.left) : null,
      mapRight: mapRect ? Math.round(mapRect.right) : null,
      trailWidth: Number.isFinite(trailLeft) ? Math.round(trailRight - trailLeft) : null,
      trailPaths: document.querySelectorAll('.leaflet-overlay-pane path').length,
      tiles: document.querySelectorAll('.leaflet-tile-loaded').length,
      values: [...document.querySelectorAll('.stat__value')].map((v) => v.textContent.trim()),
      notice: document.querySelector('.notice')?.textContent?.trim() ?? null,
      signal: document.querySelector('.signal')?.className ?? null,
    };
  });

try {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.iss-marker', { timeout: 30000 });
  await page.evaluate(() => {
    window.__sentinel = 'unverändert';
  });

  // --- 1. Datumsgrenze --------------------------------------------------
  // Sechs geskriptete Positionen abwarten, dabei Marker und Spur beobachten.
  const samples = [];
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    samples.push(await readState());
  }

  const last = samples[samples.length - 1];

  const markerInView = samples.every(
    (sample) =>
      sample.markerX !== null &&
      sample.mapLeft !== null &&
      sample.markerX >= sample.mapLeft - 60 &&
      sample.markerX <= sample.mapRight + 60,
  );
  record(
    'Marker bleibt beim Überqueren von 180° im Bild',
    markerInView,
    samples.map((s) => s.markerX).join(' → '),
  );

  const mapWidth = (last.mapRight ?? 0) - (last.mapLeft ?? 0);
  const widest = Math.max(...samples.map((s) => s.trailWidth ?? 0));
  record(
    'Spur zieht keine Linie quer über die Karte',
    widest > 0 && widest < mapWidth * 1.5,
    `${widest} px breit bei ${mapWidth} px Karte`,
  );
  record('Spur ist überhaupt vorhanden', last.trailPaths > 0, `${last.trailPaths} Pfade`);

  await page.screenshot({ path: resolve(outDir, 'datumsgrenze.png') });

  // --- 2. Fehlerpfad ----------------------------------------------------
  mode = 'blocked';
  await new Promise((r) => setTimeout(r, 13000));
  const broken = await readState();

  record(
    'Hinweis erscheint statt leerer Seite',
    (broken.notice ?? '').includes('KEIN SIGNAL'),
    (broken.notice ?? 'kein Hinweis').slice(0, 90),
  );
  record('Statusanzeige meldet den Ausfall', (broken.signal ?? '').includes('signal--error'), String(broken.signal));
  record(
    'letzte bekannte Position bleibt sichtbar',
    broken.values.length > 0 && broken.values.every((v) => v !== '–' && v !== '-'),
    broken.values.join(' | '),
  );
  record('Karte bleibt bedienbar', broken.tiles > 0, `${broken.tiles} Kacheln`);

  await page.screenshot({ path: resolve(outDir, 'kein-signal.png') });

  // --- 3. Selbstheilung -------------------------------------------------
  mode = 'scripted';
  await new Promise((r) => setTimeout(r, 12000));
  const healed = await readState();

  record('Anzeige erholt sich ohne Neuladen', healed.notice === null, healed.notice ?? 'kein Hinweis');
  record('Statusanzeige ist wieder live', (healed.signal ?? '').includes('signal--live'), String(healed.signal));
  record(
    'Seite wurde nicht neu geladen',
    (await page.evaluate(() => window.__sentinel)) === 'unverändert',
  );

  // Die absichtlich blockierten Abrufe erzeugen Konsolenfehler — erwartet.
  const unexpected = consoleErrors.filter(
    (message) => !message.includes('Failed to load resource') && !message.includes('ERR_FAILED'),
  );
  record('keine unerwarteten Konsolenfehler', unexpected.length === 0, unexpected.slice(0, 3).join(' / '));

  console.log(`\nURL: ${url}`);
  console.log(`Screenshots: ${resolve(outDir, 'datumsgrenze.png')}`);
  console.log(`             ${resolve(outDir, 'kein-signal.png')}`);
  console.log(`\nHinweis: ${consoleErrors.length} Konsolenfehler durch die absichtlich blockierten Abrufe.`);
} catch (err) {
  record('Durchlauf ohne Abbruch', false, err.message);
  try {
    await page.screenshot({ path: resolve(outDir, 'fehler.png') });
  } catch {
    /* Screenshot ist nur Beiwerk */
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) {
  console.log('\nNicht vergessen: die Screenshots mit dem Read-Tool ansehen —');
  console.log('die Prüfungen erkennen "Element fehlt", nicht "Linie läuft quer über die Karte".');
}
process.exit(failed.length === 0 ? 0 : 1);
