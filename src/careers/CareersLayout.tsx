/**
 * Careers shell — the same chrome as the Tools shell (slim glass app bar,
 * gold pill tab bar, ambient backdrop, mobile drawer) applied to the
 * Careers section, so entering /careers feels like the rest of FinatriX.
 */

import { Suspense, lazy } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useMobileDrawer } from '../hooks/useMobileDrawer';
import { AccountMenu } from '../components/AccountMenu';
import { MobileDrawer } from '../components/MobileDrawer';
import { HomeButton } from '../components/HomeButton';
import { BrandLogo } from '../components/BrandLogo';
import { Breadcrumb } from '../components/Breadcrumb';
import { TOOLS } from '../lib/tools';
import { ToastProvider } from '../tools/ui/Toast';
import { IconSprite } from '../tools/ui/Icon';
import { CAREERS_HIDDEN_SECTIONS, CAREERS_NAV, CAREERS_ROUTES } from './constants';
import { NotificationsBell } from './components/NotificationsBell';
import { CareersProvider } from './context/CareersContext';
import { CareersGate } from './components/states';
import { CareersPaywallGate } from './components/CareersPaywallGate';
import { useRole } from './hooks/useRole';
import ThemeToggle from '../components/ThemeToggle';
import { CommandPaletteTrigger } from '../components/CommandPaletteTrigger';
import { useCommandPalette } from '../hooks/useCommandPalette';
import '../tools/tools.css';
import './careers.css';

// Lazy for the same reason the Tools shell loads it lazily: the registry it
// searches is worth nothing until someone opens it.
const CommandPalette = lazy(() => import('../tools/ui/CommandPalette'));

/** Referenced by aria-controls from the app-bar trigger that opens the drawer. */
const DRAWER_ID = 'fx-careers-drawer';

function useActiveCareersTab(): string {
  const { pathname } = useLocation();
  const m = /^\/careers\/?([a-z]*)/i.exec(pathname);
  const seg = m?.[1]?.toLowerCase() || 'dashboard';
  if (CAREERS_NAV.some((n) => n.id === seg)) return seg;
  if (CAREERS_HIDDEN_SECTIONS.some((n) => n.id === seg)) return seg;
  return 'dashboard';
}

function sectionName(id: string): string {
  return (
    CAREERS_NAV.find((n) => n.id === id)?.name ??
    CAREERS_HIDDEN_SECTIONS.find((n) => n.id === id)?.name ??
    'Careers'
  );
}

