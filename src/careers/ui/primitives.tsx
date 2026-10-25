/**
 * Careers workspace primitives. Every area is built from these, so a page
 * has one header, one way to show sub-views, one card, one empty state and
 * one way to show a match — see cx.css for the visual rules.
 */
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';

/* ───────────────────────── page header ───────────────────────── */

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="cx-head">
      <div className="cx-head-text">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="cx-head-actions">{actions}</div>}
    </header>
  );
}

/* ───────────────────────── tabs ───────────────────────── */

export interface TabItem<K extends string> {
  key: K;
  label: string;
  count?: number;
}

/**
 * WAI-ARIA tabs: arrow keys move between tabs (automatic activation), Home and
 * End jump to the ends, and only the selected tab is in the Tab order.
 */
export function Tabs<K extends string>({
  items,
  active,
  onChange,
  label,
  idBase,
}: {
  items: readonly TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  label: string;
  idBase?: string;
}) {
  const auto = useId();
  const base = idBase ?? auto;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.key === active);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next]!.key);
    refs.current[next]?.focus();
  };
  return (
    <div className="cx-tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {items.map((t, i) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.key}`}
            aria-selected={selected}
            aria-controls={`${base}-panel`}
            tabIndex={selected ? 0 : -1}
            className="cx-tab"
            onClick={() => onChange(t.key)}
          >
            {t.label}
            {typeof t.count === 'number' && <span className="cx-tab-count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** The region a Tabs list controls. */
export function TabPanel({ idBase, active, children }: { idBase: string; active: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-tab-${active}`} tabIndex={-1}>
      {children}
    </div>
  );
}

/* ───────────────────────── panel ───────────────────────── */

export function Panel({
  title,
  action,
  children,
  className,
  labelledBy,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  const id = useId();
  return (
    <section className={`cx-panel${className ? ` ${className}` : ''}`} aria-labelledby={title ? id : labelledBy}>
      {(title || action) && (
        <div className="cx-panel-head">
          {title && <h2 id={id}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/* ───────────────────────── stat tiles ───────────────────────── */

export interface Tile {
  label: string;
  value: ReactNode;
  note?: string;
  to?: string;
}

export function Tiles({ items, label }: { items: readonly Tile[]; label: string }) {
  return (
    <ul className="cx-tiles" aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((t) => {
        const body = (
          <>
            <span className="cx-tile-value">{t.value}</span>
            <span className="cx-tile-label">{t.label}</span>
            {t.note && <span className="cx-tile-note">{t.note}</span>}
          </>
        );
        return (
          <li key={t.label} style={{ display: 'contents' }}>
            {t.to ? <Link className="cx-tile" to={t.to}>{body}</Link> : <div className="cx-tile">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────────────────── empty state ───────────────────────── */

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="cx-empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/* ───────────────────────── skeleton ───────────────────────── */

export function Skeleton({ lines = 3, label = 'Loading' }: { lines?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} style={{ display: 'grid', gap: 12 }}>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="cx-skel" style={{ height: i === 0 ? 22 : 14, width: i === 0 ? '45%' : `${92 - i * 11}%` }} />
      ))}
    </div>
  );
}

/* ───────────────────────── fit meter ───────────────────────── */

/**
 * A match score as ten ticks plus the exact number. Purely a view of a score
 * computed elsewhere (quickMatch / the match engine) — it never rounds the
 * value it is given except to choose how many ticks to fill.
 */
export function FitMeter({ score, label = 'Match' }: { score: number | null | undefined; label?: string }) {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return <span className="cx-fit-none">No match yet</span>;
  }
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const filled = Math.round(pct / 10);
  return (
    <span className="cx-fit" role="img" aria-label={`${label} ${pct}%`}>
      <span className="cx-fit-ticks" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < filled ? 'on' : undefined} />)}
      </span>
      <span className="cx-fit-value" aria-hidden="true">{pct}%</span>
    </span>
  );
}
