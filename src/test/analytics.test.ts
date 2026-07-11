/**
 * Privacy-first analytics contract tests. These pin the guarantees that matter:
 * disabled without an endpoint, disabled under Do-Not-Track, and PII/unknown
 * props are stripped before anything can leave the tab.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
