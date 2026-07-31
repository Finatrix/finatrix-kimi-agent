import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useMobileDrawer } from '../hooks/useMobileDrawer';
import { TOOLS } from '../lib/tools';
import {
  SYNC_KEYS,
  clearSyncedLocal,
  getLastUid,
  setLastUid,
  loadCloudIntoLocal,
  pushLocalToCloud,
  type SyncStatus,
} from './cloudSync';
import { CurrencyProvider, useCurrency } from './CurrencyContext';
import { ToastProvider } from './ui/Toast';
import { IconSprite } from './ui/Icon';
import { CURRENCY_CODES, currencySym } from './lib/format';
import { onLocalWrite } from './lib/storage';
import { LocalClock } from './ui/LocalClock';
import { AccountMenu } from '../components/AccountMenu';
import { MobileDrawer } from '../components/MobileDrawer';
import { HomeButton } from '../components/HomeButton';
import { BrandLogo } from '../components/BrandLogo';
import { Breadcrumb } from '../components/Breadcrumb';
import ThemeToggle from '../components/ThemeToggle';
import { NotificationsBell } from './ui/NotificationsBell';
import { AiProvider, AiLauncher } from './ui/AiAssistant';
import './tools.css';

const syncLabel: Record<SyncStatus, string> = {
  idle: 'On this device',
  saving: 'Saving…',
  saved: 'Saved to your account',
  offline: 'On this device',
  error: 'Sync error',
};
const syncColor: Record<SyncStatus, string> = {
  idle: 'text-ink-3',
  saving: 'text-accent-text',
  saved: 'text-ink-2',
  offline: 'text-ink-3',
  error: 'text-[#E74C3C]',
};

/** The active tool id derived from the URL (/tools/:id). */
function useActiveTool(): string {
  const { pathname } = useLocation();
  const m = /^\/tools\/([a-z]+)/i.exec(pathname);
  return m ? m[1].toLowerCase() : '';
}

function CurrencySelect() {
  const { code, setCode } = useCurrency();
  return (
    <select
      value={code}
      onChange={(e) => setCode(e.target.value)}
      aria-label="Display currency"
      title="Display currency"
      style={{
        flex: '0 0 auto',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--ink)',
        background: 'var(--card)',
        border: '1px solid var(--hair)',
        borderRadius: 980,
        padding: '7px 10px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        outline: 'none',
      }}
    >
      {CURRENCY_CODES.map((k) => (
        <option key={k} value={k}>
          {currencySym(k)} {k}
        </option>
      ))}
    </select>
  );
}

function ToolTabs({ activeTool }: { activeTool: string }) {
  return (
    <div
      style={{
        maxWidth: 1024,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 8px',
      }}
    >
      <nav
        className="nav"
        id="mainNav"
        aria-label="Tools"
        style={{ maxWidth: 'none', margin: 0, flex: '1 1 auto', minWidth: 0, padding: '10px 8px' }}
      >
        <Link
          to="/tools/dashboard"
          data-route="dashboard"
          className={activeTool === 'dashboard' ? 'on' : undefined}
        >
          Dashboard
        </Link>
        {TOOLS.map((t) => (
          <Link
            key={t.id}
            to={t.href}
            data-route={t.id}
            className={activeTool === t.id ? 'on' : undefined}
          >
            {t.name}
          </Link>
        ))}
        <Link
          to="/tools/reports"
          data-route="reports"
          className={activeTool === 'reports' ? 'on' : undefined}
        >
          Reports
        </Link>
        <Link
          to="/tools/calendar"
          data-route="calendar"
          className={activeTool === 'calendar' ? 'on' : undefined}
        >
          Calendar
        </Link>
        <Link to="/careers" data-route="careers">
          Careers
        </Link>
      </nav>
      <CurrencySelect />
    </div>
  );
}

/* Mobile bottom navigation (<768px). Thumb-reachable, one-handed quick access
   to the hub and the three core money tools, plus a "More" affordance that opens
   the full drawer — so nothing is hidden and there is no horizontal scrolling. */
