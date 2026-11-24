import { describe, it, expect, afterEach, vi } from 'vitest';
import worker from '../../worker/index';
import { handleFxLatest, UPSTREAM_URL, type FxCache, type FxDeps } from '../../worker/fxLatest';
import { BASELINE_RATES, parseFeed } from '../shared/fxFeed';

/**
 * `GET /api/fx/latest` (worker/fxLatest.ts) against a fake Workers cache, a
 * fake clock and a fake rate source. What matters: the source is asked about
 * once a day, bad data never reaches the app, and the app keeps getting the
 * last good rates when the source is down.
 */

const NOV24 = Date.parse('2026-11-24T06:00:00Z');
const HOUR = 3_600_000;

/** An ExchangeRate-API payload published at `publishedAt` (epoch ms). */
function payload(rates: Record<string, unknown>, publishedAt = Date.parse('2026-11-24T00:02:31Z')) {
  return {
    result: 'success',
    base_code: 'USD',
    time_last_update_unix: Math.floor(publishedAt / 1000),
    time_next_update_unix: Math.floor((publishedAt + 24 * HOUR) / 1000),
    rates,
  };
}

/** A Map-backed stand-in for `caches.default`. */
function memoryCache(): FxCache & { size: () => number } {
  const entries = new Map<string, string>();
  return {
    async match(request) {
      const body = entries.get(request.url);
      return body === undefined ? undefined : new Response(body);
    },
    async put(request, response) {
      entries.set(request.url, await response.text());
    },
    size: () => entries.size,
  };
}

