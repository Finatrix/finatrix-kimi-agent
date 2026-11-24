/**
 * `GET /api/fx/latest`: today's exchange rates for the app.
 *
 * Answers `{ base: "USD", asOf, source, rates }`, rates in units per 1 USD for
 * the forty codes in `BASELINE_RATES`. The data comes from ExchangeRate-API's
 * open endpoint, which publishes once a day; see src/shared/fxFeed.ts for why
 * that source and what its terms require.
 *
 * CACHING
 * -------
 * One entry per Cloudflare location, in the Workers cache. It holds the last
 * dataset that passed screening and says when to ask the source again: just
 * after the source's own next update, and never more than 24 hours on. So the
 * source sees about one request a day from each location, which is what its
 * terms ask for, and no cron is needed.
 *
 * The entry outlives that refresh time (30 days) on purpose. It is "the
 * previous rate" that tomorrow's data is screened against, and the answer
 * served if the source is down. A location whose entry was evicted starts with
 * no previous rates, and its first fetch is checked only for valid numbers.
 *
 * WHO MAY READ IT
 * ---------------
 * The website reads it same-origin. The apps load their pages from a bundle on
 * the device (`https://localhost` on Android, `capacitor://localhost` on iOS;
 * see capacitor.config.ts), so those two origins get a CORS header. Nobody else
 * does: the source's terms forbid redistributing its data.
 */
import {
  FX_BASE, FX_FEED_PATH, FX_SOURCE, isValidRate, parseUpstream, screenRates,
  type FxFeed,
} from '../src/shared/fxFeed';
import { SECURITY_HEADERS } from './securityHeaders';

export const UPSTREAM_URL = 'https://open.er-api.com/v6/latest/USD';

/** The app's own origins inside the installed apps. Mirrors supabase/functions/_shared/origins.ts. */
export const APP_ORIGINS: readonly string[] = ['https://localhost', 'capacitor://localhost'];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** How long a location keeps its last good dataset, as the previous rates and the fallback. */
const KEEP_FOR_SECONDS = 30 * 24 * 60 * 60;
/** After a failed refresh, how long to serve the old dataset before asking again. */
const RETRY_AFTER = HOUR;
/** Allow the source this long past its announced update before asking. */
const UPDATE_GRACE = 10 * MINUTE;
const UPSTREAM_TIMEOUT_MS = 8_000;

/** The cache entry: the served dataset plus what tomorrow's screening needs. */
interface Stored extends FxFeed {
  /** Jumps held back, waiting for the next dataset to confirm them. */
  pending: Record<string, number>;
  /** Epoch ms after which the source is asked again. */
  refreshAfter: number;
}

/** The slice of the Workers Cache API this route uses. */
export interface FxCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface FxDeps {
  /** Defaults to the global `fetch`. */
  fetchUpstream?: (input: string, init?: RequestInit) => Promise<Response>;
  /** Defaults to `caches.default`; null runs without a cache (as under Vitest). */
  cache?: FxCache | null;
  now?: () => number;
  /** Where rejections and failures are reported. Defaults to `console.warn` (Workers logs). */
  log?: (event: Record<string, unknown>) => void;
}

function defaultCache(): FxCache | null {
  // `caches.default` is a Workers extension; the DOM typings do not know it.
  const caches = (globalThis as unknown as { caches?: { default?: FxCache } }).caches;
  return caches?.default ?? null;
}

function defaultLog(event: Record<string, unknown>): void {
  console.warn(JSON.stringify(event));
}

function respond(request: Request, status: number, body: unknown, cacheControl: string): Response {
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheControl,
    Vary: 'Origin',
  };
  const origin = request.headers.get('Origin');
  if (origin && APP_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), { status, headers });
}

function serve(request: Request, stored: Stored, now: number): Response {
  const feed: FxFeed = { base: stored.base, asOf: stored.asOf, source: stored.source, rates: stored.rates };
  // Browsers may reuse the answer until this location would refresh, up to an hour.
  const maxAge = Math.max(60, Math.min(3600, Math.floor((stored.refreshAfter - now) / 1000)));
  return respond(request, 200, feed, `public, max-age=${maxAge}`);
}

