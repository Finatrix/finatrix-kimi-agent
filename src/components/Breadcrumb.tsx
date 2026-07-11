import { Link } from 'react-router';

/** Home › FinatriX › Current Page — present on every page for orientation. */
export function Breadcrumb({ current, className = '' }: { current: string; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-2 ${className}`}>
      <Link to="/" className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3 hover:text-accent-text transition-colors">
        Home
      </Link>
      <span className="text-ink-3" aria-hidden="true">›</span>
      <Link to="/" className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3 hover:text-accent-text transition-colors">
        FinatriX
      </Link>
      <span className="text-ink-3" aria-hidden="true">›</span>
      <span className="text-[12px] text-ink" aria-current="page">{current}</span>
    </nav>
  );
}
