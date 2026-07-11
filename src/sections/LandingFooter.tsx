import { Link } from 'react-router';
import { LocalClock } from '../tools/ui/LocalClock';

export default function LandingFooter() {
  return (
    <footer className="relative z-10 border-t border-hairline bg-surface-footer">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="7" y="7" width="10" height="10" rx="2.5" fill="#D4AF37" />
            <circle cx="12" cy="12" r="2.1" fill="var(--surface-footer)" />
          </svg>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            © 2026 FinatriX
          </span>
        </div>

        <nav className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
          <Link to="/privacy" className="hover:text-accent-text transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-accent-text transition-colors">Terms</Link>
          <a href="mailto:finatrix.hub@gmail.com" className="hover:text-accent-text transition-colors">Contact</a>
          <a
            href="https://twitter.com/finatrix_"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent-text transition-colors"
          >
            @finatrix_
          </a>
        </nav>

        <LocalClock compact />
      </div>
    </footer>
  );
}
