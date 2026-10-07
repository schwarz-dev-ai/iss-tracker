'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import GroundTrackPlot, { PLOT_WINDOW_MS } from './GroundTrackPlot';
import SegmentedSwitch from './SegmentedSwitch';
import useTheme, { THEME_OPTIONS } from './useTheme';

const API_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
const POLL_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 8000;
const TRAIL_MAX_POINTS = 240;
const WORLD_ZOOM = 2;
const FOCUS_ZOOM = 4;

// Nachladen des Verlaufs. Der positions-Endpunkt nimmt nur knapp 600 Zeichen
// URL an — ab 47 Zeitstempeln antwortet er mit HTTP 400 ("invalid timestamp in
// list"). 44 Zeitstempel ergeben 568 Zeichen und sind sicher. Die vier Stunden
// des Fensters werden deshalb in zwei Aufrufen mit je 44 Punkten geholt.
const HISTORY_SLOTS = 88;
const HISTORY_PER_REQUEST = 44;
const HISTORY_STEP_S = Math.round(PLOT_WINDOW_MS / 1000 / HISTORY_SLOTS);
// Obergrenze des Plot-Puffers: vier Stunden im 5-Sekunden-Takt plus Reserve.
const PLOT_MAX_POINTS = 3200;

const VIEW_KEY = 'iss-tracker-view';
const VIEW_OPTIONS = [
  { id: 'map', label: 'Karte' },
  { id: 'plot', label: 'Plot' },
];

const SATELLITE_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="2" y="10" width="5" height="4" rx="1" />
      <rect x="17" y="10" width="5" height="4" rx="1" />
      <path d="M7 12h2.5M14.5 12H17" />
    </g>
  </svg>
