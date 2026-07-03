/**
 * Careers shell — the same chrome as the Tools shell (slim glass app bar,
 * gold pill tab bar, ambient backdrop, mobile drawer) applied to the
 * Careers section, so entering /careers feels like the rest of FinatriX.
 */

import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { HomeButton } from '../components/HomeButton';
import { BrandLogo } from '../components/BrandLogo';
import { Breadcrumb } from '../components/Breadcrumb';
import { TOOLS } from '../lib/tools';
import { ToastProvider } from '../tools/ui/Toast';
import { IconSprite } from '../tools/ui/Icon';
import { CAREERS_NAV } from './constants';
import { CareersProvider } from './context/CareersContext';
import { CareersGate } from './components/states';
import '../tools/tools.css';
import './careers.css';

function useActiveCareersTab(): string {
  const { pathname } = useLocation();
  const m = /^\/careers\/?([a-z]*)/i.exec(pathname);
  const seg = m?.[1]?.toLowerCase() || 'dashboard';
  return CAREERS_NAV.some((n) => n.id === seg) ? seg : 'dashboard';
}

export default function CareersLayout() {
  const { user, signOut, configured } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const active = useActiveCareersTab();

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const firstName =
    (user?.user_metadata?.full_name as string)?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'Account';

  return (
    <ToastProvider>
      <div className="fx-tools" style={{ minHeight: '100dvh' }}>
        <div className="fx-amb" aria-hidden="true">
          <div className="fx-amb-glow" />
          <div className="fx-amb-grid" />
          <div className="fx-amb-vig" />
        </div>
        <IconSprite />

        {/* Slim app bar */}
        <header
          className="flex items-center justify-between h-12 px-3 sm:px-4 border-b border-white/[0.06]"
          style={{ position: 'sticky', top: 0, zIndex: 51, background: 'rgba(6,6,7,0.72)', backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)' }}
        >
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="md:hidden -ml-1 p-2 text-[#F5F5F0] hover:text-[#D4AF37] transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <HomeButton compact className="hidden sm:inline-flex" />
            <Link to="/" aria-label="FinatriX home" className="flex items-center gap-2 group">
              <BrandLogo size={22} className="shrink-0" />
              <span className="font-mono text-[12px] uppercase tracking-[0.12em] sm:tracking-[0.16em] text-[#F5F5F0] group-hover:text-[#D4AF37] transition-colors select-none">
                FinatriX <span className="text-[#D4AF37]">Careers</span>
              </span>
            </Link>
          </div>

          <div className="relative flex items-center gap-2.5 sm:gap-4">
            {user ? (
              <>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="hidden md:inline font-mono text-[11px] uppercase tracking-[0.08em] text-[#F5F5F0] hover:text-[#D4AF37] transition-colors"
                >
                  {firstName} ▾
                </button>
                {menuOpen && (
                  <div
                    className="absolute right-0 top-[calc(100%+8px)] min-w-[180px] bg-[#111111] border border-white/[0.08] rounded-lg py-1 flex flex-col z-30 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    <Link to="/profile" onClick={() => setMenuOpen(false)} className="px-4 py-2.5 text-[13px] text-[#F5F5F0] hover:bg-white/[0.05]">
                      Profile &amp; settings
                    </Link>
                    <Link to="/tools" onClick={() => setMenuOpen(false)} className="px-4 py-2.5 text-[13px] text-[#F5F5F0] hover:bg-white/[0.05]">
                      Open tools
                    </Link>
                    <button onClick={() => { setMenuOpen(false); void signOut(); }} className="px-4 py-2.5 text-[13px] text-left text-[#E0726B] hover:bg-white/[0.05]">
                      Sign out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-[0.06em] text-[#8A8A8A]">
                  {configured ? 'Not signed in' : 'Local only'}
                </span>
                <Link
                  to="/login"
                  className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.08em] text-[#0A0A0A] bg-[#D4AF37] hover:bg-[#F1C40F] px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </header>

        {/* Careers tab bar */}
        <div className="nav-wrap">
          <nav className="nav" id="mainNav" aria-label="Careers" style={{ padding: '10px 16px' }}>
            {CAREERS_NAV.map((item) => (
              <Link
                key={item.id}
                to={item.href}
                data-route="careers"
                className={active === item.id ? 'on' : undefined}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        {/* Page content */}
        <div className="wrap">
          <div style={{ paddingTop: 14 }}>
            <Breadcrumb current={CAREERS_NAV.find((n) => n.id === active)?.name ?? 'Careers'} />
          </div>
          <CareersGate>
            <CareersProvider>
              <Outlet />
            </CareersProvider>
          </CareersGate>
        </div>

        {/* Mobile navigation drawer (<768px) */}
        <div
          className={`md:hidden fixed inset-0 z-40 transition-opacity duration-300 ${
            drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <nav
            aria-label="Main"
            className={`absolute top-0 left-0 h-full w-[82%] max-w-[320px] bg-[#0E0E0E] border-r border-white/[0.07] flex flex-col transition-transform duration-300 ease-out ${
              drawerOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between h-12 px-4 border-b border-white/[0.06] shrink-0">
              <span className="font-mono text-[12px] uppercase tracking-[0.16em] text-[#F5F5F0]">FinatriX</span>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="p-2 -mr-2 text-[#8A8A8A] hover:text-[#F5F5F0]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <Link to="/" onClick={() => setDrawerOpen(false)} className="flex items-center gap-3 px-5 py-3 text-[15px] text-[#F5F5F0] hover:bg-white/[0.04]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />
                </svg>
                Home
              </Link>
              <div className="mt-1 mb-1 px-5 text-[10px] uppercase tracking-[0.12em] text-[#5A5A5A] font-mono">Careers</div>
              {CAREERS_NAV.map((item) => (
                <Link
                  key={item.id}
                  to={item.href}
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center gap-3 px-5 py-2.5 text-[15px] hover:bg-white/[0.04] ${
                    active === item.id ? 'text-[#D4AF37]' : 'text-[#E8E8E3]'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: '#D4AF37' }} />
                  {item.name}
                </Link>
              ))}
              <div className="mt-1 mb-1 px-5 text-[10px] uppercase tracking-[0.12em] text-[#5A5A5A] font-mono">Tools</div>
              {TOOLS.map((t) => (
                <Link
                  key={t.id}
                  to={t.href}
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-3 px-5 py-2.5 text-[15px] text-[#E8E8E3] hover:bg-white/[0.04]"
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  {t.name}
                </Link>
              ))}
              <div className="my-2 mx-5 border-t border-white/[0.06]" />
              <Link to="/profile" onClick={() => setDrawerOpen(false)} className="block px-5 py-2.5 text-[15px] text-[#E8E8E3] hover:bg-white/[0.04]">Profile</Link>
            </div>
            <div className="border-t border-white/[0.06] p-4 shrink-0">
              {user ? (
                <button onClick={() => { setDrawerOpen(false); void signOut(); }} className="w-full text-center font-mono text-[12px] uppercase tracking-[0.08em] text-[#E0726B] border border-white/[0.1] hover:border-[#E0726B]/50 rounded-full py-2.5 transition-colors">
                  Sign out
                </button>
              ) : (
                <Link to="/login" onClick={() => setDrawerOpen(false)} className="block w-full text-center font-mono text-[12px] uppercase tracking-[0.08em] text-[#0A0A0A] bg-[#D4AF37] hover:bg-[#F1C40F] rounded-full py-2.5 transition-colors">
                  Sign in
                </Link>
              )}
            </div>
          </nav>
        </div>
      </div>
    </ToastProvider>
  );
}
