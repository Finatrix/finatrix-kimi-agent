import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
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
} from '../tools/cloudSync';

// The original tools app, served verbatim from /public.
const TOOLS_URL = '/tools-app.html';

export default function ToolsPage() {
  const { user, loading, signOut, configured } = useAuth();
  const { hash } = useLocation();
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncStatus>(configured ? 'idle' : 'offline');
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deep-link support: a parent route like "/tools#/budget" forwards "#/budget"
  // into the tools iframe, which hash-routes to that tool.
  const toolHash = /^#\/[a-z]+$/i.test(hash) ? hash : '';
  const activeTool = toolHash.replace('#/', '');
  const frameSrc = `${TOOLS_URL}${toolHash}`;

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (drawerOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [drawerOpen]);

  // Seed localStorage from the cloud (or clear it) before mounting the frame.
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

  // When the frame writes localStorage, the parent receives a storage event.
  const uid = user?.id;
  useEffect(() => {
    if (!configured || !uid) return;
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !SYNC_KEYS.includes(e.key)) return;
      setSync('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const s = await pushLocalToCloud(uid);
        setSync(s);
      }, 700);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [uid, configured]);

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

  const firstName =
    (user?.user_metadata?.full_name as string)?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'Account';

  return (
    <div
      className="fixed top-0 left-0 right-0 flex flex-col bg-[#0A0A0A]"
      style={{ height: '100dvh' }}
    >
      {/* Slim app bar */}
      <header className="flex items-center justify-between h-12 px-3 sm:px-4 bg-[#0A0A0A] border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-1.5">
          {/* Mobile menu button */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="md:hidden -ml-1 p-2 text-[#F5F5F0] hover:text-[#D4AF37] transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <Link
            to="/"
            aria-label="FinatriX home"
            className="flex items-center gap-2 group"
          >
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
              {/* Desktop account dropdown */}
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

      {/* The tools, served verbatim and run unchanged */}
      <div className="flex-1 min-h-0 bg-[#0A0A0A]">
        {ready && (
          <iframe
            key={user?.id || 'guest'}
            src={frameSrc}
            title="FinatriX Tools"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            className="w-full h-full border-0 block"
          />
        )}
      </div>

      {/* ───────── Mobile navigation drawer (<768px) ───────── */}
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
            <Link
              to="/"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-3 px-5 py-3 text-[15px] text-[#F5F5F0] hover:bg-white/[0.04]"
            >
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
              <button
                onClick={() => { setDrawerOpen(false); void signOut(); }}
                className="w-full text-center font-mono text-[12px] uppercase tracking-[0.08em] text-[#E0726B] border border-white/[0.1] hover:border-[#E0726B]/50 rounded-full py-2.5 transition-colors"
              >
                Sign out
              </button>
            ) : (
              <Link
                to="/login"
                onClick={() => setDrawerOpen(false)}
                className="block w-full text-center font-mono text-[12px] uppercase tracking-[0.08em] text-[#0A0A0A] bg-[#D4AF37] hover:bg-[#F1C40F] rounded-full py-2.5 transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </div>
    </div>
  );
}
