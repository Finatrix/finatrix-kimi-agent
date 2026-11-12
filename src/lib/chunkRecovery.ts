/**
 * Recovering when a piece of the app fails to load.
 *
 * FinatriX is split into chunks that load on demand: every route, and inside a
 * route the heavy things most people never open — the statement importer, the
 * PDF reader, the charts. Each chunk's filename carries a hash of its
 * contents, and every deploy replaces the set. So a tab that was opened before
 * a deploy is running JavaScript that names files the server no longer has. The
 * chunks it already fetched are cached; the first one it has NOT fetched yet
 * 404s, the dynamic `import()` rejects, React throws the rejection at the
 * nearest error boundary — and there was exactly one, at the root. Pressing
 * Import on an Expense Tracker left open over a deploy replaced the whole app
 * with "A small glitch on our end".
 *
 * The same thing happens with no deploy at all when the connection drops and
 * the chunk was never cached.
 *
 * Two different problems, two different answers:
 *
 *  - STALE BUILD (online, the file is gone): a reload fetches the current
 *    build, and nothing is lost because every tool keeps its data in storage,
 *    not in memory. Done automatically, once.
 *  - OFFLINE (or anything a reload did not fix): reloading cannot help, so the
 *    caller is told and says so, in place, with the rest of the page intact.
 *
 * "Once" is enforced across the reload itself, in sessionStorage: if a reload
 * did not cure it, a second one will not either, and a page that reloads every
 * time something is pressed is worse than one that explains itself.
 */

const RELOAD_STAMP_KEY = 'fx_chunk_reload_at';

/** A second automatic reload inside this window is refused. */
const RELOAD_WINDOW_MS = 60_000;

/**
 * How each engine words a dynamic import that could not be fetched. There is no
 * standard error type for it, so the message is all there is to go on.
 *   Chromium  "Failed to fetch dynamically imported module: <url>"
 *   Firefox   "error loading dynamically imported module: <url>"
 *   WebKit    "Importing a module script failed."
 *   Vite      "Unable to preload CSS for <url>"
 */
const CHUNK_ERROR_RE =
  /dynamically imported module|Importing a module script failed|Unable to preload CSS|Failed to load module script/i;

/** True when `error` is a lazily loaded part of the app failing to arrive. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === 'ChunkLoadError') return true;
  return typeof message === 'string' && CHUNK_ERROR_RE.test(message);
}

let reloading = false;

/** True once a reload has been started and the page is on its way out. */
export function isReloadingForNewBuild(): boolean {
  return reloading;
}

/**
 * Reload to pick up the current build, if that can help.
 *
 * Returns true when a reload is under way, so the caller can stay quiet rather
 * than flash an error at someone whose page is about to be replaced. Returns
 * false — and does nothing — when offline, when a reload was already tried in
 * the last minute, or when there is nowhere to record that it was tried.
 */
export function reloadForNewBuild(now: number = Date.now()): boolean {
  if (reloading) return true;
  if (typeof window === 'undefined') return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_STAMP_KEY) ?? 0);
    if (Number.isFinite(last) && now - last < RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(RELOAD_STAMP_KEY, String(now));
  } catch {
    // Without somewhere to remember the attempt, nothing stops a reload loop.
    return false;
  }

  reloading = true;
  window.location.reload();
  return true;
}

/**
 * Catch chunk failures wherever they happen.
 *
 * Vite routes every dynamic import in a production build through a helper that
 * announces a failure as `vite:preloadError` before rejecting. Listening here
 * covers all ninety-odd lazy boundaries at once — routes, panels, the PDF
 * reader — without each having to know about deploys. The rejection is left to
 * propagate (no `preventDefault`): the caller still fails cleanly if the reload
 * is refused.
 */
export function installChunkRecovery(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', () => {
    reloadForNewBuild();
  });
}

/** Test seam: forget that a reload was started. */
export function resetChunkRecoveryForTests(): void {
  reloading = false;
}
