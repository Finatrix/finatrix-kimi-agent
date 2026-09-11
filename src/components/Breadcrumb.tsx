import { Link } from 'react-router';

/** Home › optional section › current page, matching the actual route hierarchy. */
export function Breadcrumb({ current, parent, className = '' }: {
  current: string;
  parent?: { label: string; to: string };
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-2 ${className}`}>
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