const BOTTOM_NAV_TOOLS = ['budget', 'expenses', 'goals'] as const;
/** Referenced by aria-controls from both triggers that open the drawer. */
const DRAWER_ID = 'fx-tools-drawer';
const BOTTOM_NAV_ICONS: Record<string, ReactElement> = {
  dashboard: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  budget: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-9-9v9z" /><path d="M12 3a9 9 0 0 1 9 9h-9z" opacity="0.55" />
    </svg>
  ),
  expenses: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-1 2z" /><path d="M9 8h6M9 12h6" />
    </svg>
  ),
  goals: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  ),
  more: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  ),
};

function MobileTabBar({ activeTool, onMore, moreActive, drawerOpen }: { activeTool: string; onMore: () => void; moreActive: boolean; drawerOpen: boolean }) {
  const items = [
    { key: 'dashboard', label: 'Dashboard', href: '/tools/dashboard' },
    ...BOTTOM_NAV_TOOLS.map((id) => {
      const t = TOOLS.find((x) => x.id === id)!;
      return { key: id, label: t.short, href: t.href };
    }),
  ];
  return (
    <nav className="fx-mobnav md:hidden" aria-label="Primary">
      {items.map((it) => {
        const active = activeTool === it.key;
        return (
          <Link key={it.key} to={it.href} className={`fx-mobnav-item${active ? ' on' : ''}`} aria-current={active ? 'page' : undefined}>
            {BOTTOM_NAV_ICONS[it.key]}
            <span>{it.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        className={`fx-mobnav-item${moreActive ? ' on' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        aria-controls={DRAWER_ID}
        aria-label="More tools and menu"
      >
        {BOTTOM_NAV_ICONS.more}
        <span>More</span>
      </button>
    </nav>
  );
}

/**
 * Placeholder for the window between "auth resolved" and "cloud data seeded".
 * That window used to render an empty box: the global loader vanished and the
 * shell sat there with nothing under it for seconds, which reads as a broken
 * page. Shaped like the KPI strip + cards every tool opens with, so content
 * doesn't jump when it arrives.
 */
function ToolSkeleton() {
  return (
    <div style={{ minHeight: '50vh', paddingTop: 18 }} role="status" aria-label="Loading your data">
      <div className="dash-grid" style={{ marginBottom: 16 }} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div className="card" key={i} style={{ marginBottom: 0, padding: 18 }}>
            <div className="skel" style={{ width: '58%', height: 22 }} />
            <div className="skel" style={{ width: '38%', height: 10, marginTop: 10 }} />
          </div>
        ))}
      </div>
      {[0, 1].map((i) => (
        <div className="card" key={i} aria-hidden="true">
          <div className="skel" style={{ width: '32%', height: 14 }} />
          <div className="skel" style={{ width: '100%', height: 11, marginTop: 14 }} />
          <div className="skel" style={{ width: '84%', height: 11, marginTop: 8 }} />
          <div className="skel" style={{ width: '62%', height: 11, marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

export default function ToolsLayout() {
  const { user, loading, signOut, configured } = useAuth();
  const [ready, setReady] = useState(false);
  // Guards the push scheduler through the one window where a debounced push is
  // destructive: clearSyncedLocal() → loadCloudIntoLocal(). Seeding writes
  // synced keys itself (clear + cloud load notify via fx:write so mounted
  // providers refresh), and a push fired mid-clear would upsert an empty blob
  // over the account's cloud data. It flips true the moment the cloud load
  // lands — localStorage holds real data from then on, so ordinary writes are
  // free to schedule again even while the seed's own write-back is in flight.
  const readyRef = useRef(false);
  const [sync, setSync] = useState<SyncStatus>(configured ? 'idle' : 'offline');
  const [drawerOpen, setDrawerOpen] = useMobileDrawer();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTool = useActiveTool();

  // Seed localStorage from the cloud (or clear it) before mounting the tools.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      setReady(false);
      readyRef.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const curUid = user?.id ?? null;
      const lastUid = getLastUid();
      if (configured && curUid) {
        if (lastUid && lastUid !== curUid) clearSyncedLocal(); // account switch
        const s = await loadCloudIntoLocal(curUid);
        // A newer seed superseded this one (account switch / sign-out) while
        // the read was in flight. It owns the flags and the cloud row now —
        // finishing here would push this account's data over the new one's.
        if (cancelled) return;
        setLastUid(curUid);
        setSync(s);
        // First run for this account on this device: merge whatever was on the
        // device up to the cloud. This is a write-back, not something the UI
        // reads — awaiting it added a second round-trip to time-to-content, so
        // it now runs alongside the render instead of in front of it.
        if (!lastUid || lastUid !== curUid) {
          readyRef.current = true;
          void pushLocalToCloud(curUid).then((p) => {
            if (!cancelled) setSync(p);
          });
        }
      } else if (configured && !curUid && lastUid) {
        clearSyncedLocal();
        setLastUid(null);
        if (!cancelled) setSync('offline');
      } else if (!cancelled) {
        setSync(configured ? 'idle' : 'offline');
      }
      if (!cancelled) {
        readyRef.current = true;
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loading, configured]);

  // Debounced push to the cloud whenever a tool writes a synced key. In the old
  // iframe architecture the parent learned of writes via the cross-context
  // `storage` event; now the tools run in this document, so we also listen for
  // the `fx:write` event our storage wrapper dispatches. (storage is kept for
  // cross-tab writes.)
  const uid = user?.id;
  useEffect(() => {
    if (!configured || !uid) return;
    const schedule = (key: string | null) => {
      if (!readyRef.current) return; // seeding in progress — its own explicit push handles it
      if (key && !SYNC_KEYS.includes(key)) return;
      setSync('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const s = await pushLocalToCloud(uid);
        setSync(s);
      }, 700);
    };
    const offWrite = onLocalWrite((key) => schedule(key));
    const onStorage = (e: StorageEvent) => schedule(e.key);
    window.addEventListener('storage', onStorage);
    return () => {
      offWrite();
      window.removeEventListener('storage', onStorage);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [uid, configured]);

  const firstName =
    (user?.user_metadata?.full_name as string)?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'Account';

  return (
    <CurrencyProvider>
      <ToastProvider>
        {/* FinatriX AI wraps the whole shell because any screen inside it can
            open the assistant pointed at what the user is looking at — a
            category, a transaction, a chart. `enabled` is held back until the
            cloud seed lands, so the assistant can never read a half-empty store
            and report figures the page is not showing. */}
        <AiProvider enabled={ready}>
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
                  FinatriX
                </span>
              </Link>
            </div>

            <div className="relative flex items-center gap-2.5 sm:gap-4">
              <NotificationsBell />
              <ThemeToggle />
              {user ? (
                <>
                  <span className={`hidden sm:inline font-mono text-[10px] uppercase tracking-[0.06em] ${syncColor[sync]}`}>
                    {syncLabel[sync]}
                  </span>
                  <AccountMenu
                    name={firstName}
                    items={[
                      { label: 'Profile', to: '/profile' },
                      { label: 'Settings', to: '/tools/settings' },
                      { label: 'Back to home', to: '/' },
                      { label: 'Sign out', onClick: () => void signOut(), danger: true },
                    ]}
                  />
                </>
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

          {/* Tool tab bar */}
          <div className="nav-wrap">
            <ToolTabs activeTool={activeTool} />
          </div>

          {/* Tool content */}
          <div className="wrap">
            <div style={{ paddingTop: 14 }}>
              <Breadcrumb current={activeTool === 'dashboard' ? 'Dashboard' : activeTool === 'reports' ? 'Reports' : activeTool === 'calendar' ? 'Calendar' : activeTool === 'settings' ? 'Settings' : (TOOLS.find((t) => t.id === activeTool)?.name ?? 'Tools')} />
            </div>
            {ready ? <Outlet /> : <ToolSkeleton />}
            {ready && (
              <div style={{ borderTop: '1px solid var(--hair2)', marginTop: 8 }}>
                <LocalClock />
              </div>
            )}
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
            <Link to="/" onClick={() => setDrawerOpen(false)} className="flex items-center gap-3 px-5 py-3 text-[15px] text-ink hover:bg-hairline-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />
              </svg>
              Home
            </Link>
            <Link to="/tools/dashboard" onClick={() => setDrawerOpen(false)} className={`flex items-center gap-3 px-5 py-3 text-[15px] hover:bg-hairline-2 ${activeTool === 'dashboard' ? 'text-accent-text' : 'text-ink'}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
              </svg>
              Dashboard
            </Link>
            <div className="mt-1 mb-1 px-5 text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Tools</div>
            {TOOLS.map((t) => (
              <Link
                key={t.id}
                to={t.href}
                onClick={() => setDrawerOpen(false)}
                className={`flex items-center gap-3 px-5 py-2.5 text-[15px] hover:bg-hairline-2 ${
                  activeTool === t.id ? 'text-accent-text' : 'text-ink'
                }`}
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                {t.name}
              </Link>
            ))}
            <Link
              to="/tools/reports"
              onClick={() => setDrawerOpen(false)}
              className={`flex items-center gap-3 px-5 py-2.5 text-[15px] hover:bg-hairline-2 ${activeTool === 'reports' ? 'text-accent-text' : 'text-ink'}`}
            >
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: '#D4AF37' }} />
              Reports
            </Link>
            <Link
              to="/tools/calendar"
              onClick={() => setDrawerOpen(false)}
              className={`flex items-center gap-3 px-5 py-2.5 text-[15px] hover:bg-hairline-2 ${activeTool === 'calendar' ? 'text-accent-text' : 'text-ink'}`}
            >
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: '#D4AF37' }} />
              Calendar
            </Link>
            <div className="mt-2 mb-1 px-5 text-[10px] uppercase tracking-[0.12em] text-ink-3 font-mono">Careers</div>
            <Link
              to="/careers"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-3 px-5 py-2.5 text-[15px] text-ink hover:bg-hairline-2"
            >
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: '#D4AF37' }} />
              FinatriX Careers
            </Link>
            <div className="my-2 mx-5 border-t border-hairline-2" />
            <Link to="/profile" onClick={() => setDrawerOpen(false)} className="block px-5 py-2.5 text-[15px] text-ink hover:bg-hairline-2">Profile</Link>
            <Link to="/tools/settings" onClick={() => setDrawerOpen(false)} className={`block px-5 py-2.5 text-[15px] hover:bg-hairline-2 ${activeTool === 'settings' ? 'text-accent-text' : 'text-ink'}`}>Settings</Link>
            <Link to="/privacy" onClick={() => setDrawerOpen(false)} className="block px-5 py-2.5 text-[14px] text-ink-3 hover:bg-hairline-2">Privacy</Link>
            <Link to="/terms" onClick={() => setDrawerOpen(false)} className="block px-5 py-2.5 text-[14px] text-ink-3 hover:bg-hairline-2">Terms</Link>
          </MobileDrawer>

          {/* The floating trigger. Sits at the end of the shell so it paints
              above the page without a stacking hack; the panel itself is
              rendered by AiProvider above, as a lazy chunk fetched on first
              open. */}
          {ready && <AiLauncher />}

          {/* Mobile bottom navigation (<768px) */}
          <MobileTabBar
            activeTool={activeTool}
            drawerOpen={drawerOpen}
            onMore={() => setDrawerOpen(true)}
            moreActive={activeTool !== 'dashboard' && !BOTTOM_NAV_TOOLS.includes(activeTool as typeof BOTTOM_NAV_TOOLS[number])}
          />
        </div>
        </AiProvider>
      </ToastProvider>
    </CurrencyProvider>
  );
}
