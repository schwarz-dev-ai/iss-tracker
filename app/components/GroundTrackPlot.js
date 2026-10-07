'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// Rollierendes Zeitfenster der Kurve.
export const PLOT_WINDOW_MS = 4 * 60 * 60 * 1000;
// Feste Breitenachse: so bleibt die Amplitude zwischen Aufrufen vergleichbar.
const LAT_MIN = -90;
const LAT_MAX = 90;
// Kantenlänge einer Gitterzelle in Pixeln — kariertes Papier wie im Vorbild.
const GRID_PX = 48;
// Radius des Rings bzw. halbe Länge der Fadenkreuzarme um die aktuelle Position.
const CURSOR_RING = 15;
const CURSOR_ARM = 42;
// Das Fenster endet etwas nach dem neuesten Punkt. Sonst läge das Fadenkreuz
// genau auf dem rechten Rand und würde zur Hälfte abgeschnitten.
const CURSOR_INSET = 0.07;

// Gezeichnet wird die geografische Breite über der Zeit, als SVG von Hand.
// Kein Leaflet: der Plot ist kein Geodatensatz, und weil auf der x-Achse die
// Zeit steht, geht die Länge gar nicht ein — die Datumsgrenze kann die Kurve
// also nicht zerreißen.
export default function GroundTrackPlot({ points, loading, failed }) {
  const wrapRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Die echte Größe messen, statt den viewBox zu strecken: Streckung würde die
  // Strichstärke in der einen Richtung verzerren.
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const { width, height } = size;
    if (width < 20 || height < 20) return { ready: false, width, height };

    // Gitter über die ganze Fläche.
    let grid = '';
    for (let x = 0; x <= width; x += GRID_PX) grid += `M${x} 0V${height}`;
    for (let y = 0; y <= height; y += GRID_PX) grid += `M0 ${y}H${width}`;

    const lastT = points.length > 0 ? points[points.length - 1].t : Date.now();
    const firstT = lastT - PLOT_WINDOW_MS * (1 - CURSOR_INSET);

    const toX = (t) => ((t - firstT) / PLOT_WINDOW_MS) * width;
    const toY = (latitude) => ((LAT_MAX - latitude) / (LAT_MAX - LAT_MIN)) * height;

    const visible = points.filter((point) => point.t >= firstT);
    const curve = visible
      .map((point, i) => `${i === 0 ? 'M' : 'L'}${toX(point.t).toFixed(1)} ${toY(point.latitude).toFixed(1)}`)
      .join(' ');

    const last = visible[visible.length - 1];
    const cursor = last ? { x: toX(last.t), y: toY(last.latitude) } : null;

    return {
      ready: curve.length > 0,
      width,
      height,
      grid,
      curve,
      cursor,
      hasCurve: visible.length > 1,
    };
  }, [points, size]);

  return (
    <div className="plot" ref={wrapRef}>
      {geometry.ready && (
        <svg
          className="plot__svg"
          width={geometry.width}
          height={geometry.height}
          role="img"
          aria-label="Bahnkurve der ISS: geografische Breite über die letzten vier Stunden"
        >
          <path className="plot__grid" d={geometry.grid} />
          <path className="plot__curve" d={geometry.curve} fill="none" />
          {geometry.cursor && (
            <g className="plot__cursor">
              <path
                className="plot__cursor-cross"
                d={`M${geometry.cursor.x - CURSOR_ARM} ${geometry.cursor.y}H${geometry.cursor.x + CURSOR_ARM}M${geometry.cursor.x} ${geometry.cursor.y - CURSOR_ARM}V${geometry.cursor.y + CURSOR_ARM}`}
              />
              <circle
                className="plot__cursor-ring"
                cx={geometry.cursor.x}
                cy={geometry.cursor.y}
                r={CURSOR_RING}
              />
              <circle
                className="plot__cursor-dot"
                cx={geometry.cursor.x}
                cy={geometry.cursor.y}
                r={5}
              />
            </g>
          )}
        </svg>
      )}

      {!geometry.hasCurve && (
        <p className="plot__hint">
          {loading ? 'Verlauf wird geladen …' : 'Noch zu wenig Daten für eine Kurve.'}
        </p>
      )}

      {failed && geometry.hasCurve && (
        <p className="plot__note">Der Verlauf konnte nicht nachgeladen werden.</p>
      )}
    </div>
  );
}
