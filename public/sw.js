/**
 * FinatriX service worker — offline-first for a tool people open on a commute.
 *
 * WHY HAND-WRITTEN
 * ----------------
 * The alternative was a build plugin and its dependency tree for behaviour
 * this app can state in one file. The charter's rule against unnecessary
 * dependencies applies most where the dependency would sit between the user
 * and the network.
 *
 * STRATEGY, PER KIND OF REQUEST
 * -----------------------------
 *  - Navigations      → network-first with a short timeout, falling back to the
 *                       cached app shell. The shell boots the SPA, which reads
 *                       localStorage; every money tool then works offline
 *                       because the data was never on the server to begin with.
 *  - /assets, /fonts  → cache-first. These filenames are content-hashed, so a
 *                       hit can never be stale: different bytes mean a
 *                       different URL.
 *  - Everything else  → stale-while-revalidate, so icons and the manifest are
 *                       instant but still refresh in the background.
 *
 * WHAT IS DELIBERATELY NEVER CACHED
 * ---------------------------------
 * Anything that is not a same-origin GET. That excludes every Supabase call by
 * construction (cross-origin) and every mutation. A finance app must never
 * answer "is this payment saved?" from a cache.
 *
 * UPDATES
 * -------
 * `skipWaiting` is NOT called. A new worker takes over on the next navigation,
 * once the pages running the previous build have gone. Activating mid-session
 * would drop the old caches while the old JS is still lazily importing chunks
 * that the new deploy has already removed — a blank screen for the one user
 * who happened to be mid-task during a deploy.
 */

// Replaced at build time by the `stampServiceWorker` plugin in vite.config.ts.
// Every build therefore ships a byte-different worker, which is what makes the
// browser notice an update at all.
const VERSION = '__FX_SW_VERSION__';

const SHELL_CACHE = `fx-shell-${VERSION}`;
const ASSET_CACHE = `fx-assets-${VERSION}`;
const RUNTIME_CACHE = `fx-runtime-${VERSION}`;

/** The shell is the whole offline story for an SPA: one document, then JS. */
const SHELL_URL = '/index.html';

/** How long a navigation waits for the network before the shell is served. */
const NAV_TIMEOUT_MS = 3500;

/** Entries kept in the opportunistic runtime cache (icons, manifest, images). */
const RUNTIME_MAX_ENTRIES = 60;

const IMMUTABLE_PREFIXES = ['/assets/', '/fonts/'];

/**
 * The build's entry assets, read out of the shell itself.
 *
 * Precaching these at install is what makes the FIRST visit enough. A worker
 * only sees requests made after it takes control, and the page that registered
 * it has already fetched its own JS by then — so without this the shell would
 * be cached with no scripts to run, and going offline produced an empty
 * `#root`: a blank page that looks exactly like a broken app.
 *
 * Parsed from the served HTML rather than from a build-time manifest, so there
 * is no generated file to keep in sync and no plugin to own it. Vite writes
 * both the entry `<script type="module" src>` and `<link rel="modulepreload">`
 * for every shared chunk, which is precisely the critical path.
 */
function entryAssetsFrom(html) {
  const urls = new Set();
  const pattern = /(?:src|href)\s*=\s*["'](\/assets\/[^"']+\.(?:js|css))["']/g;
  let match;
  while ((match = pattern.exec(html)) !== null) urls.add(match[1]);
  return [...urls];
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    try {
      // `reload` bypasses the HTTP cache: installing from a stale copy of the
      // shell would pin the previous build's script tags for the next session.
      const res = await fetch(new Request(SHELL_URL, { cache: 'reload' }));
      if (!res.ok) return;
      const html = await res.clone().text();
      await shell.put(SHELL_URL, res);

      const assets = await caches.open(ASSET_CACHE);
      // Individually, not `addAll`: that rejects the whole batch if any single
      // request fails, which would leave the install with no assets at all.
      await Promise.all(
        entryAssetsFrom(html).map((u) => assets.add(u).catch(() => undefined))
      );
    } catch {
      // An install that could not reach the network simply caches nothing.
      // The next navigation will try again.
    }
  })());
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE, RUNTIME_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('fx-') && !keep.has(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/**
 * Messages from the page.
 *
 * `fx-warm` is how the cache learns about chunks an HTML scan cannot see.
 * `index.html` names only the entry script and its preloads — every route
 * chunk, and the shared vendor chunks the entry pulls at runtime, are dynamic
 * imports that appear nowhere in the markup. Precaching from the shell alone
 * therefore cached an entry module whose own imports were missing, and the
 * offline page booted nothing: a blank `#root`, which is the worst possible
 * offline experience because it is indistinguishable from a broken app.
 *
 * So the page reports what it actually loaded (from the Resource Timing API)
 * and the worker stores exactly that. Self-maintaining: whatever a route needs
 * is cached the first time that route is visited online.
 */
self.addEventListener('message', (event) => {
  if (event.data === 'fx-skip-waiting') {
    self.skipWaiting();
    return;
  }
  const data = event.data;
  if (!data || data.type !== 'fx-warm' || !Array.isArray(data.urls)) return;

  event.waitUntil((async () => {
    const cache = await caches.open(ASSET_CACHE);
    await Promise.all(data.urls.slice(0, 120).map(async (url) => {
      try {
        if (await cache.match(url, MATCH)) return; // already held; don't refetch
        await cache.add(url);
      } catch {
        // One unreachable asset must not abandon the rest.
      }
    }));
  })());
});

function isImmutable(pathname) {
  return IMMUTABLE_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Cache lookups ignore `Vary`, deliberately.
 *
 * Static hosts (including `vite preview` and Cloudflare) answer build assets
 * with `Vary: Origin`. A precached entry is stored from a plain `cache.add()`,
 * which sends no `Origin`, while the browser's own request for a module script
 * carries one because the tag is `crossorigin` — so a strict match MISSES every
 * precached script, falls through to the network, and offline dies with
 * ERR_FAILED and a blank `#root`.
 *
 * Ignoring `Vary` is safe for exactly what is cached here: same-origin,
 * content-hashed build output whose bytes cannot differ by request header.
 */
const MATCH = { ignoreVary: true };

/** Keep the opportunistic cache from growing without bound (FIFO). */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, MATCH);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const hit = await cache.match(request, MATCH);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) {
        cache.put(request, res.clone()).then(() => trim(RUNTIME_CACHE, RUNTIME_MAX_ENTRIES));
      }
      return res;
    })
    .catch(() => undefined);
  return hit || network || fetch(request);
}

/**
 * Network-first for documents, with the shell as the offline answer.
 *
 * The timeout matters more than the fallback: on a flaky mobile connection a
 * request that will eventually fail can hang for 30s, and a blank tab for 30s
 * is indistinguishable from a broken app.
 */
async function navigationHandler(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(request, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    // Only a genuine 200 refreshes the stored shell. The Worker answers unknown
    // routes with the shell body under a 404 (an honest soft-404 fix); caching
    // that would make every later offline navigation a 404.
    if (res && res.status === 200) cache.put(SHELL_URL, res.clone());
    return res;
  } catch {
    const shell = await cache.match(SHELL_URL, MATCH);
    if (shell) return shell;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title>'
      + '<body style="font-family:system-ui;padding:40px;max-width:32rem;margin:auto">'
      + '<h1>You are offline</h1><p>FinatriX will load again once you have a connection.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Range requests are served from the network: a cached 200 cannot satisfy a
  // partial-content request, and answering one with the whole body breaks media.
  if (request.headers.has('range')) return;
  if (url.pathname === '/healthz') return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }
  if (isImmutable(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
