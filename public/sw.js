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
 * answer "is this payment saved?" from a cache. The Worker's own `/api/` routes
 * are left to the network too: they serve data that changes daily.
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
    // A failed install must reject: otherwise activate would delete the last
    // working build's caches and replace them with an incomplete offline shell.
    const res = await fetch(new Request(SHELL_URL, { cache: 'reload' }));
    if (!res.ok) throw new Error('Could not cache the app shell');
    const html = await res.clone().text();
    const entryAssets = entryAssetsFrom(html);
    if (!entryAssets.some((url) => url.endsWith('.js'))) throw new Error('The app shell has no entry script');
    const assets = await caches.open(ASSET_CACHE);
    await Promise.all(entryAssets.map((u) => assets.add(u)));
    await shell.put(SHELL_URL, res);
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
    await Promise.all(data.urls.slice(0, 120).filter(isWarmable).map(async (url) => {
      try {
        if (await cache.match(url, MATCH)) return; // already held; don't refetch
        const res = await fetch(url);
        if (isAssetResponse(res)) await cache.put(url, res);
      } catch {
        // One unreachable asset must not abandon the rest.
      }
    }));
  })());
});

/**
 * Is this a URL the warm message is allowed to precache?
 *
 * The page already sends only same-origin `/assets/` entries, but the worker is
 * the trust boundary: `postMessage` reaches it from ANY script running in the
 * page, and `cache.add` on a cross-origin URL stores an OPAQUE response. Opaque
 * entries are padded — browsers charge them megabytes each against the origin's
 * quota regardless of their real size — so a few dozen would evict the app
 * shell and switch offline support off, silently, with nothing to point at.
 * They could never be SERVED (the fetch handler drops cross-origin requests
 * before any lookup), so caching them can only ever cost.
 */
function isWarmable(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url, self.location.origin);
    return u.origin === self.location.origin
      && IMMUTABLE_PREFIXES.some((p) => u.pathname.startsWith(p));
  } catch {
    return false;
  }
}

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

/** Storage is optional: quota/private-mode failures must not break the network. */
async function openCache(name) {
  try { return await caches.open(name); } catch { return undefined; }
}

async function cachedResponse(cache, request) {
  try { return await cache?.match(request, MATCH); } catch { return undefined; }
}

/**
 * Is this a response worth keeping as a build asset?
 *
 * Everything under /assets and /fonts is a script, a stylesheet, a font, an
 * image or WebAssembly — never a web page. A host that answers a missing file
 * with its app shell under a 200 (any SPA fallback does; `vite preview` does)
 * would otherwise have that page stored as the script, cache-first, for as long
 * as this worker lives: the chunk can then never load again, even once the real
 * file is back, because the network is never asked. Refusing to store a page
 * under an asset URL makes that impossible whatever the host does.
 */
function isAssetResponse(res) {
  if (!res || !res.ok) return false;
  const type = (res.headers.get('content-type') || '').toLowerCase();
  return !type.startsWith('text/html');
}

async function cacheFirst(event, request, cacheName) {
  const cache = await openCache(cacheName);
  const hit = await cachedResponse(cache, request);
  if (hit && isAssetResponse(hit)) return hit;
  // A page stored under an asset URL by an earlier worker: not an answer.
  // Forget it and ask the network, so the cache heals instead of staying broken.
  if (hit && cache) event.waitUntil(cache.delete(request, MATCH).catch(() => undefined));
  const res = await fetch(request);
  if (cache && isAssetResponse(res)) {
    event.waitUntil(cache.put(request, res.clone()).catch(() => undefined));
  }
  return res;
}

/**
 * `event` is taken so the background revalidation can be kept alive. Without a
 * `waitUntil`, the browser is free to terminate the worker the moment the
 * response is returned — which is exactly when a cache hit returns — so the
 * refresh that makes this "stale-WHILE-revalidate" was routinely killed before
 * `cache.put` landed, leaving the first cached copy to be served forever.
 */
