/**
 * Careers shell — the workspace frame.
 *
 * Desktop: a left rail with the six areas, Settings and the way back to the
 * money tools. Phones and tablets: a slim top bar and a five-item bottom bar,
 * whose "More" sheet holds the rest. Every area renders its own PageHeader;
 * the shell owns only place, identity and the global affordances (search,
 * theme, notifications, account).
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { AccountMenu } from '../components/AccountMenu';
import { BrandLogo } from '../components/BrandLogo';
import { isNativeApp } from '../native/platform';
import { ToastProvider } from '../tools/ui/Toast';
import { IconSprite } from '../tools/ui/Icon';
import { CAREERS_NAV, CAREERS_ROUTES, careersAreaFor, type CareersAreaId } from './constants';
import { NotificationsBell } from './components/NotificationsBell';
import { CareersProvider } from './context/CareersContext';
import { CareersGate } from './components/states';
import { CareersPaywallGate } from './components/CareersPaywallGate';
import { AiConsentPrompt } from './components/AiConsentPrompt';
import { useRole } from './hooks/useRole';
import { useCareersAccess } from '../lib/careersAccess';
import ThemeToggle from '../components/ThemeToggle';
import { CommandPaletteTrigger } from '../components/CommandPaletteTrigger';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { CxIcon, type CxIconName } from './ui/icons';
import { Sheet } from './ui/Sheet';
import '../tools/tools.css';
import './careers.css';
import './ui/cx.css';

// Lazy for the same reason the Tools shell loads it lazily: the registry it
// searches is worth nothing until someone opens it.
const CommandPalette = lazy(() => import('../tools/ui/CommandPalette'));

/** The bottom bar holds four areas and More; the rest live in the More sheet. */
const BOTTOM_IDS: readonly CareersAreaId[] = ['dashboard', 'jobs', 'applications', 'interviews'];

/**
 * The route SEO (`seoForPath`) is a pure function shared with the edge Worker,
 * so it cannot know that this account is in the beta: it titles every
 * /careers path with the public launch message. Inside the workspace the tab
 * should say where you are.
 */
