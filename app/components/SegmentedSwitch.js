'use client';

import { useRef } from 'react';

// Segmentierter Umschalter mit Radiogruppen-Semantik: ein Klick wählt aus,
// Pfeiltasten wandern weiter. Derselbe Baustein für Farbschema
// (System/Hell/Dunkel) und Ansicht (Karte/Plot).
export default function SegmentedSwitch({ label, options, value, onChange, className = '' }) {
  const refs = useRef({});

  const onKeyDown = (event) => {
    const index = options.findIndex((option) => option.id === value);
    if (index === -1) return;

    let next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % options.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + options.length) % options.length;
    }
    if (next === null) return;

    event.preventDefault();
    const id = options[next].id;
    onChange(id);
    refs.current[id]?.focus();
  };

  return (
    <div
      className={`segmented ${className}`.trim()}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          tabIndex={value === option.id ? 0 : -1}
          className="segmented__option"
          ref={(element) => {
            refs.current[option.id] = element;
          }}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
