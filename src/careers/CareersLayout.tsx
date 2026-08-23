/**
 * Careers shell — the same chrome as the Tools shell (slim glass app bar,
 * gold pill tab bar, ambient backdrop, mobile drawer) applied to the
 * Careers section, so entering /careers feels like the rest of FinatriX.
 */

import { Suspense, lazy, useEffect, useId, useRef, useState } from 'react';
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
import {
  CAREERS_ALL_SECTIONS,
  CAREERS_NAV,
  CAREERS_ROUTES,
  CAREERS_SECONDARY_SECTIONS,
  CAREERS_SECTION_GROUPS,
} from './constants';
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
  if (CAREERS_ALL_SECTIONS.some((n) => n.id === seg)) return seg;
  return 'dashboard';
}

function sectionName(id: string): string {
  return CAREERS_ALL_SECTIONS.find((n) => n.id === id)?.name ?? 'Careers';
}

/** True when the active section lives under "More" rather than a primary tab. */
function isSecondary(id: string): boolean {
  return CAREERS_SECONDARY_SECTIONS.some((n) => n.id === id);
}

/**
 * The "More" menu in the Careers tab bar.
 *
 * Exists because the fourteen non-primary sections previously had no entry
 * point in the shell at all — they were reachable by typing the URL, or via a
 * list buried in Settings. Paid features (Offers, Network, Recruiters) and
 * Billing itself were among them.
 *
 * A disclosure button rather than a hover menu: hover has no touch equivalent,
 * and this is the one control that has to work on a phone as well as a laptop.
 */
function MoreSectionsMenu({ active }: { active: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const activeIsHere = isSecondary(active);

  // Close on outside click and on Escape — both expected of a disclosure.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        data-route="careers"
        className={activeIsHere ? 'on' : undefined}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        More
        <span aria-hidden="true" style={{ marginLeft: 6, fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <div
          id={id}
          className="fx-careers-more"
          role="group"
          aria-label="More Careers sections"
        >
          {CAREERS_SECTION_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="fx-careers-more-label">{group.label}</div>
              {group.items.map((item) => (
                <Link
                  key={item.id}
                  to={item.href}
                  onClick={() => setOpen(false)}
                  className={active === item.id ? 'is-active' : undefined}
                  aria-current={active === item.id ? 'page' : undefined}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Mobile bottom navigation for Careers (<768px).
 *
 * The Careers shell had none. `.fx-tools #mainNav` is `display: none` below
 * 768px, and only the Tools shell replaced it with a thumb-reachable bar — so
 * on a phone the paid product's entire navigation was one hamburger, while the
 * free calculators kept a persistent bottom bar. Same pattern, same five slots.
 */
const CAREERS_BOTTOM_NAV = ['dashboard', 'jobs', 'applications'] as const;

function CareersMobileTabBar({
  active, onMore, drawerOpen, drawerId,
}: { active: string; onMore: () => void; drawerOpen: boolean; drawerId: string }) {
  const items = CAREERS_BOTTOM_NAV.map((id) => CAREERS_NAV.find((n) => n.id === id)!);
  const moreActive = !items.some((i) => i.id === active);
  return (
    <nav className="fx-mobnav md:hidden" aria-label="Careers quick navigation">
      {items.map((item) => {
        const on = active === item.id;
        return (
          <Link
            key={item.id}
            to={item.href}
            className={`fx-mobnav-item${on ? ' on' : ''}`}
            aria-current={on ? 'page' : undefined}
          >
            <span className="fx-mobnav-dot" aria-hidden="true" />
            <span>{item.name}</span>
          </Link>
        );
      })}
      <Link
        to={CAREERS_ROUTES.coach}
        className={`fx-mobnav-item${active === 'coach' ? ' on' : ''}`}
        aria-current={active === 'coach' ? 'page' : undefined}
      >
        <span className="fx-mobnav-dot" aria-hidden="true" />
        <span>Coach</span>
      </Link>
      <button
        type="button"
        onClick={onMore}
        className={`fx-mobnav-item${moreActive && active !== 'coach' ? ' on' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        aria-controls={drawerId}
        aria-label="More Careers sections and menu"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
        <span>More</span>
      </button>
    </nav>
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

        {/* Careers tab bar */}
        <div className="nav-wrap">
          <nav className="nav" id="mainNav" aria-label="Careers" style={{ padding: '10px 16px' }}>
            {CAREERS_NAV.map((item) => (
              <Link
                key={item.id}
                to={item.href}
                data-route="careers"
                className={active === item.id ? 'on' : undefined}
                // Was conveyed by the gold pill alone. Colour is not an
                // accessible name: without this a screen-reader user cannot
                // tell which section they are in.
                aria-current={active === item.id ? 'page' : undefined}
              >
                {item.name}
              </Link>
            ))}
            <MoreSectionsMenu active={active} />
            {isAdmin && (
              <Link
                to={CAREERS_ROUTES.admin}
                data-route="careers"
                className={active === 'admin' ? 'on' : undefined}
                aria-current={active === 'admin' ? 'page' : undefined}
              >
                Admin
              </Link>
            )}
          </nav>
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

        {/* Mobile bottom navigation (<768px) — the Careers shell had none. */}
        <CareersMobileTabBar
          active={active}
          onMore={() => setDrawerOpen(true)}
          drawerOpen={drawerOpen}
          drawerId={DRAWER_ID}
        />

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
              aria-current={active === item.id ? 'page' : undefined}
              className={`flex items-center gap-3 px-5 py-2.5 text-[15px] hover:bg-hairline-2 ${
                active === item.id ? 'text-accent-text' : 'text-ink'
              }`}
            >
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: '#D4AF37' }} />
              {item.name}
            </Link>
          ))}
          {/* The secondary sections. Their absence here is what made Offers,
              Network, Recruiters and Billing unreachable on a phone — while the
              eight free money tools below were all listed. */}
          {CAREERS_SECTION_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mt-1 mb-1 px-5 text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">
                {group.label}
              </div>
              {group.items.map((item) => (
                <Link
                  key={item.id}
                  to={item.href}
                  onClick={() => setDrawerOpen(false)}
                  aria-current={active === item.id ? 'page' : undefined}
                  className={`flex items-center gap-3 px-5 py-2.5 text-[15px] hover:bg-hairline-2 ${
                    active === item.id ? 'text-accent-text' : 'text-ink'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--hairline)' }} />
                  {item.name}
                </Link>
              ))}
            </div>
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
