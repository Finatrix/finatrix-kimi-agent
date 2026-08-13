/**
 * Service worker registration.
 *
 * Registration is deliberately narrow: production builds only, after `load`,
 * and never in a context where a stale worker would be worse than no worker
 * (dev servers, unsupported browsers, non-secure origins).
 *
 * The worker itself is `public/sw.js`. It is stamped with a per-build version
 * by the `stampServiceWorker` plugin in vite.config.ts, which is what makes the
 * browser see a byte-difference and fetch the new one.
 */

/** Fired when a new build has installed and is waiting to take over. */
export type UpdateHandler = (activate: () => void) => void;

export function registerServiceWorker(onUpdate?: UpdateHandler): void {
  // Dev has no worker: an SPA served by Vite with a caching worker in front is
  // a debugging trap, and HMR and precached shells actively disagree.
  if (!import.meta.env.PROD) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  /**
   * Whether THIS page asked a waiting worker to take over.
   *
   * The reload below is gated on it, and that gate is load-bearing. The worker
   * calls `clients.claim()` on activate, so a first-ever registration fires
   * `controllerchange` moments after the page loads — reloading on that would
   * bounce every new visitor once, for nothing. It also destroys the execution
   * context mid-navigation, which is how this surfaced: two Playwright specs
   * failed with "Execution context was destroyed".
   */
  let takeoverRequested = false;
  let reloading = false;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // `controller` is null on the very first install — that is a fresh
          // registration, not an update, and prompting there would ask the
          // user to reload a page they just opened.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            onUpdate?.(() => {
              takeoverRequested = true;
              installing.postMessage('fx-skip-waiting');
            });
          }
        });
      });
    }).catch(() => {
      // A failed registration must never affect the app: the site works
      // exactly as before without it.
    });
  });

  // Reload only after a takeover this page actually asked for, so the document
  // and its worker agree on which build they are.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A first-ever registration takes control here, which is the earliest this
    // page can report what it loaded.
    void warmCache();
    if (!takeoverRequested || reloading) return;
    reloading = true;
    window.location.reload();
  });

  void warmCache();
  // A second pass, after the route's own lazy chunks have had time to arrive:
  // the first pass runs before they are requested, so on their own they would
  // never reach the cache and their route would not work offline.
  setTimeout(() => void warmCache(), 2500);
}

/**
 * Tell the worker which assets this page actually loaded.
 *
 * The worker cannot discover them on its own: `index.html` names only the
 * entry script, while the vendor and route chunks are dynamic imports that
 * appear in no markup. Without this the offline shell booted an entry module
 * whose imports were missing and rendered nothing at all.
 *
 * Waits for `ready` so there is a worker to talk to, then reports the
 * same-origin build assets from the Resource Timing API. Idempotent — the
 * worker skips anything it already holds.
 */
async function warmCache(): Promise<void> {
  try {
    await navigator.serviceWorker.ready;
    const target = navigator.serviceWorker.controller;
    if (!target) return;
    const urls = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((name) => {
        try {
          const u = new URL(name);
          return u.origin === location.origin && u.pathname.startsWith('/assets/');
        } catch {
          return false;
        }
      });
    if (urls.length) target.postMessage({ type: 'fx-warm', urls });
  } catch {
    // Warming is an optimisation; failing it costs only a slower first offline.
  }
}
