import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
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
import './tools.css';

const syncLabel: Record<SyncStatus, string> = {
  idle: 'On this device',
  saving: 'Saving…',
  saved: 'Saved to your account',
  offline: 'On this device',
  error: 'Sync error',
};
const syncColor: Record<SyncStatus, string> = {
  idle: 'text-[#8A8A8A]',
  saving: 'text-[#D4AF37]',
  saved: 'text-[#5fd394]',
  offline: 'text-[#8A8A8A]',
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
      </nav>
      <CurrencySelect />
    </div>
  );
}

export default function ToolsLayout() {
  const { user, loading, signOut, configured } = useAuth();
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncStatus>(configured ? 'idle' : 'offline');
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTool = useActiveTool();

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Seed localStorage from the cloud (or clear it) before mounting the tools.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      setReady(false);
      const curUid = user?.id ?? null;
      const lastUid = getLastUid();
      if (configured && curUid) {
        if (lastUid && lastUid !== curUid) clearSyncedLocal(); // account switch
        const s = await loadCloudIntoLocal(curUid);
        if (!lastUid || lastUid !== curUid) await pushLocalToCloud(curUid);
        setLastUid(curUid);
        if (!cancelled) setSync(s);
      } else if (configured && !curUid && lastUid) {
        clearSyncedLocal();
        setLastUid(null);
        if (!cancelled) setSync('offline');
      } else if (!cancelled) {
        setSync(configured ? 'idle' : 'offline');
      }
      if (!cancelled) setReady(true);
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
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                className="md:hidden -ml-1 p-2 text-[#F5F5F0] hover:text-[#D4AF37] transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </button>
              <Link to="/" aria-label="FinatriX home" className="flex items-center gap-2 group">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
                  <rect x="7" y="7" width="10" height="10" rx="2.5" fill="#D4AF37" />
                  <circle cx="12" cy="12" r="2.1" fill="#0A0A0A" />
                </svg>
                <span className="font-mono text-[12px] uppercase tracking-[0.12em] sm:tracking-[0.16em] text-[#F5F5F0] group-hover:text-[#D4AF37] transition-colors select-none">
                  FinatriX
                </span>
              </Link>
            </div>

            <div className="relative flex items-center gap-2.5 sm:gap-4">
              {user ? (
                <>
                  <span className={`hidden sm:inline font-mono text-[10px] uppercase tracking-[0.06em] ${syncColor[sync]}`}>
                    {syncLabel[sync]}
                  </span>
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
                      <Link to="/" onClick={() => setMenuOpen(false)} className="px-4 py-2.5 text-[13px] text-[#F5F5F0] hover:bg-white/[0.05]">
                        Back to home
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

          {/* Tool tab bar */}
          <div className="nav-wrap">
            <ToolTabs activeTool={activeTool} />
          </div>

          {/* Tool content */}
          <div className="wrap">
            {ready ? <Outlet /> : <div style={{ minHeight: '50vh' }} aria-hidden="true" />}
            {ready && (
              <div style={{ borderTop: '1px solid var(--hair2)', marginTop: 8 }}>
                <LocalClock />
              </div>
            )}
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
                <div className="mt-1 mb-1 px-5 text-[10px] uppercase tracking-[0.12em] text-[#5A5A5A] font-mono">Tools</div>
                {TOOLS.map((t) => (
                  <Link
                    key={t.id}
                    to={t.href}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-3 px-5 py-2.5 text-[15px] hover:bg-white/[0.04] ${
                      activeTool === t.id ? 'text-[#D4AF37]' : 'text-[#E8E8E3]'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </Link>
                ))}
                <div className="my-2 mx-5 border-t border-white/[0.06]" />
                <Link to="/profile" onClick={() => setDrawerOpen(false)} className="block px-5 py-2.5 text-[15px] text-[#E8E8E3] hover:bg-white/[0.04]">Profile</Link>
                <Link to="/privacy" onClick={() => setDrawerOpen(false)} className="block px-5 py-2.5 text-[14px] text-[#8A8A8A] hover:bg-white/[0.04]">Privacy</Link>
                <Link to="/terms" onClick={() => setDrawerOpen(false)} className="block px-5 py-2.5 text-[14px] text-[#8A8A8A] hover:bg-white/[0.04]">Terms</Link>
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
    </CurrencyProvider>
  );
}
