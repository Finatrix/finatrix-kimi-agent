import { Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { NavPills } from '../components/NavPills';
import { HomeButton } from '../components/HomeButton';
import { BrandLogo } from '../components/BrandLogo';
import ThemeToggle from '../components/ThemeToggle';

// [ Home ] [ FinatriX Logo ] [ FinatriX Wordmark ]
function BrandCluster() {
  return (
    <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
      <HomeButton />
      <Link to="/" className="flex items-center gap-2 group" aria-label="FinatriX home">
        <BrandLogo size={26} className="shrink-0" />
        <span className="font-semibold tracking-[-0.01em] text-[15px] text-ink">
          Finatri<span className="text-accent-text">X</span>
        </span>
      </Link>
    </div>
  );
}

export default function LandingNav() {
  const { user } = useAuth();

  return (
    <header className="fixed top-0 left-0 w-full z-50 border-b border-[color:var(--nav-border)] bg-[var(--nav-bg)] backdrop-blur-[16px]">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        {/* Top row */}
        <div className="flex items-center justify-between h-14">
          <BrandCluster />

          {/* Tool tabs — inline on desktop. The same component the signed-in
              tools shell renders, so the navigation cannot drift between the
              two halves of the site. See components/NavPills.tsx. */}
          <NavPills variant="marketing" hideBelow="lg" />

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <ThemeToggle />
            {user ? (
              <Link
                to="/profile"
                className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2 hover:text-ink transition-colors hidden sm:inline"
              >
                Account
              </Link>
            ) : (
              <Link
                to="/login"
                className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2 hover:text-ink transition-colors hidden sm:inline"
              >
                Sign in
              </Link>
            )}
            <Link
              to="/tools"
              className="fx-btn-gold font-mono text-[11px] uppercase tracking-[0.08em] px-4 py-2 rounded-full whitespace-nowrap"
            >
              Open tools
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
