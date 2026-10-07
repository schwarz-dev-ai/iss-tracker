// Prüft gezielt den Theme-Umschalter und die Plot-Ansicht in einem echten Chrome.
//
//   node feature-check.mjs <url> [--out <verzeichnis>]
//
// Gegen den Produktions-Build richten (next start), nicht gegen next dev.
// Exit-Code 0 = alle Prüfungen bestanden, 1 = mindestens eine gerissen.

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
    : resolve(process.env.TEMP ?? '.', 'iss-feature-check');

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FEHL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

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

const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
const stored = () => page.evaluate(() => localStorage.getItem('iss-tracker-theme'));
const storedView = () => page.evaluate(() => localStorage.getItem('iss-tracker-view'));

// Klickt eine Schaltfläche des segmentierten Umschalters über ihre Beschriftung.
const clickSegment = (label) =>
  page.evaluate((text) => {
    const button = [...document.querySelectorAll('.segmented__option')].find(
      (candidate) => candidate.textContent.trim() === text,
    );
    if (!button) throw new Error(`Umschalter "${text}" nicht gefunden`);
    button.click();
  }, label);

// Platzhalter-Kacheln sind über alle Kacheln hinweg byteweise identisch —
// echte Kartenkacheln nie. Der Byte-Vergleich fängt damit einen Anbieter, der
// zwar HTTP 200 liefert, aber keine Karte. Genau so liefert CARTO ohne
// Schlüssel heute nur noch "API KEY REQUIRED"-Bilder aus.
//
// Geprüft wird im Browser, nicht in Node: Kachelserver geben ohne
// Browser-Kennung ein Sperrbild zurück (OpenStreetMap antwortet einem
// Node-fetch mit HTTP 200 und einer 6987-Byte-Sperrkachel, dem Browser
// dagegen mit der echten Kachel). Beide Anbieter senden
// Access-Control-Allow-Origin: *, die Bytes sind also aus der Seite lesbar.
const inspectTiles = () =>
  page.evaluate(async () => {
    const sources = [
      ...new Set([...document.querySelectorAll('.leaflet-tile')].map((tile) => tile.src)),
    ].slice(0, 4);
    if (sources.length === 0) return { count: 0, distinct: 0, sizes: [] };

    const tiles = await Promise.all(
      sources.map(async (url) => {
        const response = await fetch(url);
        const body = await response.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', body);
        const hash = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        return { size: body.byteLength, hash };
      }),
    );

    return {
      count: tiles.length,
      distinct: new Set(tiles.map((tile) => tile.hash)).size,
      sizes: tiles.map((tile) => tile.size),
    };
  });

const mapVisible = () =>
  page.evaluate(() => {
    const pane = document.querySelector('.stage__pane');
    if (!pane || getComputedStyle(pane).display === 'none') return false;
    return document.querySelectorAll('.leaflet-tile-loaded').length > 0;
  });

