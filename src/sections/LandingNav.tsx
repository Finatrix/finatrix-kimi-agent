import { Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { TOOLS } from '../lib/tools';
import { HomeButton } from '../components/HomeButton';
import { BrandLogo } from '../components/BrandLogo';

// [ Home ] [ FinatriX Logo ] [ FinatriX Wordmark ]
function BrandCluster() {
  return (
    <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
      <HomeButton />
      <Link to="/" className="flex items-center gap-2 group" aria-label="FinatriX home">
        <BrandLogo size={26} className="shrink-0" />
        <span className="font-semibold tracking-[-0.01em] text-[15px] text-[#F5F5F0]">
          Finatri<span className="text-[#D4AF37]">X</span>
        </span>
      </Link>
    </div>
  );
}

export default function LandingNav() {
  const { user } = useAuth();

  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-[#060607]/70 backdrop-blur-[16px] border-b border-white/[0.06]">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        {/* Top row */}
        <div className="flex items-center justify-between h-14">
          <BrandCluster />

          {/* Tool tabs — inline on desktop */}
          <nav className="hidden lg:flex items-center gap-1" aria-label="Tools">
            {TOOLS.map((t) => (
              <Link
                key={t.id}
                to={t.href}
                className="group flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] text-[#B8B8B2] hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full opacity-80 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: t.color }}
                />
                {t.short}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user ? (
              <Link
                to="/profile"
                className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#B8B8B2] hover:text-white transition-colors hidden sm:inline"
              >
                Account
              </Link>
            ) : (
              <Link
                to="/login"
                className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#B8B8B2] hover:text-white transition-colors hidden sm:inline"
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
