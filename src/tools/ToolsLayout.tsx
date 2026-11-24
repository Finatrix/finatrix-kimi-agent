import { Suspense, lazy, useEffect, useRef, useState, type ReactElement } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { TOOLS } from '../lib/tools';
import { NavPills } from '../components/NavPills';
import {
  SYNC_KEYS,
  clearSyncedLocal,
  getLastUid,
  setLastUid,
  loadCloudIntoLocal,
  pushLocalToCloud,
  recordPendingCloudChange,
  hasPendingCloudChanges,
  type SyncStatus,
} from './cloudSync';
import { CurrencyProvider, useCurrency } from './CurrencyContext';
import { MarketProvider, useMarket } from './MarketContext';
import { ToastProvider } from './ui/Toast';
import { SyncFailureNotice } from './ui/SyncFailureNotice';
import { IconSprite } from './ui/Icon';
import { CURRENCY_CODES, currencySym } from './lib/format';
import { onLocalWrite } from './lib/storage';
import { AssumptionsReviewed } from './ui/AssumptionsReviewed';
import { AccountMenu } from '../components/AccountMenu';
import { Wordmark } from '../components/Wordmark';
import { Breadcrumb } from '../components/Breadcrumb';
import { BackButton } from '../components/BackButton';
import AppearanceMenu from '../components/AppearanceMenu';
import { CommandPaletteTrigger } from '../components/CommandPaletteTrigger';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { NotificationsBell } from './ui/NotificationsBell';
import { AiProvider, AiLauncher, AiHeaderButton } from './ui/AiAssistant';
import { warnIfOverdue } from '../reference/review';
import { isNativeApp } from '../native/platform';
import { useReminderSync } from './lib/useReminderSync';
import { refreshLiveRates } from './lib/fxLive';
import WalkthroughGate from '../walkthrough/WalkthroughGate';
import TourGate from '../tour/TourGate';
import { TourPageButton } from '../tour/TourPageButton';
import { INVITE_SLOT_ID } from '../components/InlineInvite';
import './tools.css';

// Lazy on purpose: the palette carries the whole command registry (including
// the Learn index it searches), and it is worth nothing until it is opened.
const CommandPalette = lazy(() => import('./ui/CommandPalette'));

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

/**
 * `className` exists so the header copy can be hidden on a phone without a
 * Tailwind display utility: `tools.css` is loaded after `@tailwind utilities`,
 * so at equal specificity a class defined there beats `.hidden`. The All tools
 * page carries its own copy below that breakpoint.
 */