async function staleWhileRevalidate(event, request) {
  const cache = await openCache(RUNTIME_CACHE);
  const hit = await cachedResponse(cache, request);
  const network = fetch(request)
    .then(async (res) => {
      if (cache && res && res.ok) {
        try {
          await cache.put(request, res.clone());
          await trim(RUNTIME_CACHE, RUNTIME_MAX_ENTRIES);
        } catch {
          // The network response remains usable even when caching it fails.
        }
      }
      return res;
    })
    .catch(() => undefined);

  if (hit) {
    event.waitUntil(network);
    return hit;
  }
  // Nothing cached, so the network is the only answer. When it fails there is
  // nothing to serve — and resolving `respondWith` with `undefined` is not a
  // valid answer: it surfaces as an opaque "FetchEvent resulted in a network
  // error" instead of the ordinary failure the page would have seen with no
  // worker installed at all. `Response.error()` IS that ordinary failure.
  return (await network) || Response.error();
}

/**
 * Network-first for documents, with the shell as the offline answer.
 *
 * The timeout matters more than the fallback: on a flaky mobile connection a
 * request that will eventually fail can hang for 30s, and a blank tab for 30s
 * is indistinguishable from a broken app.
 */
async function navigationHandler(event, request) {
  const cache = await openCache(SHELL_CACHE);
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
    if (cache && res && res.status === 200) {
      event.waitUntil(cache.put(SHELL_URL, res.clone()).catch(() => undefined));
    }
    return res;
  } catch {
    const shell = await cachedResponse(cache, SHELL_URL);
    if (shell) return shell;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title>'
      + '<body style="font-family:system-ui;padding:40px;max-width:32rem;margin:auto">'
      + '<h1>You are offline</h1><p>FinatriX will load again once you have a connection.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

/* ── Web share target ──────────────────────────────────────────────────
 * manifest.webmanifest's `share_target` makes the installed web app appear in
 * the phone's share sheet. The browser POSTs the shared images here. They go
 * into the same IndexedDB inbox the page reads (src/lib/shareInbox.ts, whose
 * names these must match: src/test/shareInbox.test.ts), and the page is sent
 * to the Expense Tracker, which opens the screenshot import with them. Nothing
 * is uploaded: the POST never leaves this device, because this worker answers
 * it. Nothing is saved to the ledger until the user reviews it there.
 */
const SHARE_TARGET_PATH = '/share-target';
const SHARE_DB = 'fx-share-inbox';
const SHARE_STORE = 'files';
const SHARE_DB_VERSION = 1;
const SHARE_MAX_FILES = 10;
const SHARE_MAX_BYTES = 15 * 1024 * 1024;
const SHARE_LANDING = '/tools/expenses?share=1';
const SHARE_FAILED = '/tools/expenses?share=failed';

function openShareInbox() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB, SHARE_DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SHARE_STORE)) {
        req.result.createObjectStore(SHARE_STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll('files')
      .filter((f) => f instanceof Blob && f.size > 0 && f.size <= SHARE_MAX_BYTES && /^image\//i.test(f.type || ''))
      .slice(0, SHARE_MAX_FILES);
    if (!files.length) return Response.redirect(SHARE_FAILED, 303);
    const db = await openShareInbox();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, 'readwrite');
      const store = tx.objectStore(SHARE_STORE);
      store.clear();
      const at = Date.now();
      for (const file of files) store.add({ name: file.name || '', type: file.type || '', blob: file, at });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return Response.redirect(SHARE_LANDING, 303);
  } catch {
    return Response.redirect(SHARE_FAILED, 303);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method === 'POST' && new URL(request.url).pathname === SHARE_TARGET_PATH
    && new URL(request.url).origin === self.location.origin) {
    event.respondWith(receiveShare(request));
    return;
  }
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
  // The Worker's API routes (today: /api/fx/latest) answer with data that
  // changes. Stale-while-revalidate would hand the page yesterday's answer and
  // keep today's for tomorrow, so the app's once-a-day rate check would always
  // be a day behind. The page keeps its own copy for offline use (fxLive.ts).
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(event, request));
    return;
  }
  if (isImmutable(url.pathname)) {
    event.respondWith(cacheFirst(event, request, ASSET_CACHE));
    return;
  }
  event.respondWith(staleWhileRevalidate(event, request));
});
