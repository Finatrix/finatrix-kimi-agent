/**
 * Privacy-first analytics contract tests. These pin the guarantees that matter:
 * disabled without an endpoint, disabled under Do-Not-Track, and PII/unknown
 * props are stripped before anything can leave the tab.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TOOL_IDS } from '../shared/routes';

const ENDPOINT = 'https://collect.example/analytics';

function setDNT(value: string | null) {
  Object.defineProperty(navigator, 'doNotTrack', { value, configurable: true });
}

describe('analytics (privacy-first)', () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    beacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true, writable: true });
    setDNT(null);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled when no endpoint is configured (safe default)', async () => {
    vi.stubEnv('VITE_ANALYTICS_URL', '');
    const a = await import('../lib/analytics');
    expect(a.analyticsEnabled()).toBe(false);
    a.track('page_view', { route: '/' });
    expect(a.__analyticsInternals.getQueue().length).toBe(0);
  });

  it('respects Do Not Track', async () => {
    vi.stubEnv('VITE_ANALYTICS_URL', ENDPOINT);
    setDNT('1');
    const a = await import('../lib/analytics');
    expect(a.analyticsEnabled()).toBe(false);
    a.track('tool_view', { tool: 'budget' });
    expect(a.__analyticsInternals.getQueue().length).toBe(0);
  });

  it('queues allowlisted events and strips PII / unknown props', async () => {
    vi.stubEnv('VITE_ANALYTICS_URL', ENDPOINT);
    const a = await import('../lib/analytics');
    // `email` is not an allowlisted key → must be dropped. `tool` and `value` stay.
    a.track('tool_view', { tool: 'budget', email: 'user@example.com', value: 5 });
    const q = a.__analyticsInternals.getQueue();
    expect(q.length).toBe(1);
    expect(q[0].e).toBe('tool_view');
    expect(q[0].p).toEqual({ tool: 'budget', value: 5 });
  });

  it('flushes via sendBeacon to the endpoint and clears the queue', async () => {
    vi.stubEnv('VITE_ANALYTICS_URL', ENDPOINT);
    const a = await import('../lib/analytics');
    a.track('page_view', { route: '/tools/:tool' });
    a.flush();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe(ENDPOINT);
    expect(a.__analyticsInternals.getQueue().length).toBe(0);
  });

  it('truncates over-long string props', async () => {
    vi.stubEnv('VITE_ANALYTICS_URL', ENDPOINT);
    const a = await import('../lib/analytics');
    a.track('app_error', { kind: 'x'.repeat(200) });
    const q = a.__analyticsInternals.getQueue();
    expect((q[0].p?.kind as string).length).toBe(64);
  });
});

/**
 * Delivery guarantees. Everything here is invisible in production by
 * construction: beacons are fire-and-forget, so a batch that is dropped, sent
 * twice or silently discarded produces no error anywhere — only a dashboard
 * that is wrong by an unknown amount, which reads exactly like "quiet week".
 */
describe('analytics delivery', () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    beacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true, writable: true });
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
    setDNT(null);
    vi.stubEnv('VITE_ANALYTICS_URL', ENDPOINT);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  const setOnline = (v: boolean) =>
    Object.defineProperty(navigator, 'onLine', { value: v, configurable: true, writable: true });

  it('collapses an event repeated within the dedupe window', async () => {
    const a = await import('../lib/analytics');
    // React StrictMode runs effects twice, so this is the literal production
    // shape of a page view — one navigation, two calls.
    a.trackPageView('/tools/budget');
    a.trackPageView('/tools/budget');
    expect(a.__analyticsInternals.getQueue().length).toBe(1);

    // A different route is a different event and must survive.
    a.trackPageView('/privacy');
    expect(a.__analyticsInternals.getQueue().length).toBe(2);
  });

  it('keeps a genuine repeat once the window has passed', async () => {
    vi.useFakeTimers();
    const a = await import('../lib/analytics');
    a.track('tool_completed', { tool: 'budget' });
    vi.advanceTimersByTime(5_000);
    a.track('tool_completed', { tool: 'budget' });
    // Two completions five seconds apart are two real events; collapsing them
    // would under-count the primary conversion metric.
    expect(a.__analyticsInternals.getQueue().length).toBe(2);
  });

  it('holds events while offline instead of firing doomed requests', async () => {
    const a = await import('../lib/analytics');
    setOnline(false);
    a.track('page_view', { route: '/' });
    a.flush();
    expect(beacon).not.toHaveBeenCalled();
    expect(a.__analyticsInternals.getQueue().length).toBe(1);

    // Reconnecting drains what was held.
    setOnline(true);
    a.flush();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(a.__analyticsInternals.getQueue().length).toBe(0);
  });

  it('keeps the batch when the transport refuses it', async () => {
    // sendBeacon returns false when the browser will NOT queue the payload.
    // The old code cleared the queue before sending and lost these outright.
    beacon.mockReturnValue(false);
    const fetchMock = vi.fn(() => Promise.reject(new Error('offline')));
    vi.stubGlobal('fetch', fetchMock);

    const a = await import('../lib/analytics');
    a.track('app_error', { kind: 'TypeError' });
    a.flush();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.__analyticsInternals.getQueue().length, 'failed batch must be retained').toBe(1);
  });

  it('retries a 5xx but drops a 4xx that would fail identically forever', async () => {
    beacon.mockReturnValue(false);
    const fetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 502 } as Response));
    vi.stubGlobal('fetch', fetchMock);

    const a = await import('../lib/analytics');
    a.track('page_view', { route: '/' });
    a.flush();
    await Promise.resolve();
    await Promise.resolve();
    expect(a.__analyticsInternals.getQueue().length).toBe(1);

    a.__analyticsInternals.reset();
    fetchMock.mockResolvedValue({ ok: false, status: 400 } as Response);
    a.track('page_view', { route: '/' });
    a.flush();
    await Promise.resolve();
    await Promise.resolve();
    expect(a.__analyticsInternals.getQueue().length, 'a rejected batch must not loop').toBe(0);
  });

  it('bounds the queue so a long offline stretch cannot grow without limit', async () => {
    const a = await import('../lib/analytics');
    setOnline(false);
    // Distinct props so nothing is deduplicated away.
    for (let i = 0; i < 400; i++) a.track('web_vital', { metric: 'CLS', value: i });
    const q = a.__analyticsInternals.getQueue();
    expect(q.length).toBeLessThanOrEqual(200);
    // The NEWEST events are the ones kept.
    expect(q[q.length - 1].p?.value).toBe(399);
  });
});

