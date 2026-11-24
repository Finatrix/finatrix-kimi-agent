import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BASELINE_RATES } from '../shared/fxFeed';
import { effectiveRates, loadLiveRates, ratesAsOf, saveLiveRates } from '../tools/lib/fx';
import { feedUrl, refreshLiveRates } from '../tools/lib/fxLive';

/**
 * The app's once-a-day check for live rates (src/tools/lib/fxLive.ts). The
 * request goes to the app's own Worker; these tests stand in for it.
 */

const TODAY = new Date(2026, 10, 24, 9, 30);
const feed = (asOf: string, rates: Record<string, number> = { ...BASELINE_RATES, INR: 93 }) => ({
  base: 'USD', asOf, source: 'exchangerate-api', rates,
});

/** A fetch that answers with `body` and records every call. */
function fakeFetch(body: unknown, init: { status?: number } = {}) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: init.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  delete (window as { Capacitor?: unknown }).Capacitor;
});

describe('refreshLiveRates', () => {
  it('fetches, then saves the rates with their date and the day it checked', async () => {
    const { impl, calls } = fakeFetch(feed('2026-11-24'));
    expect(await refreshLiveRates({ now: TODAY, fetchImpl: impl })).toBe('updated');
    expect(calls).toEqual(['/api/fx/latest']);
    expect(loadLiveRates()).toMatchObject({ asOf: '2026-11-24', checkedOn: '2026-11-24' });
    expect(effectiveRates().INR).toBe(93);
  });

  it('asks at most once a day', async () => {
    const { impl, calls } = fakeFetch(feed('2026-11-24'));
    await refreshLiveRates({ now: TODAY, fetchImpl: impl });
    expect(await refreshLiveRates({ now: new Date(2026, 10, 24, 23, 0), fetchImpl: impl })).toBe('skipped');
    expect(calls).toHaveLength(1);
    // The next local day asks again.
    expect(await refreshLiveRates({ now: new Date(2026, 10, 25, 0, 5), fetchImpl: impl })).toBe('unchanged');
    expect(calls).toHaveLength(2);
  });

  it('shares one request between two screens asking at once', async () => {
    const { impl, calls } = fakeFetch(feed('2026-11-24'));
    const [a, b] = await Promise.all([
      refreshLiveRates({ now: TODAY, fetchImpl: impl }),
      refreshLiveRates({ now: TODAY, fetchImpl: impl }),
    ]);
    expect([a, b]).toEqual(['updated', 'updated']);
    expect(calls).toHaveLength(1);
  });

  it('keeps the saved rates and tries again next time when offline', async () => {
    saveLiveRates({ asOf: '2026-11-20', source: 'exchangerate-api', rates: { ...BASELINE_RATES, INR: 91 }, checkedOn: '2026-11-20' });
    const offline = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    expect(await refreshLiveRates({ now: TODAY, fetchImpl: offline })).toBe('failed');
    // Offline shows the last saved date, not today's.
    expect(ratesAsOf()).toBe('2026-11-20');
    expect(effectiveRates().INR).toBe(91);
    expect(loadLiveRates()?.checkedOn).toBe('2026-11-20');
  });

  it('refuses an unusable answer: an error status, HTML, or a broken table', async () => {
    for (const [body, status] of [
      [feed('2026-11-24'), 503],
      ['<!doctype html><html></html>', 200],
      [feed('2026-11-24', { USD: 1, INR: 93 }), 200],
    ] as const) {
      const { impl } = fakeFetch(body, { status });
      expect(await refreshLiveRates({ now: TODAY, fetchImpl: impl })).toBe('failed');
    }
    expect(loadLiveRates()).toBeNull();
    expect(effectiveRates()).toEqual(BASELINE_RATES);
  });

  it('never steps back to an older table than the one it has', async () => {
    saveLiveRates({ asOf: '2026-11-24', source: 'exchangerate-api', rates: { ...BASELINE_RATES, INR: 93 }, checkedOn: '2026-11-23' });
    const { impl } = fakeFetch(feed('2026-11-23', { ...BASELINE_RATES, INR: 90 }));
    expect(await refreshLiveRates({ now: TODAY, fetchImpl: impl })).toBe('unchanged');
    expect(loadLiveRates()).toMatchObject({ asOf: '2026-11-24', checkedOn: '2026-11-24' });
    expect(effectiveRates().INR).toBe(93);
  });

  it('keeps a code the new answer lacked at the rate this device already had', async () => {
    saveLiveRates({ asOf: '2026-11-23', source: 'exchangerate-api', rates: { ...BASELINE_RATES, NPR: 148.8 }, checkedOn: '2026-11-23' });
    const rates: Record<string, number> = { ...BASELINE_RATES, INR: 93 };
    delete rates.NPR;
    const { impl } = fakeFetch(feed('2026-11-24', rates));
    expect(await refreshLiveRates({ now: TODAY, fetchImpl: impl })).toBe('updated');
    expect(effectiveRates().NPR).toBe(148.8);
  });
});

describe('feedUrl', () => {
  it('is same-origin on the web', () => {
    expect(feedUrl()).toBe('/api/fx/latest');
  });

  it('names the public site inside the apps, whose pages load from the device', () => {
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    expect(feedUrl()).toBe('https://finatrix.co/api/fx/latest');
  });
});