try {
  // --- Theme: Systemzustand folgen -------------------------------------
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const atFirstPaint = await theme();
  record(
    'data-theme steht schon vor dem ersten Paint',
    atFirstPaint === 'dark',
    String(atFirstPaint),
  );
  record('ohne gemerkte Wahl folgt die App dem System', (await theme()) === 'dark');

  await page.waitForSelector('.segmented__option', { timeout: 30000 });

  // --- Theme: bewusste Wahl --------------------------------------------
  await clickSegment('Hell');
  record('Klick auf "Hell" schaltet um', (await theme()) === 'light');
  record('Wahl landet in localStorage', (await stored()) === 'light');

  await page.reload({ waitUntil: 'domcontentloaded' });
  record('Wahl überlebt das Neuladen', (await theme()) === 'light');

  // System umstellen, während "Hell" gewählt ist — darf nicht durchschlagen.
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await clickSegment('System');
  record('"System" löscht die gemerkte Wahl', (await stored()) === null);
  record('"System" folgt wieder dem System', (await theme()) === 'light');

  // System live wechseln, während "System" gewählt ist.
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark', {
    timeout: 5000,
  }).catch(() => {});
  record('Systemwechsel wird live übernommen', (await theme()) === 'dark');

  await clickSegment('Dunkel');
  await page.waitForSelector('.leaflet-tile-loaded', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));

  const darkShot = resolve(outDir, 'dunkel.png');
  await page.screenshot({ path: darkShot });

  const darkInspect = await inspectTiles();
  record(
    'Dunkelmodus lädt echte Kartenkacheln (kein Platzhalter)',
    darkInspect.count >= 2 && darkInspect.distinct > 1,
    `${darkInspect.count} Kacheln, davon ${darkInspect.distinct} verschiedene, ${darkInspect.sizes.join('/')} Bytes`,
  );
  record(
    'Attribution der dunklen Kacheln vorhanden',
    await page.evaluate(
      () => (document.querySelector('.leaflet-control-attribution')?.textContent.trim().length ?? 0) > 20,
    ),
  );

  // --- Plot -------------------------------------------------------------
  await clickSegment('Plot');
  record('Klick auf "Plot" merkt die Ansicht', (await storedView()) === 'plot');

  await page.waitForFunction(
    () => (document.querySelector('.plot__curve')?.getAttribute('d')?.length ?? 0) > 500,
    { timeout: 30000 },
  ).catch(() => {});

  const curve = await page.evaluate(() => {
    const d = document.querySelector('.plot__curve')?.getAttribute('d') ?? '';
    return { length: d.length, points: (d.match(/[ML]/g) ?? []).length };
  });
  record(
    'Plot zeigt sofort einen nachgeladenen Verlauf',
    curve.points > 20,
    `${curve.points} Kurvenpunkte`,
  );
  record(
    'Plot zeichnet Gitter und Fadenkreuz',
    await page.evaluate(
      () => !!document.querySelector('.plot__grid') && !!document.querySelector('.plot__cursor-dot'),
    ),
  );

  // --- Plot läuft live weiter ------------------------------------------
  const beforeLive = curve.points;
  await new Promise((r) => setTimeout(r, 12000));
  const afterLive = await page.evaluate(
    () => ((document.querySelector('.plot__curve')?.getAttribute('d') ?? '').match(/[ML]/g) ?? []).length,
  );
  record('Kurve wächst live weiter', afterLive > beforeLive, `${beforeLive} → ${afterLive}`);

  const plotShot = resolve(outDir, 'plot-dunkel.png');
  await page.screenshot({ path: plotShot });

  // --- Ansicht überlebt das Neuladen -----------------------------------
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.plot', { timeout: 30000 });
  record(
    'Plot-Ansicht überlebt das Neuladen',
    await page.evaluate(() => getComputedStyle(document.querySelectorAll('.stage__pane')[1]).display !== 'none'),
  );

  // --- Zurück zur Karte -------------------------------------------------
  await clickSegment('Karte');
  await page.waitForSelector('.leaflet-tile-loaded', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  record('Karte ist nach dem Zurückschalten wieder da (invalidateSize)', await mapVisible());

  // --- Hell und Karte ---------------------------------------------------
  await clickSegment('Hell');
  await new Promise((r) => setTimeout(r, 2000));
  const lightShot = resolve(outDir, 'hell.png');
  await page.screenshot({ path: lightShot });

  const lightInspect = await inspectTiles();
  record(
    'Hellmodus lädt echte Kartenkacheln',
    lightInspect.count >= 2 && lightInspect.distinct > 1,
    `${lightInspect.count} Kacheln, davon ${lightInspect.distinct} verschiedene, ${lightInspect.sizes.join('/')} Bytes`,
  );

  record('keine Konsolenfehler', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' / '));

  console.log(`\nURL: ${url}`);
  console.log(`Screenshots: ${darkShot}\n             ${plotShot}\n             ${lightShot}`);
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
  console.log('die Prüfungen erkennen "Element fehlt", nicht "Kurve sieht falsch aus".');
}
process.exit(failed.length === 0 ? 0 : 1);
