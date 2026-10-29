/**
 * Careers shell — the workspace frame.
 *
 * Desktop: a left rail with the six areas, Settings and the way back to the
 * money tools. Phones and tablets: a slim top bar and a five-item bottom bar,
 * whose "More" sheet holds the rest. Every area renders its own PageHeader;
 * the shell owns only place, identity and the global affordances (search,
 * theme, notifications, account).
 */

import { Suspense, lazy, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { AccountMenu } from '../components/AccountMenu';
import { Wordmark } from '../components/Wordmark';
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
import AppearanceMenu from '../components/AppearanceMenu';
import { CommandPaletteTrigger } from '../components/CommandPaletteTrigger';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { CxIcon, type CxIconName } from './ui/icons';
import '../tools/tools.css';
import './careers.css';
import './ui/cx.css';

// Lazy for the same reason the Tools shell loads it lazily: the registry it
// searches is worth nothing until someone opens it.
const CommandPalette = lazy(() => import('../tools/ui/CommandPalette'));

/**
 * The phone's tab bar: five of the six areas, every tab a destination. It used
 * to hold four areas and a "More" tab that opened a sheet (Apple HIG,
 * tab-bars.md: avoid overflow tabs). Resume is the one left out of the bar —
 * it is set up once and then reached from Home's "Your resume" panel, the
 * command palette and the desktop rail; Settings, Money tools and the account
 * live in the account menu, which now shows at every width.
 */
const BOTTOM_IDS: readonly CareersAreaId[] = ['dashboard', 'jobs', 'applications', 'interviews', 'companies'];

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
  const area = careersAreaFor(pathname);
  useAreaTitle(area.name);

  const firstName =
    (user?.user_metadata?.full_name as string)?.split(' ')[0] || user?.email?.split('@')[0] || 'Account';

  const brand = (
    <Link to={CAREERS_ROUTES.dashboard} className="cx-brand" aria-label="FinatriX Careers home">
      <Wordmark logo={22} suffix="Careers" />
      {beta && (
        <span className="cx-beta" title="Early access for invited accounts. Free while in beta.">
          Beta
        </span>
      )}
    </Link>
  );


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
                <AppearanceMenu className="cx-desktop-only" />
                {user && <NotificationsBell />}
                {user ? (
                  <AccountMenu
                    name={firstName}
                    items={[
                      { label: 'Careers settings', to: CAREERS_ROUTES.settings },
                      ...(isAdmin ? [{ label: 'Admin', to: CAREERS_ROUTES.admin }] : []),
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
        </nav>


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