function useAreaTitle(name: string) {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${name} — FinatriX Careers`;
  }, [name, pathname]);
}

function NavLink({ to, icon, name, current }: { to: string; icon: CxIconName; name: string; current: boolean }) {
  return (
    <Link to={to} aria-current={current ? 'page' : undefined}>
      <CxIcon name={icon} />
      {name}
    </Link>
  );
}

export default function CareersLayout() {
  const { user, signOut, configured } = useAuth();
  const { isAdmin } = useRole();
  const { beta } = useCareersAccess();
  const { pathname } = useLocation();
  const { open: paletteOpen, openPalette, closePalette } = useCommandPalette();
  const [moreOpen, setMoreOpen] = useState(false);
  const area = careersAreaFor(pathname);
  useAreaTitle(area.name);

  const closeMore = () => setMoreOpen(false);

  const firstName =
    (user?.user_metadata?.full_name as string)?.split(' ')[0] || user?.email?.split('@')[0] || 'Account';

  const brand = (
    <Link to={CAREERS_ROUTES.dashboard} className="cx-brand" aria-label="FinatriX Careers home">
      <BrandLogo size={22} className="shrink-0" />
      <span>
        FinatriX <span className="cx-brand-sub">Careers</span>
      </span>
      {beta && (
        <span className="cx-beta" title="Early access for invited accounts. Free while in beta.">
          Beta
        </span>
      )}
    </Link>
  );

  const moreAreas = CAREERS_NAV.filter((n) => !BOTTOM_IDS.includes(n.id));

  return (
    <ToastProvider>
      <div className="fx-tools cx">
        <IconSprite />
        <div className="cx-shell">
          <aside className="cx-rail" aria-label="Careers">
            {brand}
            <nav className="cx-nav" aria-label="Careers areas">
              {CAREERS_NAV.map((n) => (
                <NavLink key={n.id} to={n.href} icon={n.icon} name={n.name} current={area.id === n.id} />
              ))}
            </nav>
            <div className="cx-rail-foot">
              <nav className="cx-nav" aria-label="Account">
                <NavLink to={CAREERS_ROUTES.settings} icon="settings" name="Settings" current={area.id === 'settings'} />
                {isAdmin && <NavLink to={CAREERS_ROUTES.admin} icon="spark" name="Admin" current={area.id === 'admin'} />}
                <Link to="/tools/dashboard">
                  <CxIcon name="wallet" />
                  Money tools
                  <span className="cx-nav-ext"><CxIcon name="arrow" size={14} /></span>
                </Link>
              </nav>
            </div>
          </aside>

          <div className="cx-main">
            <header className="cx-topbar">
              {brand}
              <div className="cx-topbar-tools">
                <CommandPaletteTrigger onOpen={openPalette} />
                <ThemeToggle />
                {user && <NotificationsBell />}
                {user ? (
                  <AccountMenu
                    name={firstName}
                    items={[
                      { label: 'Careers settings', to: CAREERS_ROUTES.settings },
                      { label: 'Money tools', to: '/tools/dashboard' },
                      { label: 'Profile & account', to: '/profile' },
                      ...(isNativeApp() ? [] : [{ label: 'FinatriX home', to: '/' }]),
                      { label: 'Sign out', onClick: () => void signOut(), danger: true },
                    ]}
                  />
                ) : (
                  <Link to="/login" className="cx-btn cx-btn-primary cx-btn-sm">
                    {configured ? 'Sign in' : 'Sign in (local only)'}
                  </Link>
                )}
              </div>
            </header>

            <div className="cx-content">
              <CareersGate>
                <CareersPaywallGate>
                  <CareersProvider>
                    <Outlet />
                  </CareersProvider>
                </CareersPaywallGate>
              </CareersGate>
            </div>
          </div>
        </div>

        <nav className="cx-bottombar" aria-label="Careers areas">
          {CAREERS_NAV.filter((n) => BOTTOM_IDS.includes(n.id)).map((n) => (
            <Link key={n.id} to={n.href} aria-current={area.id === n.id ? 'page' : undefined}>
              <CxIcon name={n.icon} size={22} />
              {n.name}
            </Link>
          ))}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-current={moreAreas.some((n) => n.id === area.id) || area.id === 'settings' || area.id === 'admin' ? 'page' : undefined}
            onClick={() => setMoreOpen(true)}
          >
            <CxIcon name="more" size={22} />
            More
          </button>
        </nav>

        <Sheet open={moreOpen} title="More" onClose={closeMore}>
          <nav className="cx-more-list" aria-label="More Careers areas" style={{ padding: 0 }} onClick={(e) => { if ((e.target as HTMLElement).closest('a')) closeMore(); }}>
            {moreAreas.map((n) => (
              <Link key={n.id} to={n.href} aria-current={area.id === n.id ? 'page' : undefined}>
                <CxIcon name={n.icon} />
                {n.name}
              </Link>
            ))}
            <Link to={CAREERS_ROUTES.settings} aria-current={area.id === 'settings' ? 'page' : undefined}>
              <CxIcon name="settings" />
              Settings
            </Link>
            {isAdmin && (
              <Link to={CAREERS_ROUTES.admin} aria-current={area.id === 'admin' ? 'page' : undefined}>
                <CxIcon name="spark" />
                Admin
              </Link>
            )}
            <Link to="/tools/dashboard">
              <CxIcon name="wallet" />
              Money tools
            </Link>
            {/* The account menu lives in the top bar from 768 px up; below
                that, these are its only way in. */}
            {user && (
              <Link to="/profile">
                <CxIcon name="resume" />
                Profile and account
              </Link>
            )}
          </nav>
          {user && (
            <button type="button" className="cx-btn cx-btn-danger cx-btn-block" style={{ marginTop: 12 }} onClick={() => { closeMore(); void signOut(); }}>
              Sign out
            </button>
          )}
        </Sheet>

        <AiConsentPrompt />

        {/* Mounted only while open, so its chunk is never fetched by someone
            who never uses it. */}
        {paletteOpen && (
          <Suspense fallback={null}>
            <CommandPalette onClose={closePalette} surface="careers" />
          </Suspense>
        )}
      </div>
    </ToastProvider>
  );
}