export default function CareersLayout() {
  const { user, signOut, configured } = useAuth();
  const { isAdmin } = useRole();
  const [drawerOpen, setDrawerOpen] = useMobileDrawer();
  const { open: paletteOpen, openPalette, closePalette } = useCommandPalette();
  const active = useActiveCareersTab();

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
          className="flex items-center justify-between h-12 px-3 sm:px-4 border-b border-hairline-2"
          style={{ position: 'sticky', top: 0, zIndex: 51, background: 'var(--nav-bg)', backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)' }}
        >
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              aria-controls={DRAWER_ID}
              className="md:hidden -ml-1 p-2 text-ink hover:text-accent-text transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <HomeButton compact className="hidden sm:inline-flex" />
            <Link to="/" aria-label="FinatriX home" className="flex items-center gap-2 group">
              <BrandLogo size={22} className="shrink-0" />
              <span className="font-mono text-[12px] uppercase tracking-[0.12em] sm:tracking-[0.16em] text-ink group-hover:text-accent-text transition-colors select-none">
                FinatriX <span className="text-accent-text">Careers</span>
              </span>
            </Link>
          </div>

          <div className="relative flex items-center gap-2.5 sm:gap-4">
            <CommandPaletteTrigger onOpen={openPalette} />
            <ThemeToggle />
            {user && <NotificationsBell />}
            {user ? (
              <AccountMenu
                name={firstName}
                items={[
                  { label: 'Dashboard', to: '/tools/dashboard' },
                  { label: 'Money tools', to: '/tools' },
                  { label: 'Profile & settings', to: '/profile' },
                  { label: 'Home', to: '/' },
                  { label: 'Sign out', onClick: () => void signOut(), danger: true },
                ]}
              />
            ) : (
              <>
                <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">
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

        {/* Careers tab bar.
            Its destinations are its own — Jobs, Applications, Companies — but it
            is drawn with the same pill classes the money tools and the landing
            page use (src/index.css), so the whole site has one navigation
            language and one place to change it. It wraps rather than scrolling
            sideways for the same reason those do. */}
        <div className="nav-wrap">
          <div className="fx-toolbar">
            <nav className="fx-navpills fx-navpills-md" id="mainNav" aria-label="Careers">
              {CAREERS_NAV.map((item) => (
                <Link
                  key={item.id}
                  to={item.href}
                  data-route="careers"
                  className={`fx-navpill${active === item.id ? ' on' : ''}`}
                  aria-current={active === item.id ? 'page' : undefined}
                >
                  <span className="fx-navpill-dot" style={{ backgroundColor: '#D4AF37' }} aria-hidden="true" />
                  {item.name}
                </Link>
              ))}
              {isAdmin && (
                <Link
                  to={CAREERS_ROUTES.admin}
                  data-route="careers"
                  className={`fx-navpill${active === 'admin' ? ' on' : ''}`}
                  aria-current={active === 'admin' ? 'page' : undefined}
                >
                  <span className="fx-navpill-dot" style={{ backgroundColor: '#D4AF37' }} aria-hidden="true" />
                  Admin
                </Link>
              )}
            </nav>
          </div>
        </div>

        {/* Page content */}
        <div className="wrap">
          <div style={{ paddingTop: 14 }}>
            <Breadcrumb current={sectionName(active)} />
          </div>
          <CareersGate>
            <CareersPaywallGate>
              <CareersProvider>
                <Outlet />
              </CareersProvider>
            </CareersPaywallGate>
          </CareersGate>
        </div>

        {/* Mobile navigation drawer (<768px) */}
        <MobileDrawer
          id={DRAWER_ID}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          label="Main"
          footer={
            user ? (
              <button onClick={() => { setDrawerOpen(false); void signOut(); }} className="w-full text-center font-mono text-[12px] uppercase tracking-[0.08em] text-[#E0726B] border border-hairline hover:border-[#E0726B]/50 rounded-full py-2.5 transition-colors">
                Sign out
              </button>
            ) : (
              <Link to="/login" onClick={() => setDrawerOpen(false)} className="block w-full text-center font-mono text-[12px] uppercase tracking-[0.08em] text-[#0A0A0A] bg-[#D4AF37] hover:bg-[#F1C40F] rounded-full py-2.5 transition-colors">
                Sign in
              </Link>
            )
          }
        >
          <button
            type="button"
            onClick={() => { setDrawerOpen(false); openPalette(); }}
            aria-haspopup="dialog"
            className="flex w-full items-center gap-3 px-5 py-3 text-left text-[15px] text-ink hover:bg-hairline-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            Search everything
          </button>
          <Link to="/" onClick={() => setDrawerOpen(false)} className="flex items-center gap-3 px-5 py-3 text-[15px] text-ink hover:bg-hairline-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />
            </svg>
            Home
          </Link>
          <div className="mt-1 mb-1 px-5 text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Careers</div>
          {CAREERS_NAV.map((item) => (
            <Link
              key={item.id}
              to={item.href}
              onClick={() => setDrawerOpen(false)}
              className={`flex items-center gap-3 px-5 py-2.5 text-[15px] hover:bg-hairline-2 ${
                active === item.id ? 'text-accent-text' : 'text-ink'
              }`}
            >
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: '#D4AF37' }} />
              {item.name}
            </Link>
          ))}
          {isAdmin && (
            <Link
              to={CAREERS_ROUTES.admin}
              onClick={() => setDrawerOpen(false)}
              className={`flex items-center gap-3 px-5 py-2.5 text-[15px] hover:bg-hairline-2 ${active === 'admin' ? 'text-accent-text' : 'text-ink'}`}
            >
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: '#D4AF37' }} />
              Admin
            </Link>
          )}
          <div className="mt-1 mb-1 px-5 text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Tools</div>
          {TOOLS.map((t) => (
            <Link
              key={t.id}
              to={t.href}
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-3 px-5 py-2.5 text-[15px] text-ink hover:bg-hairline-2"
            >
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              {t.name}
            </Link>
          ))}
          <div className="my-2 mx-5 border-t border-hairline-2" />
          <Link to="/profile" onClick={() => setDrawerOpen(false)} className="block px-5 py-2.5 text-[15px] text-ink hover:bg-hairline-2">Profile</Link>
        </MobileDrawer>

        {/* Mounted only while open, so its chunk is never fetched by someone
            who never uses it. `surface` decides what the resting list offers
            first — the Careers sections here, the calculators in /tools. */}
        {paletteOpen && (
          <Suspense fallback={null}>
            <CommandPalette onClose={closePalette} surface="careers" />
          </Suspense>
        )}
      </div>
    </ToastProvider>
  );
}