function isStored(value: unknown): value is Stored {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Stored>;
  return v.base === FX_BASE && typeof v.asOf === 'string' && typeof v.source === 'string'
    && !!v.rates && typeof v.rates === 'object' && !!v.pending && typeof v.pending === 'object'
    && typeof v.refreshAfter === 'number';
}

async function readStored(cache: FxCache | null, key: Request): Promise<Stored | null> {
  if (!cache) return null;
  try {
    const hit = await cache.match(key);
    if (!hit) return null;
    const value: unknown = await hit.json();
    return isStored(value) ? value : null;
  } catch {
    return null;
  }
}

async function writeStored(cache: FxCache | null, key: Request, stored: Stored): Promise<void> {
  if (!cache) return;
  try {
    await cache.put(key, new Response(JSON.stringify(stored), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${KEEP_FOR_SECONDS}` },
    }));
  } catch {
    // A cache that refuses a write costs a refetch next time, nothing more.
  }
}

/** Just after the source's own next update, at least an hour and at most a day away. */
function nextRefresh(nextUpdateAt: number | null, now: number): number {
  const target = nextUpdateAt === null ? now + DAY : nextUpdateAt + UPDATE_GRACE;
  return Math.min(now + DAY, Math.max(now + HOUR, target));
}

/** Ask the source, and screen what it says against the previous dataset. Null when nothing usable came back. */
async function refresh(
  previous: Stored | null,
  fetchUpstream: NonNullable<FxDeps['fetchUpstream']>,
  now: number,
  log: NonNullable<FxDeps['log']>,
): Promise<Stored | null> {
  let body: unknown;
  try {
    const res = await fetchUpstream(UPSTREAM_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      log({ event: 'fx_upstream_failed', status: res.status });
      return null;
    }
    body = await res.json();
  } catch (error) {
    log({ event: 'fx_upstream_failed', error: String(error) });
    return null;
  }

  const upstream = parseUpstream(body);
  if (!upstream) {
    log({ event: 'fx_upstream_unreadable' });
    return null;
  }

  // The same dataset again (or an older one) is not a new day. Screening it
  // again would "confirm" yesterday's held-back jumps against themselves.
  if (previous && upstream.asOf <= previous.asOf) {
    return { ...previous, refreshAfter: nextRefresh(upstream.nextUpdateAt, now) };
  }

  if (!previous) log({ event: 'fx_no_previous_rates', asOf: upstream.asOf });
  const screened = screenRates(upstream.rates, previous?.rates ?? null, previous?.pending ?? {});
  for (const rejection of screened.rejected) {
    log({ event: 'fx_rate_rejected', asOf: upstream.asOf, ...rejection });
  }
  if (!isValidRate(screened.rates[FX_BASE])) {
    log({ event: 'fx_upstream_unreadable', reason: 'no pivot' });
    return null;
  }
  return {
    base: FX_BASE,
    asOf: upstream.asOf,
    source: FX_SOURCE.id,
    rates: screened.rates,
    pending: screened.pending,
    refreshAfter: nextRefresh(upstream.nextUpdateAt, now),
  };
}

export async function handleFxLatest(request: Request, deps: FxDeps = {}): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { ...SECURITY_HEADERS, Allow: 'GET, HEAD' } });
  }
  const now = (deps.now ?? Date.now)();
  const cache = deps.cache === undefined ? defaultCache() : deps.cache;
  const log = deps.log ?? defaultLog;
  const fetchUpstream = deps.fetchUpstream ?? ((input: string, init?: RequestInit) => fetch(input, init));
  // One entry per location, whatever the query string or the caller's headers.
  const key = new Request(new URL(`${FX_FEED_PATH}?entry=v1`, request.url).href);

  const stored = await readStored(cache, key);
  if (stored && now < stored.refreshAfter) return serve(request, stored, now);

  const fresh = await refresh(stored, fetchUpstream, now, log);
  if (fresh) {
    await writeStored(cache, key, fresh);
    return serve(request, fresh, now);
  }
  if (stored) {
    // The source is down or talking nonsense: keep serving the last good
    // dataset, which carries its own date, and try again in an hour.
    const retry = { ...stored, refreshAfter: now + RETRY_AFTER };
    await writeStored(cache, key, retry);
    return serve(request, retry, now);
  }
  return respond(request, 503, { error: 'Exchange rates are unavailable right now.' }, 'no-store');
}
