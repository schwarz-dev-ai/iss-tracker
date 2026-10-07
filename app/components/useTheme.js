'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'iss-tracker-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export const THEME_OPTIONS = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Hell' },
  { id: 'dark', label: 'Dunkel' },
];

// Gemerkte Wahl lesen. Ein fehlender Eintrag bedeutet "System" — so ist der
// Erstbesuch automatisch systemgesteuert, ohne etwas schreiben zu müssen.
function readPreference() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Kein Zugriff auf localStorage (z. B. Privatmodus) — dann eben "System".
  }
  return 'system';
}

function systemTheme() {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export default function useTheme() {
  // Absichtlich null und nicht 'system': Der Effekt unten würde sonst direkt
  // nach dem ersten Paint das Theme des Systems über das schreiben, was das
  // Inline-Skript in layout.js bereits korrekt gesetzt hat — bei gemerktem
  // "Hell" auf einem dunklen System gäbe das ein sichtbares Aufblitzen.
  const [preference, setPreference] = useState(null);
  const [resolved, setResolved] = useState(null);

  useEffect(() => {
    setPreference(readPreference());
  }, []);

  useEffect(() => {
    if (preference === null) return;

    const next = preference === 'system' ? systemTheme() : preference;
    document.documentElement.dataset.theme = next;
    setResolved(next);

    // Im Zustand "System" einen Systemwechsel live übernehmen.
    if (preference !== 'system') return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event) => {
      const theme = event.matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = theme;
      setResolved(theme);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [preference]);

  const select = useCallback((next) => {
    setPreference(next);
    try {
      if (next === 'system') window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Nicht speicherbar — die Wahl gilt dann nur für diese Sitzung.
    }
  }, []);

  return { preference, resolved, select };
}