`;

// Beide Kachel-Anbieter laufen über HTTPS und brauchen keinen Schlüssel.
//
// Die dunklen Kacheln kommen von Esri, nicht von CARTO: CARTO liefert seit
// einer Umstellung nur noch Platzhalter mit der Aufschrift "API KEY REQUIRED"
// aus, wenn kein Schlüssel mitgeschickt wird — die PRD verbietet Schlüssel.
// Achtung: Esri zählt die Achsen in der Reihenfolge {z}/{y}/{x}.
const TILE_LAYERS = {
  light: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
    },
  },
  dark: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    options: {
      maxZoom: 16,
      attribution:
        '&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; OpenStreetMap-Mitwirkende, GIS-Community',
    },
  },
};

function formatNumber(value, options) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  return value.toLocaleString('de-DE', options);
}

// Koordinaten mit Vorzeichen statt Himmelsrichtung, wie im Vorbild.
function formatSigned(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  const magnitude = formatNumber(Math.abs(value), {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
  return `${value < 0 ? '-' : ''}${magnitude}°`;
}

function describeVisibility(visibility) {
  if (visibility === 'daylight') return { label: 'Tag', hint: 'von der Sonne beleuchtet' };
  if (visibility === 'eclipsed') return { label: 'Nacht', hint: 'im Erdschatten' };
  return { label: '–', hint: 'unbekannt' };
}

// Zwei Punktreihen zusammenführen, Doppelte über den Zeitstempel entfernen.
function mergePoints(a, b) {
  const bySecond = new Map();
  for (const point of a) bySecond.set(Math.round(point.t / 1000), point);
  for (const point of b) bySecond.set(Math.round(point.t / 1000), point);

  const merged = [...bySecond.values()].sort((x, y) => x.t - y.t);
  return merged.length > PLOT_MAX_POINTS ? merged.slice(merged.length - PLOT_MAX_POINTS) : merged;
}

function currentDocumentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

// Der Akzent steht in einer CSS-Variablen; Leaflet setzt die Strichfarbe aber
// als Attribut und kann kein var() lesen. Also den berechneten Wert holen.
function accentColor() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return value || '#0f9d63';
}

export default function IssTracker() {
  const [position, setPosition] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [error, setError] = useState(null);
  const [follow, setFollow] = useState(false);
  const [showTrail, setShowTrail] = useState(true);
  const [view, setView] = useState('map');
  const [plotPoints, setPlotPoints] = useState([]);
  const [historyState, setHistoryState] = useState('idle');
  const [mapReady, setMapReady] = useState(false);

  const { preference, resolved, select } = useTheme();

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const trailRef = useRef(null);
  const trailPointsRef = useRef([]);
  const tileLayersRef = useRef(null);
  const latestLatLngRef = useRef(null);
  const unwrappedLngRef = useRef(null);
  const followRef = useRef(follow);
  const showTrailRef = useRef(showTrail);
  const centeredRef = useRef(false);
  const historyRequestedRef = useRef(false);

  // Zeichnet eine Position in Karte und Spur ein.
  //
  // `latlng` enthält die fortlaufend gezählte Länge aus dem Polling, nicht den
  // Rohwert der API: an der Datumsgrenze springt die Länge von +180° auf -180°.
  // Leaflet projiziert Vektoren linear und ohne Umschlag, ein Sprung um 360°
  // würde Marker und Spur daher in eine andere Weltkopie und damit aus dem Bild
  // befördern. Mit durchgehender Zählung bleiben Karte, Marker und Spur in
  // derselben Kopie; angezeigt wird weiterhin der Rohwert (z. B. 178° W).
  const applyToMap = useCallback((latlng) => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    latestLatLngRef.current = latlng;
    marker.setLatLng(latlng);

    const points = trailPointsRef.current;
    points.push(latlng);
    if (points.length > TRAIL_MAX_POINTS) {
      points.splice(0, points.length - TRAIL_MAX_POINTS);
    }
    trailRef.current?.setLatLngs(points);

    if (followRef.current) {
      map.setView(latlng, Math.max(map.getZoom(), FOCUS_ZOOM));
    } else if (!centeredRef.current) {
      // Bei der ersten bekannten Position dorthin springen. Der nähere Zoom
      // macht die Bewegung des Markers überhaupt erst sichtbar.
      centeredRef.current = true;
      map.setView(latlng, FOCUS_ZOOM);
    }
  }, []);

  // Karte einmalig aufbauen. Leaflet braucht das DOM, darf also nicht
  // serverseitig gerendert werden – daher der dynamische Import im Effekt.
  useEffect(() => {
    let disposed = false;
    let map = null;

    (async () => {
      const L = (await import('leaflet')).default;
      if (disposed || !mapContainerRef.current) return;

      // Kein worldCopyJump: Leaflet würde die Kartenmitte beim Verschieben
      // zurück in das Intervall [-180°, 180°] holen und damit Marker und Spur
      // aus der fortlaufenden Zählung reißen.
      map = L.map(mapContainerRef.current, {
        minZoom: 1,
        zoomControl: true,
      }).setView([0, 0], WORLD_ZOOM);

      // Beide Kachelebenen einmal anlegen. Welche sichtbar ist, entscheidet der
      // Effekt weiter unten — beim Themenwechsel wird nur getauscht.
      const layers = {
        light: L.tileLayer(TILE_LAYERS.light.url, TILE_LAYERS.light.options),
        dark: L.tileLayer(TILE_LAYERS.dark.url, TILE_LAYERS.dark.options),
      };
      tileLayersRef.current = layers;
      layers[currentDocumentTheme()].addTo(map);

      const icon = L.divIcon({
        className: 'iss-marker',
        html: `<span class="iss-marker__ring"></span><span class="iss-marker__badge">${SATELLITE_ICON}</span>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      markerRef.current = L.marker([0, 0], { icon, keyboard: false }).addTo(map);
      trailRef.current = L.polyline([], {
        color: accentColor(),
        weight: 2,
        opacity: 0.75,
      });
      if (showTrailRef.current) trailRef.current.addTo(map);

      // Ein manuelles Verschieben der Karte schaltet die Verfolgung ab.
      map.on('dragstart', () => setFollow(false));

      mapRef.current = map;
      setMapReady(true);

      // Falls die erste Antwort schon vor dem Kartenaufbau da war.
      if (latestLatLngRef.current) {
        markerRef.current.setLatLng(latestLatLngRef.current);
        trailRef.current.setLatLngs(trailPointsRef.current);
        centeredRef.current = true;
        map.setView(latestLatLngRef.current, FOCUS_ZOOM);
      }
    })();

    return () => {
      disposed = true;
      if (map) map.remove();
      mapRef.current = null;
      markerRef.current = null;
      trailRef.current = null;
      tileLayersRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Kacheln und Strichfarbe an das Farbschema anpassen.
  useEffect(() => {
    const map = mapRef.current;
    const layers = tileLayersRef.current;
    if (!mapReady || !map || !layers || !resolved) return;

    const wanted = resolved === 'dark' ? layers.dark : layers.light;
    const other = resolved === 'dark' ? layers.light : layers.dark;
    if (map.hasLayer(other)) map.removeLayer(other);
    if (!map.hasLayer(wanted)) wanted.addTo(map);

    trailRef.current?.setStyle({ color: accentColor() });
  }, [resolved, mapReady]);

  // Zurück aus der Plot-Ansicht: der Kartencontainer war display:none und hat
  // keine Maße mehr, Leaflet muss neu messen — sonst bleibt die Karte grau.
  useEffect(() => {
    if (view !== 'map' || !mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    const frame = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(frame);
  }, [view, mapReady]);

  // Polling: läuft dauerhaft weiter, auch wenn ein Abruf fehlschlägt.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (inFlight) return;
      inFlight = true;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(API_URL, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Die API antwortete mit HTTP ${response.status}.`);
        }

        const payload = await response.json();
        if (cancelled) return;

        const next = {
          latitude: Number(payload.latitude),
          longitude: Number(payload.longitude),
          altitude: Number(payload.altitude),
          velocity: Number(payload.velocity),
          visibility: payload.visibility,
        };

        if (!Number.isFinite(next.latitude) || !Number.isFinite(next.longitude)) {
          throw new Error('Die Antwort enthielt keine gültigen Koordinaten.');
        }

        // Länge fortlaufend zählen (…, 179, 180, 181, …), siehe applyToMap.
        let longitude = next.longitude;
        const previousLongitude = unwrappedLngRef.current;
        if (previousLongitude !== null) {
          while (longitude - previousLongitude > 180) longitude -= 360;
          while (longitude - previousLongitude < -180) longitude += 360;
        }
        unwrappedLngRef.current = longitude;

        const stamp = Number(payload.timestamp);
        const plotPoint = {
          t: Number.isFinite(stamp) ? stamp * 1000 : Date.now(),
          latitude: next.latitude,
        };

        setPosition(next);
        setUpdatedAt(new Date());
        setError(null);
        setPlotPoints((previous) => mergePoints(previous, [plotPoint]));
        applyToMap([next.latitude, longitude]);
      } catch (err) {
        if (cancelled) return;
        setError(
          err.name === 'AbortError'
            ? `Zeitüberschreitung: Die API hat nicht innerhalb von ${REQUEST_TIMEOUT_MS / 1000} Sekunden geantwortet.`
            : err.message || 'Die ISS-Daten konnten nicht geladen werden.',
        );
      } finally {
        clearTimeout(timeoutId);
        inFlight = false;
      }
    };

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [applyToMap]);

  // "Karte folgt der ISS" sofort anwenden, wenn der Schalter umgelegt wird.
  useEffect(() => {
    followRef.current = follow;
    const map = mapRef.current;
    if (follow && map && latestLatLngRef.current) {
      map.setView(latestLatLngRef.current, FOCUS_ZOOM);
    }
  }, [follow]);

  // Spur ein- und ausblenden.
  useEffect(() => {
    showTrailRef.current = showTrail;
    const map = mapRef.current;
    const trail = trailRef.current;
    if (!map || !trail) return;

    if (showTrail) {
      if (!map.hasLayer(trail)) trail.addTo(map);
    } else if (map.hasLayer(trail)) {
      map.removeLayer(trail);
    }
  }, [showTrail]);

  // Gemerkte Ansicht wiederherstellen.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_KEY);
      if (stored === 'map' || stored === 'plot') setView(stored);
    } catch {
      // Nicht lesbar — dann bleibt es bei der Karte.
    }
  }, []);

  const changeView = useCallback((next) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Nicht speicherbar — die Wahl gilt dann nur für diese Sitzung.
    }
  }, []);

  // Beim Wechsel in die Plot-Ansicht die letzten vier Stunden nachladen, damit
  // die Kurve sofort steht statt stundenlang leer zu bleiben.
  useEffect(() => {
    if (view !== 'plot' || historyRequestedRef.current) return;
    historyRequestedRef.current = true;
    setHistoryState('loading');

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const loadChunk = async (timestamps) => {
      const response = await fetch(
        `${API_URL}/positions?timestamps=${timestamps.join(',')}&units=kilometers`,
        { signal: controller.signal, cache: 'no-store' },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      return (Array.isArray(payload) ? payload : [])
        .map((entry) => ({
          t: Number(entry.timestamp) * 1000,
          latitude: Number(entry.latitude),
        }))
        .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.latitude));
    };

    (async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const slots = [];
        for (let i = HISTORY_SLOTS - 1; i >= 0; i--) slots.push(now - i * HISTORY_STEP_S);

        const chunks = [];
        for (let i = 0; i < slots.length; i += HISTORY_PER_REQUEST) {
          chunks.push(slots.slice(i, i + HISTORY_PER_REQUEST));
        }

        // Beide Hälften parallel. Fällt eine aus, reicht die andere für eine
        // Kurve — deshalb allSettled und nicht all.
        const settled = await Promise.allSettled(chunks.map(loadChunk));
        if (cancelled) return;

        const history = settled
          .filter((result) => result.status === 'fulfilled')
          .flatMap((result) => result.value);

        if (history.length === 0) throw new Error('leere Antwort');

        setPlotPoints((previous) => mergePoints(previous, history));
        setHistoryState('done');
      } catch {
        if (cancelled) return;
        // Beim nächsten Wechsel in den Plot erneut versuchen.
        historyRequestedRef.current = false;
        setHistoryState('error');
      } finally {
        clearTimeout(timeoutId);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [view]);

  const status = error ? 'error' : position ? 'live' : 'connecting';
  const visibility = describeVisibility(position?.visibility);
  const lastSeen = updatedAt
    ? updatedAt.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <h1 className="topbar__title">ISS · LIVE</h1>
          <span className="topbar__sub">NORAD 25544</span>
        </div>

        <div className="topbar__right">
          <SegmentedSwitch
            label="Ansicht"
            options={VIEW_OPTIONS}
            value={view}
            onChange={changeView}
          />
          <SegmentedSwitch
            label="Farbschema"
            options={THEME_OPTIONS}
            value={preference}
            onChange={select}
          />
          <span className={`signal signal--${status}`}>
            <span className="signal__dot" aria-hidden="true" />
            {status === 'live' && 'SIGNAL OK'}
            {status === 'connecting' && 'VERBINDE …'}
            {status === 'error' && 'KEIN SIGNAL'}
            {status === 'live' && (
              <span className="signal__meta">· {POLL_INTERVAL_MS / 1000} s</span>
            )}
          </span>
        </div>
      </header>

      <main className="main">
        <section
          className="stage"
          aria-label={view === 'map' ? 'Weltkarte mit der Position der ISS' : 'Bahnkurve der ISS'}
        >
          <div className={`stage__pane${view === 'map' ? '' : ' stage__pane--hidden'}`}>
            <div ref={mapContainerRef} className="map" />
          </div>
          <div className={`stage__pane${view === 'plot' ? '' : ' stage__pane--hidden'}`}>
            <GroundTrackPlot
              points={plotPoints}
              loading={historyState === 'loading'}
              failed={historyState === 'error'}
            />
          </div>
        </section>

        <aside className="sidebar">
          <div className="stats">
            <Stat label="Breite" value={formatSigned(position?.latitude)} />
            <Stat label="Länge" value={formatSigned(position?.longitude)} />
            <Stat
              label="Höhe"
              value={position ? formatNumber(position.altitude, { maximumFractionDigits: 0 }) : '–'}
              unit="km"
            />
            <Stat
              label="Geschwindigkeit"
              value={position ? formatNumber(position.velocity, { maximumFractionDigits: 0 }) : '–'}
              unit="km/h"
            />
            <Stat label="Tag / Nacht" value={visibility.label} hint={visibility.hint} />
          </div>

          {error && (
            <div className="notice" role="status">
              <strong>KEIN SIGNAL</strong>
              <span>
                {position
                  ? `Keine Verbindung seit ${lastSeen} Uhr. Die letzte bekannte Position wird weiter angezeigt.`
                  : 'Die ISS-Daten sind gerade nicht erreichbar.'}{' '}
                Neuer Versuch läuft automatisch.
              </span>
              <span className="notice__reason">{error}</span>
            </div>
          )}

          {view === 'map' && (
            <div className="controls">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={showTrail}
                  onChange={(event) => setShowTrail(event.target.checked)}
                />
                <span>Spur anzeigen</span>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={follow}
                  onChange={(event) => setFollow(event.target.checked)}
                />
                <span>Karte folgt der ISS</span>
              </label>
            </div>
          )}

          <p className="meta">
            {lastSeen ? `Letzte Aktualisierung: ${lastSeen} Uhr` : 'Noch keine Daten empfangen.'}
            <br />
            Daten: wheretheiss.at · Karten: OpenStreetMap, Esri
          </p>
        </aside>
      </main>
    </div>
  );
}

function Stat({ label, value, unit, hint }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">
        {value}
        {unit && <span className="stat__unit">{unit}</span>}
      </span>
      {hint && <span className="stat__hint">{hint}</span>}
    </div>
  );
}