function CurrencySelect({ className, tour }: { className?: string; tour?: string } = {}) {
  const { code, setCode } = useCurrency();
  return (
    <select
      className={className}
      value={code}
      onChange={(e) => setCode(e.target.value)}
      aria-label="Display currency"
      title="Display currency"
      data-tour={tour}
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

/**
 * Which market's rules the tools are reading, beside the currency they display
 * in. The two are separate settings (lib/markets) and the header used to show
 * only the currency, so "UK rules, rupee amounts" was invisible until a tool's
 * figures stopped making sense.
 */
function MarketChip({ className, onNavigate, tour }: { className?: string; onNavigate?: () => void; tour?: string }) {
  const { market } = useMarket();
  return (
    <Link
      to="/tools/settings"
      onClick={onNavigate}
      className={className}
      data-tour={tour}
      aria-label={`Rules: ${market.name}. Change market`}
      title={`Rules: ${market.name}`}
      style={{
        flex: '0 0 auto',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--ink)',
        background: 'var(--card)',
        border: '1px solid var(--hair)',
        borderRadius: 980,
        padding: '7px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true">{market.flag}</span> {market.id}
    </Link>
  );
}

/**
 * The tool bar.
 *
 * The destinations are unchanged; what changed is that they are drawn by the
 * same `NavPills` the landing page uses, so the navigation is one object across
 * the whole site rather than two that drift. It also wraps rather than scrolling
 * sideways — see components/NavPills.tsx for why that mattered.
 */
function ToolTabs() {
  return (
    <div className="fx-toolbar" data-tour="shell-nav">
      <NavPills variant="app" hideBelow="md" />
    </div>
  );
}

/* Mobile bottom navigation (<768px) — the one navigation system on a phone.
   Five destinations, every one a real page: the dashboard, the three money
   tools people open daily, and All tools, which lists everything else and the
   display settings. It replaced a hamburger drawer plus a "More" tab that
   opened the same drawer — two menus for one job, and an overflow tab
   (Apple HIG, tab-bars.md › Best practices: avoid overflow tabs; a tab bar is
   for navigation between top-level destinations). */
const BOTTOM_NAV_TOOLS = ['budget', 'expenses', 'goals'] as const;
/** Pages that belong to the All tools tab rather than one of the other four. */
const HUB_PATHS = new Set(['all', 'settings', 'reports', 'calendar', 'subscriptions', 'reference', 'networth', 'investmatch', 'parksmart', 'peercompare', 'lifemap']);
const BOTTOM_NAV_ICONS: Record<string, ReactElement> = {
  dashboard: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 10.5L12 3.5l8.5 7" /><path d="M5.5 9v11h13V9" /><path d="M10 20v-5.5h4V20" />
    </svg>
  ),
  budget: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-9-9v9z" /><path d="M12 3a9 9 0 0 1 9 9h-9z" opacity="0.55" />
    </svg>
  ),
  expenses: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-1 2z" /><path d="M9 8h6M9 12h6" />
    </svg>
  ),
  goals: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  ),
  all: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
    </svg>
  ),
};

