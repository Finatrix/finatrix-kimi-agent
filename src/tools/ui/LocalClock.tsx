import { useEffect, useState } from 'react';

/**
 * Live local date / time / timezone. Detects the user's timezone automatically
 * (Intl) and ticks every second. The app shows the user's LOCAL time, never UTC,
 * consistently on every surface (landing footer and every tool page).
 *
 * Colours are driven by the tools design tokens (`--ink*`) but every reference
 * carries an explicit fallback, so this component renders correctly OUTSIDE the
 * `.fx-tools` scope too (e.g. the marketing footer) without leaking styles.
 *
 * `compact` renders a single inline line for slim bars.
 */
const INK = 'var(--ink, #F5F5F0)';
const INK2 = 'var(--ink-2, #9c9c96)';
const INK3 = 'var(--ink-3, #8b8b90)';

export function LocalClock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const tz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
    } catch {
      return 'Local';
    }
  })();
  const date = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const label = `Local time ${time}, ${date}, timezone ${tz}`;

  if (compact) {
    return (
      <span
        className="font-mono text-[11px]"
        style={{ color: INK3 }}
        title={`Your local time · ${tz}`}
        aria-label={label}
      >
        <span style={{ color: INK2 }}>{time}</span>
        <span className="mx-1.5 opacity-40">·</span>
        {date}
        <span className="mx-1.5 opacity-40">·</span>
        {tz}
      </span>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 py-3 text-center" aria-label={label}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ stroke: INK3 }} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
      </svg>
      <span className="font-mono text-[11px] tracking-[0.02em]" style={{ color: INK3 }}>
        <span style={{ color: INK }}>{time}</span>
        <span className="mx-1.5 opacity-40">·</span>
        {date}
        <span className="mx-1.5 opacity-40">·</span>
        {tz}
      </span>
    </div>
  );
}