/** A source that answers from a queue, recording each request. */
function source(...answers: Array<unknown | Error | number>) {
  const calls: string[] = [];
  const fetchUpstream: NonNullable<FxDeps['fetchUpstream']> = async (input) => {
    calls.push(input);
    const next = answers.length > 1 ? answers.shift() : answers[0];
    if (next instanceof Error) throw next;
    if (typeof next === 'number') return new Response('busy', { status: next });
    return new Response(JSON.stringify(next), { headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchUpstream, calls };
}

const get = (init: RequestInit & { origin?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.origin) headers.set('Origin', init.origin);
  return new Request('https://finatrix.co/api/fx/latest', { ...init, headers });
};

async function body(res: Response) {
  return parseFeed(await res.json());
}

describe('/api/fx/latest', () => {
  it('answers the feed shape the app expects, for all forty codes', async () => {
    const { fetchUpstream, calls } = source(payload({ ...BASELINE_RATES, INR: 92.99 }));
    const res = await handleFxLatest(get(), { fetchUpstream, cache: memoryCache(), now: () => NOV24, log: () => {} });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
    expect(calls).toEqual([UPSTREAM_URL]);
    const feed = await body(res);
    expect(feed).toMatchObject({ base: 'USD', asOf: '2026-11-24', source: 'exchangerate-api' });
    expect(Object.keys(feed!.rates)).toHaveLength(40);
    expect(feed!.rates.INR).toBe(92.99);
  });

  it('asks the source about once a day, serving the cache in between', async () => {
    const cache = memoryCache();
    const { fetchUpstream, calls } = source(payload({ ...BASELINE_RATES }));
    const deps = { fetchUpstream, cache, log: () => {} };
    await handleFxLatest(get(), { ...deps, now: () => NOV24 });
    await handleFxLatest(get(), { ...deps, now: () => NOV24 + 5 * HOUR });
    await handleFxLatest(get(), { ...deps, now: () => NOV24 + 17 * HOUR });
    expect(calls).toHaveLength(1);
    expect(cache.size()).toBe(1);
    // Just after the source's own next update (00:02 UTC + 24 h), it asks again.
    await handleFxLatest(get(), { ...deps, now: () => Date.parse('2026-11-25T00:20:00Z') });
    expect(calls).toHaveLength(2);
  });

  it('keeps the previous rate for a bad value or a jump, and logs each one', async () => {
    const cache = memoryCache();
    const events: Record<string, unknown>[] = [];
    const log = (e: Record<string, unknown>) => { events.push(e); };
    const day1 = payload({ ...BASELINE_RATES, INR: 92, VND: 26000 });
    const day2 = payload(
      { ...BASELINE_RATES, INR: 'n/a', VND: 26.1 },
      Date.parse('2026-11-25T00:02:31Z'),
    );
    const { fetchUpstream } = source(day1, day2);
    await handleFxLatest(get(), { fetchUpstream, cache, log, now: () => NOV24 });
    const res = await handleFxLatest(get(), { fetchUpstream, cache, log, now: () => Date.parse('2026-11-25T06:00:00Z') });
    const feed = await body(res);
    expect(feed?.asOf).toBe('2026-11-25');
    expect(feed?.rates.INR).toBe(92);
    expect(feed?.rates.VND).toBe(26000);
    const rejected = events.filter((e) => e.event === 'fx_rate_rejected');
    expect(rejected.map((e) => [e.code, e.reason, e.kept])).toEqual([['INR', 'invalid', 92], ['VND', 'jump', 26000]]);
  });

  it('serves the last good rates when the source is down, then tries again in an hour', async () => {
    const cache = memoryCache();
    const { fetchUpstream, calls } = source(payload({ ...BASELINE_RATES, INR: 92 }), 429);
    const log = vi.fn();
    await handleFxLatest(get(), { fetchUpstream, cache, log, now: () => NOV24 });
    const later = Date.parse('2026-11-25T06:00:00Z');
    const res = await handleFxLatest(get(), { fetchUpstream, cache, log, now: () => later });
    expect(res.status).toBe(200);
    expect((await body(res))?.asOf).toBe('2026-11-24');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: 'fx_upstream_failed', status: 429 }));
    // Within the hour it does not ask again.
    await handleFxLatest(get(), { fetchUpstream, cache, log, now: () => later + 30 * 60_000 });
    expect(calls).toHaveLength(2);
    await handleFxLatest(get(), { fetchUpstream, cache, log, now: () => later + 61 * 60_000 });
    expect(calls).toHaveLength(3);
  });

  it('answers 503, uncached, when it has never had rates and the source is down', async () => {
    const { fetchUpstream } = source(new Error('network down'));
    const res = await handleFxLatest(get(), { fetchUpstream, cache: memoryCache(), now: () => NOV24, log: () => {} });
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('refuses a payload that is not a rate table', async () => {
    const { fetchUpstream } = source({ result: 'error', 'error-type': 'unsupported-code' });
    const res = await handleFxLatest(get(), { fetchUpstream, cache: memoryCache(), now: () => NOV24, log: () => {} });
    expect(res.status).toBe(503);
  });

  it('does not let the same dataset fetched twice confirm its own held-back jump', async () => {
    const cache = memoryCache();
    const day1 = payload({ ...BASELINE_RATES, INR: 92 });
    const day2 = payload({ ...BASELINE_RATES, INR: 150 }, Date.parse('2026-11-25T00:02:31Z'));
    const { fetchUpstream } = source(day1, day2, day2);
    const deps = { fetchUpstream, cache, log: () => {} };
    await handleFxLatest(get(), { ...deps, now: () => NOV24 });
    const held = await body(await handleFxLatest(get(), { ...deps, now: () => Date.parse('2026-11-25T06:00:00Z') }));
    expect(held?.rates.INR).toBe(92);
    // The source has not published again, so INR 150 is still unconfirmed.
    const again = await body(await handleFxLatest(get(), { ...deps, now: () => Date.parse('2026-11-26T06:00:00Z') }));
    expect(again?.rates.INR).toBe(92);
  });

  it('lets the two app origins read it, and nobody else', async () => {
    const deps = () => ({ ...source(payload({ ...BASELINE_RATES })), cache: null, now: () => NOV24, log: () => {} });
    for (const origin of ['https://localhost', 'capacitor://localhost']) {
      const res = await handleFxLatest(get({ origin }), deps());
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(res.headers.get('Vary')).toContain('Origin');
    }
    const other = await handleFxLatest(get({ origin: 'https://example.com' }), deps());
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('answers HEAD without a body and refuses other methods', async () => {
    const deps = { ...source(payload({ ...BASELINE_RATES })), cache: null, now: () => NOV24, log: () => {} };
    const head = await handleFxLatest(get({ method: 'HEAD' }), deps);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const post = await handleFxLatest(get({ method: 'POST' }), deps);
    expect(post.status).toBe(405);
    expect(post.headers.get('Allow')).toBe('GET, HEAD');
  });
});

describe('worker routing for /api/fx/latest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is answered by the Worker on the canonical host, not the SPA shell', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(payload({ ...BASELINE_RATES }))));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = { ASSETS: { fetch: async () => new Response('shell', { status: 200, headers: { 'Content-Type': 'text/html' } }) } };
    const res = await worker.fetch(new Request('https://finatrix.co/api/fx/latest'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect((await body(res))?.base).toBe('USD');
  });
});
