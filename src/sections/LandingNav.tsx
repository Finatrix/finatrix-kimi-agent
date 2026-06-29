import { Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { TOOLS } from '../lib/tools';

function BrandMark() {
  return (
    <Link to="/" className="flex items-center gap-2.5 shrink-0 group" aria-label="FinatriX home">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
        <rect x="7" y="7" width="10" height="10" rx="2.5" fill="#D4AF37" />
        <circle cx="12" cy="12" r="2.1" fill="#0A0A0A" />
        <path d="M12 7V2M12 22v-5M7 12H2M22 12h-5" stroke="#D4AF37" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="font-semibold tracking-[-0.01em] text-[15px] text-[#F5F5F0]">
        Finatri<span className="text-[#D4AF37]">X</span>
      </span>
    </Link>
  );
}

export default function LandingNav() {
  const { user } = useAuth();

  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-[#0A0A0A]/70 backdrop-blur-[14px] border-b border-white/[0.06]">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        {/* Top row */}
        <div className="flex items-center justify-between h-14">
          <BrandMark />

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
              className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#0A0A0A] bg-[#D4AF37] hover:bg-[#F1C40F] px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap"
            >
              Open tools
            </Link>
          </div>
        </div>

        {/* Tool tabs — scrollable strip on small screens */}
        <nav
          className="lg:hidden flex items-center gap-1 overflow-x-auto pb-2.5 -mt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Tools"
        >
          {TOOLS.map((t) => (
            <Link
              key={t.id}
              to={t.href}
              className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full text-[13px] text-[#B8B8B2] bg-white/[0.04] hover:text-white active:scale-[0.97] transition"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
              {t.short}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
