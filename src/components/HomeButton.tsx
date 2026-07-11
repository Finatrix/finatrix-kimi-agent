import { Link } from 'react-router';

/**
 * Premium Home button — glass surface, gold outline, gold hover. Shared across
 * the whole site (landing nav, tools shell, auth + legal pages) so Home is
 * always one tap away in the same design language.
 */
export function HomeButton({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return (
    <Link
      to="/"
      aria-label="Home"
      className={`group inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/40 bg-[var(--tile-bg)] px-3 py-1.5 backdrop-blur-sm transition-all duration-200 hover:border-[#D4AF37] hover:bg-[#D4AF37]/[0.1] hover:shadow-[0_4px_18px_-4px_rgba(212,175,55,0.5)] ${className}`}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#D4AF37"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="transition-transform duration-200 group-hover:-translate-y-[1px]"
      >
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
      {!compact && (
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink">Home</span>
      )}
    </Link>
  );
}
