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
 *
 * A FAILED CHUNK IS NOT PROOF OF A NEW BUILD
 * ------------------------------------------
 * WebKit fails every import still in flight the moment a navigation begins — a
 * reload, a redirect to a payment page, a sign-in hand-off — while the old
 * page's JavaScript is still running. Treating that as a stale build and
 * calling `location.reload()` cancels the navigation the user just asked for
 * and reloads the page they were leaving. (It first showed up as a release
 * check failing with "Frame load interrupted".) No event reliably says "this
 * page is on its way out" on every engine; iOS Safari does not fire
 * `beforeunload` at all.
 *
 * So the question is asked directly: has the site been deployed since this
 * page loaded? The app shell is fetched fresh and checked for the entry script
 * this page booted from (`isBuildStale`). Only a different build is a reason
 * to reload. An interrupted import, a dropped connection and a captive portal
 * all answer "no", and the caller reports the failure in place instead.
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

/** The entry script this page booted from. Its content hash names the build. */
function currentEntry(): string | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src') ?? null;
}

/**
 * Has the site been deployed since this page loaded?
 *
 * Fetches the app shell — past the HTTP cache, and with a unique query so no
 * service worker cache can answer for it — and looks for this page's own entry
 * script in it. A shell that names a different entry is a newer build. Every
 * way of not finding out (offline, a page being torn down, a response that is
 * not a shell at all) answers false: no evidence is not evidence of a deploy.
 */
export async function isBuildStale(): Promise<boolean> {
  const entry = currentEntry();
  // The dev server has no hashed entry, and nothing there goes stale.
  if (!entry) return false;
  try {
    const response = await fetch(`/index.html?build-check=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) return false;
    const html = await response.text();
    if (!/\/assets\/[^"'\s]+\.js/.test(html)) return false;
    return !html.includes(entry);
  } catch {
    return false;
  }
}

/**
 * Reload to pick up the current build — the guarded primitive.
 *
 * Callers want `reloadIfBuildIsStale`, which first establishes that there IS a
 * newer build. Returns true when a reload is under way. Returns false — and
 * does nothing — when offline, when a reload was already tried in the last
 * minute, or when there is nowhere to record that it was tried.
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
 * Reload onto the current build if — and only if — there is one.
 *
 * Resolves true when a reload is under way, so the caller can stay quiet
 * rather than flash an error at someone whose page is about to be replaced;
 * false when the failure was something a reload cannot cure, which the caller
 * should then report.
 */
export async function reloadIfBuildIsStale(): Promise<boolean> {
  if (reloading) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (!(await isBuildStale())) return false;
  return reloadForNewBuild();
}

/**
 * Catch chunk failures wherever they happen.
 *
 * Vite routes every dynamic import in a production build through a helper that
 * announces a failure as `vite:preloadError` before rejecting. Listening here
 * covers all ninety-odd lazy boundaries at once — routes, panels, the PDF
 * reader — without each having to know about deploys. The rejection is left to
 * propagate (no `preventDefault`): the caller still fails cleanly if there is
 * no newer build to reload onto.
 */
export function installChunkRecovery(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', () => {
    void reloadIfBuildIsStale();
  });
}

/** Test seam: forget that a reload was started. */
export function resetChunkRecoveryForTests(): void {
  reloading = false;
}