function MobileTabBar({ activeTool }: { activeTool: string }) {
  const items = [
    { key: 'dashboard', label: 'Home', href: '/tools/dashboard' },
    ...BOTTOM_NAV_TOOLS.map((id) => {
      const t = TOOLS.find((x) => x.id === id)!;
      return { key: id, label: t.short, href: t.href };
    }),
    { key: 'all', label: 'Tools', href: '/tools/all' },
  ];
  return (
    <nav className="fx-mobnav md:hidden" aria-label="Primary" data-tour="shell-nav">
      {items.map((it) => {
        const active = it.key === 'all' ? HUB_PATHS.has(activeTool) : activeTool === it.key;
        return (
          <Link key={it.key} to={it.href} className={`fx-mobnav-item${active ? ' on' : ''}`} aria-current={active ? 'page' : undefined} data-tour={it.key === 'all' ? 'shell-all' : undefined}>
            {BOTTOM_NAV_ICONS[it.key]}
            <span>{it.label}</span>
          </Link>
        );
      })}
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
/**
 * The tool shell's review-date line, naming the active market.
 *
 * A leaf rather than a call in `ToolsLayout`, because `ToolsLayout` renders
 * `MarketProvider` — it is above the context, not inside it. Keeping this a
 * separate component also means the market changing re-renders one line rather
 * than the entire shell.
 */
function MarketReviewNote() {
  const { market } = useMarket();
  return <div className="fx-assumptions-row"><AssumptionsReviewed asOf={market.asOf} scope={market.name} /></div>;
}

function ToolSkeleton() {
  return (
    <div style={{ minHeight: '50svh', paddingTop: 18 }} role="status" aria-label="Loading your data">
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
  const [seedFailed, setSeedFailed] = useState(false);
  const [seedAttempt, setSeedAttempt] = useState(0);
  // Guards the push scheduler through the one window where a debounced push is
  // destructive: clearSyncedLocal() → loadCloudIntoLocal(). Seeding writes
  // synced keys itself (clear + cloud load notify via fx:write so mounted
  // providers refresh), and a push fired mid-clear would upsert an empty blob
  // over the account's cloud data. It flips true the moment the cloud load
  // lands — localStorage holds real data from then on, so ordinary writes are
  // free to schedule again even while the seed's own write-back is in flight.
  const readyRef = useRef(false);
  const canPushRef = useRef(false);
  const [sync, setSync] = useState<SyncStatus>(configured ? 'idle' : 'offline');
  const { open: paletteOpen, openPalette, closePalette } = useCommandPalette();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTool = useActiveTool();
  useReminderSync();

  /**
   * One line in the development console when a published reference has gone
   * past its review date.
   *
   * Every value in `src/reference` is owned by an authority outside this
   * repository that can change it without telling anyone, so the failure mode
   * is silent: nothing breaks, the figure simply stops being true. This is the
   * cheapest possible thing that makes the decay visible to whoever is working
   * on the tools that day.
   *
   * Dev only, once per mount, and silent when everything is current — a
   * maintenance signal that fires on a clean tree is one people learn to ignore.
   * Tree-shaken out of production entirely, because `import.meta.env.DEV` is a
   * literal at build time.
   */
  useEffect(() => {
    if (import.meta.env.DEV) warnIfOverdue();
  }, []);

  // Today's exchange rates, at most once a day (lib/fxLive.ts). Screens that
  // convert re-read on the `fx:write` the save dispatches; until then, and
  // offline, the last saved rates are used with their own date on show.
  useEffect(() => {
    void refreshLiveRates();
  }, []);

  // Seed localStorage from the cloud (or clear it) before mounting the tools.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      setReady(false);
      setSeedFailed(false);
      readyRef.current = false;
      canPushRef.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const curUid = user?.id ?? null;
      const lastUid = getLastUid();
      if (configured && curUid) {
        if (lastUid && lastUid !== curUid) clearSyncedLocal(); // account switch
        const s = await loadCloudIntoLocal(curUid, () => !cancelled, { mergeLocal: !lastUid });
        // A newer seed superseded this one (account switch / sign-out) while
        // the read was in flight. It owns the flags and the cloud row now —
        // finishing here would push this account's data over the new one's.
        if (cancelled) return;
        setSync(s);
        if (s !== 'saved') {
          // An unread cloud row must never be overwritten by a partial local
          // copy. Keep edits gated until the user can safely retry the read.
          if (lastUid === curUid) {
            // A previously seeded account has a complete local copy. Keep it
            // usable offline, but hold uploads until its next successful read.
            readyRef.current = true;
            setReady(true);
          } else {
            setSeedFailed(true);
          }
          return;
        }
        setLastUid(curUid);
        canPushRef.current = true;
        // First run for this account on this device: merge whatever was on the
        // device up to the cloud. This is a write-back, not something the UI
        // reads — awaiting it added a second round-trip to time-to-content, so
        // it now runs alongside the render instead of in front of it.
        if (!lastUid || lastUid !== curUid || hasPendingCloudChanges(curUid)) {
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
  }, [user?.id, loading, configured, seedAttempt]);

  useEffect(() => {
    const retry = () => {
      if (user?.id && (!canPushRef.current || hasPendingCloudChanges(user.id))) {
        setSeedAttempt((attempt) => attempt + 1);
      }
    };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [user?.id]);

  // Debounced push to the cloud whenever a tool writes a synced key. In the old
  // iframe architecture the parent learned of writes via the cross-context
  // `storage` event; now the tools run in this document, so we also listen for
  // the `fx:write` event our storage wrapper dispatches. (storage is kept for
  // cross-tab writes.)
  const uid = user?.id;
  useEffect(() => {
    if (!configured || !uid) return;
    /**
     * Send a pending write now instead of waiting out the debounce. Called when
     * the tab is being hidden or torn down and when this effect is cleaned up
     * (navigating out of /tools, signing out, switching account).
     *
     * Previously the cleanup just cleared the timer, so an edit made in the
     * 700ms before leaving the section was dropped and never reached the cloud
     * at all — the user saw "Saving…", left, and the change existed only on
     * that device. `pushLocalToCloud` snapshots the values synchronously before
     * its first await, so a flush during sign-out still captures the signed-in
     * user's data ahead of the seeding effect clearing it.
     */
    const flush = () => {
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (!canPushRef.current) return;
      void pushLocalToCloud(uid);
    };
    const schedule = (key: string | null) => {
      if (!readyRef.current) return; // seeding in progress — its own explicit push handles it
      if (key && !SYNC_KEYS.includes(key)) return;
      recordPendingCloudChange(uid, key);
      if (!canPushRef.current) return;
      setSync('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        saveTimer.current = null;
        const s = await pushLocalToCloud(uid);
        setSync(s);
      }, 700);
    };
    /** A save that never landed gets another try when the tab or network returns. */
    const retry = () => {
      if (!canPushRef.current || saveTimer.current || !hasPendingCloudChanges(uid)) return;
      setSync('saving');
      void pushLocalToCloud(uid).then(setSync);
    };
    // Merged cloud data landing here is not the user editing anything.
    const offWrite = onLocalWrite((key, origin) => {
      if (origin !== 'remote') schedule(key);
    });
    const onStorage = (e: StorageEvent) => schedule(e.key);
    // `visibilitychange` is the reliable moment on mobile, where `pagehide`
    // frequently never runs; both are cheap because flush is a no-op unless a
    // write is actually pending.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
      else retry();
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', retry);
    window.addEventListener('pagehide', flush);
    return () => {
      offWrite();
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', retry);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [uid, configured]);

  const firstName =
    (user?.user_metadata?.full_name as string)?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'Account';

  return (
    <CurrencyProvider>
      <MarketProvider>
      <ToastProvider>
        {user && <SyncFailureNotice sync={sync} />}
        {/* FinatriX AI wraps the whole shell because any screen inside it can
            open the assistant pointed at what the user is looking at — a
            category, a transaction, a chart. `enabled` is held back until the
            cloud seed lands, so the assistant can never read a half-empty store
            and report figures the page is not showing. */}
        <AiProvider enabled={ready}>
        <div className="fx-tools" style={{ minHeight: 'calc(100dvh - var(--fx-safe-top))' }}>
          <div className="fx-amb" aria-hidden="true">
            <div className="fx-amb-glow" />
            <div className="fx-amb-grid" />
            <div className="fx-amb-vig" />
          </div>
          <IconSprite />

          {/* App bar. On a phone it holds the wordmark and four icon buttons —
              search, FinatriX AI, notifications, account — each 44px. Market,
              currency and appearance join them from 640px / 768px up; on a
              phone they live on the All tools page. */}
          <header className="fx-appbar border-b border-hairline-2">
            <Link to="/" aria-label="FinatriX home" className="fx-appbar-brand">
              <Wordmark logo={22} />
            </Link>

            <div className="fx-appbar-actions">
              <CommandPaletteTrigger onOpen={openPalette} />
              {ready && <AiHeaderButton className="fx-phone-only" />}
              <NotificationsBell />
              {/* Display currency sits with the other global display controls,
                  not in the navigation row; on a phone the All tools page has
                  the same controls, so nothing is lost below 640px. */}
              <MarketChip className="fx-cur-desktop" tour="shell-market" />
              <CurrencySelect className="fx-cur-desktop" tour="shell-currency" />
              <AppearanceMenu className="fx-desktop-only" tour="shell-theme" />
              {user ? (
                <>
                  <span className={`fx-sync-label hidden lg:inline ${syncColor[sync]}`} data-tour="shell-sync">
                    {syncLabel[sync]}
                  </span>
                  <AccountMenu
                    tour="shell-account"
                    name={firstName}
                    items={[
                      { label: 'Profile', to: '/profile' },
                      { label: 'Settings', to: '/tools/settings' },
                      // The landing page is the website's front door; in the
                      // app, "/" is the dashboard this menu is already on.
                      ...(isNativeApp() ? [] : [{ label: 'FinatriX website', to: '/' }]),
                      { label: 'Sign out', onClick: () => void signOut(), danger: true },
                    ]}
                  />
                </>
              ) : (
                <>
                  <span className="fx-sync-label hidden lg:inline text-ink-3" data-tour="shell-sync">
                    {configured ? 'Not signed in' : 'On this device'}
                  </span>
                  <Link to="/login" data-tour="shell-account" className="fx-icon-btn fx-phone-only" aria-label="Sign in">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4" />
                    </svg>
                  </Link>
                  <Link to="/login" data-tour="shell-account" className="fx-signin-pill fx-desktop-only">
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </header>

          {/* Tool tab bar */}
          <div className="nav-wrap">
            <ToolTabs />
          </div>

          {/* Tool content */}
          <div className="wrap">
            {/* Orientation left, escape hatch right — Back only renders below
                the top level, so it never appears as a dead control. The row
                itself shows in the apps too, for the one control they need
                from it: "Tour this page" (the breadcrumb and Back are
                website chrome; the system BACK replaces them there). */}
            <div className="fx-crumbrow">
              <Breadcrumb parent={{ label: 'Money tools', to: '/tools' }} current={activeTool === 'dashboard' ? 'Dashboard' : activeTool === 'reports' ? 'Reports' : activeTool === 'calendar' ? 'Calendar' : activeTool === 'subscriptions' ? 'Subscriptions' : activeTool === 'settings' ? 'Settings' : activeTool === 'all' ? 'All tools' : (TOOLS.find((t) => t.id === activeTool)?.name ?? 'Tools')} />
              <div className="fx-crumbrow-end">
                {ready && <TourPageButton />}
                <span data-web-only className="fx-crumbrow-back"><BackButton /></span>
              </div>
            </div>
            {/* The tour's first-visit invitation renders here, in the page
                flow, rather than floating over the content (tour/TourOffer). */}
            <div id={INVITE_SLOT_ID} />
            {ready ? <Outlet /> : seedFailed ? (
              <section role="alert" className="card" style={{ marginTop: 24, padding: 24 }}>
                <h1 style={{ fontSize: 20, marginBottom: 8 }}>Your saved data couldn’t be loaded</h1>
                <p style={{ marginBottom: 16 }}>Check your connection and try again. Your saved account data has not been changed.</p>
                <button type="button" className="btn primary" onClick={() => setSeedAttempt((attempt) => attempt + 1)}>Try again</button>
              </section>
            ) : <ToolSkeleton />}
            {ready && (
              <div style={{ borderTop: '1px solid var(--hair2)', marginTop: 8 }}>
                <MarketReviewNote />
              </div>
            )}
          </div>

          {/* The floating trigger. Sits at the end of the shell so it paints
              above the page without a stacking hack; the panel itself is
              rendered by AiProvider above, as a lazy chunk fetched on first
              open. */}
          {ready && <AiLauncher />}

          {/* First-run intro. Decides only once the data has loaded, so a
              signed-in user's synced records count as "not new"; the scenes
              themselves are a lazy chunk fetched only when shown. */}
          {ready && <WalkthroughGate />}

          {/* The product tour: the "Tour this page" button above, Settings and
              the command palette open it; it also offers itself, politely,
              once the first-run intro is behind someone. Everything but this
              gate is a lazy chunk fetched on first use. */}
          {ready && <TourGate />}

          {/* The palette mounts only while open, so its chunk (and the command
              registry inside it) is never fetched by someone who never uses it. */}
          {paletteOpen && (
            <Suspense fallback={null}>
              <CommandPalette onClose={closePalette} />
            </Suspense>
          )}

          {/* Mobile bottom navigation (<768px) */}
          <MobileTabBar activeTool={activeTool} />
        </div>
        </AiProvider>
      </ToastProvider>
      </MarketProvider>
    </CurrencyProvider>
  );
}
