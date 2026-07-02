import { useEffect, useState } from 'react';

/**
 * Live local date / time / timezone. Detects the user's timezone automatically
 * (Intl) and ticks every second. V4: the app shows the user's LOCAL time, never
 * UTC. `compact` renders a single inline line for slim bars.
 */
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

  if (compact) {
    return (
      <span
        className="font-mono text-[11px] text-[var(--ink3)]"
        title={`Your local time · ${tz}`}
        aria-label={`Local time ${time}, ${date}, timezone ${tz}`}
      >
        <span className="text-[var(--ink2)]">{time}</span>
        <span className="mx-1.5 opacity-40">·</span>
        {date}
        <span className="mx-1.5 opacity-40">·</span>
        {tz}
      </span>
    );
  }

  return (
    <div
      className="flex items-center justify-center gap-2 py-3 text-center"
      aria-label={`Local time ${time}, ${date}, timezone ${tz}`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
      </svg>
      <span className="font-mono text-[11px] tracking-[0.02em] text-[var(--ink3)]">
        <span className="text-[var(--ink)]">{time}</span>
        <span className="mx-1.5 opacity-40">·</span>
        {date}
        <span className="mx-1.5 opacity-40">·</span>
        {tz}
      </span>
    </div>
  );
}
