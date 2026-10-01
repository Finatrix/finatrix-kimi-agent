import { Link } from 'react-router';

/**
 * Home › optional section › current page, matching the actual route hierarchy.
 *
 * Website chrome only (`data-web-only`, hidden under `html.fx-native`): the apps
 * have no "Home" page to lead back to — `/` opens the dashboard — and they walk
 * back with Android's BACK and the iOS edge swipe instead. Marked here rather
 * than at each call site so a new page cannot forget it.
 */
export function Breadcrumb({ current, parent, className = '' }: {
  current: string;
  parent?: { label: string; to: string };
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" data-web-only className={`flex items-center gap-2 ${className}`}>
      <Link to="/" className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3 hover:text-accent-text transition-colors">
        Home
      </Link>
      <span className="text-ink-3" aria-hidden="true">›</span>
      {parent && (
        <>
          <Link to={parent.to} className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3 hover:text-accent-text transition-colors">
            {parent.label}
          </Link>
          <span className="text-ink-3" aria-hidden="true">›</span>
        </>
      )}
      <span className="text-[12px] text-ink" aria-current="page">{current}</span>
    </nav>
  );
}
