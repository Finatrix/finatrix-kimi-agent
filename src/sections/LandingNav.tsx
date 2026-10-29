import { Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { NavPills } from '../components/NavPills';
import { Wordmark } from '../components/Wordmark';
import AppearanceMenu from '../components/AppearanceMenu';

/**
 * The website header. The wordmark is the home link — the separate Home pill
 * that sat beside it on this very page linked to where you already were.
 * Actions are sentence case in the body font, like every other button; mono
 * capitals are kept for eyebrows only.
 */
export default function LandingNav() {
  const { user } = useAuth();

  return (
    <header className="fixed top-[var(--fx-safe-top)] left-0 w-full z-50 border-b border-[color:var(--nav-border)] bg-[var(--nav-bg)] backdrop-blur-[16px]">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 gap-3">
          <Link to="/" className="fx-nav-brand shrink-0" aria-label="FinatriX home">
            <Wordmark logo={26} />
          </Link>

          {/* Tool tabs — inline on desktop. The same component the signed-in
              tools shell renders, so the navigation cannot drift between the
              two halves of the site. See components/NavPills.tsx. */}
          <NavPills variant="marketing" hideBelow="lg" />

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <AppearanceMenu />
            <Link to={user ? '/profile' : '/login'} className="fx-nav-text-link hidden sm:inline-flex">
              {user ? 'Account' : 'Sign in'}
            </Link>
            <Link to="/tools" className="fx-nav-cta">
              Open tools
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
