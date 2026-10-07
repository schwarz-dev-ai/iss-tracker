// Prüft den ISS-Tracker in einem echten Chrome.
//
//   node browser-check.mjs <url> [--out <verzeichnis>] [--expect <css-selector>]...
//
// Gegen den Produktions-Build richten (next start), nicht gegen next dev:
// der Dev-Server hängt eine eigene Schaltfläche in die Seite.
// Exit-Code 0 = alle Pflichtprüfungen bestanden, 1 = mindestens eine gerissen.

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
    : resolve(process.env.TEMP ?? '.', 'iss-check');

const expects = argv.reduce(
  (acc, arg, i) => (arg === '--expect' && argv[i + 1] ? [...acc, argv[i + 1]] : acc),
  [],
);

// Wie lange der Marker beobachtet wird, um Bewegung festzustellen.
const OBSERVE_MS = 14000;

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FEHL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const readState = (page) =>
  page.evaluate(() => {
    const marker = document.querySelector('.iss-marker');
    const rect = marker?.getBoundingClientRect();
    return {
      mapReady: !!document.querySelector('.leaflet-container'),
      tiles: document.querySelectorAll('.leaflet-tile-loaded').length,
      marker: rect ? { x: Math.round(rect.x), y: Math.round(rect.y) } : null,
      trailPaths: document.querySelectorAll('.leaflet-overlay-pane path').length,
      values: [...document.querySelectorAll('.stat__value')].map((v) => v.textContent.trim()),
      status: document.querySelector('.signal')?.className ?? null,
      notice: document.querySelector('.notice')?.textContent?.trim() ?? null,
      text: document.body.innerText.trim(),
    };
  });

mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const consoleErrors = [];
const failedRequests = [];
const insecureExternal = [];

page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'pageerror') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(e.message));
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} (${r.failure()?.errorText})`));
page.on('request', (r) => {
  const u = r.url();
  if (u.startsWith('http://') && !u.includes('localhost') && !u.includes('127.0.0.1')) {
    insecureExternal.push(u);
  }
});

try {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  await page.waitForSelector('.iss-marker', { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const v = document.querySelector('.stat__value');
      return v && v.textContent.trim() !== '–' && v.textContent.trim() !== '-';
    },
    { timeout: 30000 },
  );

  const first = await readState(page);

  // Marker über einen längeren Zeitraum beobachten.
  const positions = [first.marker];
  const steps = Math.ceil(OBSERVE_MS / 2000);
  for (let i = 0; i < steps; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    positions.push((await readState(page)).marker);
  }

  const moved = positions.filter(Boolean).some(
    (p, i, a) => i > 0 && (p.x !== a[0].x || p.y !== a[0].y),
  );

  const last = await readState(page);
  const shot = resolve(outDir, 'screenshot.png');
  await page.screenshot({ path: shot });

  console.log(`\nURL: ${url}`);
  console.log(`Screenshot: ${shot}\n`);

  record('Seite rendert Inhalt', last.text.length > 40, `${last.text.length} Zeichen`);
  record('Karte initialisiert', last.mapReady);
  record('Kacheln geladen', last.tiles > 0, `${last.tiles} Kacheln`);
  record('ISS-Marker vorhanden', !!last.marker);
  record(
    'Kennwerte gefüllt',
    last.values.length > 0 && last.values.every((v) => v !== '–' && v !== '-'),
    last.values.join(' | '),
  );
  record(
    'Statusanzeige meldet SIGNAL OK',
    (last.status ?? '').includes('signal--live'),
    String(last.status),
  );
  record('Marker bewegt sich', moved, JSON.stringify(positions));
  record('kein Fehlerhinweis sichtbar', last.notice === null, last.notice ?? '');

  for (const selector of expects) {
    const found = (await page.$(selector)) !== null;
    record(`erwartetes Element ${selector}`, found);
  }

  record('keine Konsolenfehler', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' / '));
  record(
    'keine externen http://-Quellen (Mixed Content)',
    insecureExternal.length === 0,
    insecureExternal.slice(0, 5).join(' / '),
  );

  if (failedRequests.length > 0) {
    console.log(`\nHinweis: ${failedRequests.length} fehlgeschlagene Requests:`);
    failedRequests.slice(0, 10).forEach((f) => console.log(`  ${f}`));
  }
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
  console.log('\nNicht vergessen: den Screenshot mit dem Read-Tool ansehen —');
  console.log('die Prüfungen erkennen "Element fehlt", nicht "Linie läuft quer über die Karte".');
}
process.exit(failed.length === 0 ? 0 : 1);
