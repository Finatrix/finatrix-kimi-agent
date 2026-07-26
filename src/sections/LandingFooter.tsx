import { Link } from 'react-router';
import { LocalClock } from '../tools/ui/LocalClock';
import { SUPPORT_MAILTO } from '../shared/brand';

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
          <a href={SUPPORT_MAILTO} className="hover:text-accent-text transition-colors">Contact</a>
          {/* TODO(brand): add official social links here once a profile exists.
              This slot held a link to https://twitter.com/finatrix_, which is not
              a registered handle (HTTP 404) — the site's only outbound social
              link sent visitors to an X error page, which reads as an abandoned
              brand on the one surface meant to prove the opposite. An absent
              link is strictly better than a broken one; add nothing here that
              has not been opened and confirmed. */}
        </nav>

        <LocalClock compact />
      </div>
    </footer>
  );
}