describe('web vitals', () => {
  // LCP, CLS and INP only exist at tab-hide, and the analytics queue is flushed
  // on the same event. If the vitals are recorded after that flush, the closing
  // tab may never send them — so finalise() must flush for itself rather than
  // depend on which initialiser registered its listener first.
  it('sends the tab-hide metrics in the same turn they are recorded', async () => {
    vi.resetModules();
    // Typed so `mock.calls[0][0]` is the URL rather than an empty tuple.
    const beacon = vi.fn((url: string, body?: BodyInit) => Boolean(url) || Boolean(body));
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true, writable: true });
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
    setDNT(null);
    vi.stubEnv('VITE_ANALYTICS_URL', ENDPOINT);

    const { initWebVitals } = await import('../lib/webVitals');
    const a = await import('../lib/analytics');
    initWebVitals();

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(beacon, 'vitals must leave the tab, not sit in the queue').toHaveBeenCalled();
    expect(beacon.mock.calls[0][0]).toBe(ENDPOINT);
    expect(a.__analyticsInternals.getQueue().length, 'nothing may be left behind').toBe(0);
    vi.unstubAllEnvs();
  });
});

/**
 * Taxonomy coverage.
 *
 * `tool_completed` was declared in the client union AND allowlisted by the edge
 * function for months, and emitted by nothing at all — so the primary conversion
 * metric for the entire product read zero, and looked exactly like a product
 * nobody finished using. Nothing catches that: the union type is satisfied by
 * its own declaration, and an event that is never sent cannot fail.
 */
describe('event taxonomy', () => {
  const root = join(__dirname, '..', '..');

  const sourceFiles = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'test') continue;
        sourceFiles(full, out);
      } else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
  };

  /** Event names in the client's `AnalyticsEvent` union. */
  const declared = (): string[] => {
    const src = readFileSync(join(root, 'src/lib/analytics.ts'), 'utf8');
    const union = /export type AnalyticsEvent =([\s\S]*?);/.exec(src)![1];
    return [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  };

  it('emits every event it declares', () => {
    // analytics.ts is included, minus the union itself: `page_view` has no
    // caller outside the module because `trackPageView` is its emitter. The
    // declaration is what must not count as a use.
    const app = sourceFiles(join(root, 'src'))
      .map((f) =>
        f.endsWith('lib/analytics.ts')
          ? readFileSync(f, 'utf8').replace(/export type AnalyticsEvent =[\s\S]*?;/, '')
          : readFileSync(f, 'utf8'),
      )
      .join('\n');

    const orphans = declared().filter((e) => !new RegExp(`['"\`]${e}['"\`]`).test(app));
    expect(
      orphans,
      `declared but never emitted — either wire them up or remove them:\n${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('records a completion for every public calculator', () => {
    // Each tool needs its own emission: a single shared one in a layout would
    // make the per-tool funnel meaningless.
    const pages = sourceFiles(join(root, 'src/tools/pages'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    for (const tool of TOOL_IDS) {
      expect(
        new RegExp(`tool_completed'[^)]*tool:\\s*'${tool}'`).test(pages),
        `${tool} never reports a completion`,
      ).toBe(true);
    }
  });

  // The ingest drops any event it does not recognise, silently and with a 204.
  // A client that emits a name the function has not been taught is therefore
  // indistinguishable from a client that emits nothing.
  it('agrees with the edge function allowlist', () => {
    const edge = readFileSync(join(root, 'supabase/functions/analytics-collect/index.ts'), 'utf8');
    const allowed = /const ALLOWED_EVENTS = new Set\(\[([\s\S]*?)\]\)/.exec(edge)![1];
    const accepted = new Set([...allowed.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

    for (const event of declared()) {
      expect(accepted.has(event), `analytics-collect would drop '${event}'`).toBe(true);
    }
  });
});

describe('routeTemplate (no raw URLs / PII)', () => {
  it('collapses ids and hides unknown paths', async () => {
    const { routeTemplate } = await import('../shared/routes');
    expect(routeTemplate('/')).toBe('/');
    expect(routeTemplate('/tools/budget')).toBe('/tools/:tool');
    expect(routeTemplate('/careers/jobs')).toBe('/careers/:section');
    expect(routeTemplate('/privacy/')).toBe('/privacy');
    expect(routeTemplate('/secret/user/123?token=abc')).toBe('/*');
  });
});
