import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deep-link support: a parent route like "/tools#/budget" forwards "#/budget"
  // into the tools iframe, which hash-routes to that tool. Guard against any
  // value that isn't an in-app tool route.
  const toolHash = /^#\/[a-z]+$/i.test(hash) ? hash : '';
  const frameSrc = `${TOOLS_URL}${toolHash}`;

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
        // First time on this browser for this account → migrate any local data up.
        if (!lastUid || lastUid !== curUid) await pushLocalToCloud(curUid);
        setLastUid(curUid);
        if (!cancelled) setSync(s);
      } else if (configured && !curUid && lastUid) {
        // Signed out — don't leave the previous account's data on this device.
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

  return (
    <div
      className="fixed top-0 left-0 right-0 flex flex-col bg-[#0A0A0A]"
      style={{ height: '100dvh' }}
    >
      {/* Slim app bar (kept outside the frame so the tools are untouched) */}
      <header className="flex items-center justify-between h-11 px-3 sm:px-4 bg-[#0A0A0A] border-b border-[#1A1A1A] shrink-0">
        <span className="font-mono text-[12px] uppercase tracking-[0.12em] sm:tracking-[0.18em] text-[#F5F5F0] select-none">
          FinatriX
        </span>

        <div className="relative flex items-center gap-2.5 sm:gap-4">
          {user ? (
            <>
              <span className={`hidden sm:inline font-mono text-[10px] uppercase tracking-[0.06em] ${syncColor[sync]}`}>
                {syncLabel[sync]}
              </span>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#F5F5F0] hover:text-[#D4AF37] transition-colors"
              >
                {(user.user_metadata?.full_name as string)?.split(' ')[0] ||
                  user.email?.split('@')[0] ||
                  'Account'}{' '}
                ▾
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-[calc(100%+8px)] min-w-[170px] bg-[#111111] border border-[#1A1A1A] py-1 flex flex-col z-10"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <Link
                    to="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-2.5 text-[13px] text-[#F5F5F0] hover:bg-[#1A1A1A]"
                  >
                    Profile &amp; settings
                  </Link>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      void signOut();
                    }}
                    className="px-4 py-2.5 text-[13px] text-left text-[#F5F5F0] hover:bg-[#1A1A1A]"
                  >
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
                className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.08em] text-[#0A0A0A] bg-[#D4AF37] hover:bg-[#F1C40F] px-2.5 sm:px-3 py-1.5 transition-colors whitespace-nowrap"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </header>

      {/* The tools, served verbatim and run unchanged */}
      <div className="flex-1 min-h-0 bg-white">
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
    </div>
  );
}
