import { describe, it, expect } from 'vitest';
import {
  BASELINE_RATES, FX_CODES, FX_SOURCE, MAX_DAILY_MOVE, movedTooFar, parseFeed, parseUpstream, screenRates,
} from '../shared/fxFeed';

/**
 * The live exchange-rate feed (src/shared/fxFeed.ts): what the Worker accepts
 * from the source, and what the app accepts from the Worker. A wrong rate here
 * becomes a wrong total everywhere, so the tests are mostly about refusing.
 */

/** An ExchangeRate-API open-endpoint payload, trimmed. 24 Nov 2026 00:02:31 UTC. */
function upstream(rates: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    result: 'success',
    base_code: 'USD',
    time_last_update_unix: 1795478551,
    time_next_update_unix: 1795565661,
    rates,
    ...extra,
  };
}

describe('the code list', () => {
  it('is the forty currencies of the built-in table', () => {
    expect(FX_CODES).toHaveLength(40);
    expect([...FX_CODES]).toEqual(Object.keys(BASELINE_RATES));
  });

  it('includes the currencies the free central-bank feeds miss', () => {
    for (const code of ['VND', 'LKR', 'NPR', 'AED']) expect(FX_CODES).toContain(code);
  });
});

describe('parseUpstream', () => {
  it('reads the publication day in UTC and the next update time', () => {
    const parsed = parseUpstream(upstream({ USD: 1, INR: 92.99 }));
    expect(parsed).toEqual({
      asOf: '2026-11-24',
      nextUpdateAt: 1795565661 * 1000,
      rates: { USD: 1, INR: 92.99 },
    });
  });

  it('labels a dataset published just before midnight UTC with that UTC day', () => {
    // 23 Nov 2026 23:59:59 UTC is already 24 Nov in India. The label is the
    // publication day, the same for every reader, not the reader's own day.
    const parsed = parseUpstream(upstream({ USD: 1 }, { time_last_update_unix: 1795478399 }));
    expect(parsed?.asOf).toBe('2026-11-23');
  });

  it('refuses anything that is not a successful USD-based payload', () => {
    expect(parseUpstream(null)).toBeNull();
    expect(parseUpstream('{}')).toBeNull();
    expect(parseUpstream([])).toBeNull();
    expect(parseUpstream(upstream({ USD: 1 }, { result: 'error' }))).toBeNull();
    expect(parseUpstream(upstream({ EUR: 1 }, { base_code: 'EUR' }))).toBeNull();
    expect(parseUpstream(upstream({ USD: 1 }, { time_last_update_unix: 'yesterday' }))).toBeNull();
    expect(parseUpstream(upstream({ USD: 1 }, { rates: [1, 2] }))).toBeNull();
  });

  it('treats a missing next-update time as unknown', () => {
    expect(parseUpstream(upstream({ USD: 1 }, { time_next_update_unix: undefined }))?.nextUpdateAt).toBeNull();
  });
});

describe('screenRates', () => {
  const codes = ['USD', 'INR', 'AED', 'VND'];
  const previous = { USD: 1, INR: 90, AED: 3.6725, VND: 26000 };

  it('accepts ordinary daily moves', () => {
    const out = screenRates({ USD: 1, INR: 92.5, AED: 3.6725, VND: 26100 }, previous, {}, codes);
    expect(out.rates).toEqual({ USD: 1, INR: 92.5, AED: 3.6725, VND: 26100 });
    expect(out.rejected).toEqual([]);
    expect(out.pending).toEqual({});
  });

  it('rejects anything that is not a number above zero, and keeps the previous rate', () => {
    const out = screenRates({ USD: 1, INR: '92', AED: 0, VND: -5 }, previous, {}, codes);
    expect(out.rates).toEqual(previous);
    expect(out.rejected.map((r) => [r.code, r.reason, r.kept])).toEqual([
      ['INR', 'invalid', 90], ['AED', 'invalid', 3.6725], ['VND', 'invalid', 26000],
    ]);
  });

  it('rejects NaN, Infinity and a missing code', () => {
    const out = screenRates({ USD: 1, INR: Number.NaN, AED: Number.POSITIVE_INFINITY }, previous, {}, codes);
    expect(out.rates).toEqual(previous);
    expect(out.rejected.map((r) => r.code)).toEqual(['INR', 'AED', 'VND']);
  });

  it('holds back a jump of more than 50% in a day, either way', () => {
    // VND 26,000 → 25.8: the classic dropped-thousands glitch.
    const out = screenRates({ USD: 1, INR: 140, AED: 3.6725, VND: 25.8 }, previous, {}, codes);
    expect(out.rates).toEqual(previous);
    expect(out.rejected.map((r) => [r.code, r.reason])).toEqual([['INR', 'jump'], ['VND', 'jump']]);
    expect(out.pending).toEqual({ INR: 140, VND: 25.8 });
  });

  it('allows exactly 50%, which is not "more than" 50%', () => {
    expect(MAX_DAILY_MOVE).toBe(0.5);
    expect(movedTooFar(100, 150)).toBe(false);
    expect(movedTooFar(100, 50)).toBe(false);
    expect(movedTooFar(100, 150.01)).toBe(true);
    expect(movedTooFar(100, 49.99)).toBe(true);
  });

  it('accepts a held-back jump once the next day reports the same new level', () => {
    // A real devaluation: held on day one, confirmed on day two. Without this
    // the old rate would be kept forever, every later day being compared with it.
    const day1 = screenRates({ USD: 1, INR: 140, AED: 3.6725, VND: 26000 }, previous, {}, codes);
    const day2 = screenRates({ USD: 1, INR: 141, AED: 3.6725, VND: 26000 }, day1.rates, day1.pending, codes);
    expect(day2.rates.INR).toBe(141);
    expect(day2.rejected).toEqual([]);
    expect(day2.pending).toEqual({});
  });

  it('drops a one-day glitch that the next day does not repeat', () => {
    const day1 = screenRates({ USD: 1, INR: 90, AED: 3.6725, VND: 25.8 }, previous, {}, codes);
    const day2 = screenRates({ USD: 1, INR: 90, AED: 3.6725, VND: 26050 }, day1.rates, day1.pending, codes);
    expect(day2.rates.VND).toBe(26050);
    expect(day2.pending).toEqual({});
  });

  it('only checks the numbers when there is no previous day to compare with', () => {
    const out = screenRates({ USD: 1, INR: 92, AED: 'x', VND: 26000 }, null, {}, codes);
    expect(out.rates).toEqual({ USD: 1, INR: 92, VND: 26000 });
    expect(out.rejected).toEqual([{ code: 'AED', reason: 'invalid', value: 'x', kept: null }]);
  });

  it('checks all forty codes by default', () => {
    const out = screenRates({ ...BASELINE_RATES }, BASELINE_RATES);
    expect(Object.keys(out.rates)).toHaveLength(40);
  });
});

describe('parseFeed', () => {
  const good = { base: 'USD', asOf: '2026-11-24', source: FX_SOURCE.id, rates: { ...BASELINE_RATES } };

  it('accepts a well-formed response', () => {
    expect(parseFeed(good)).toEqual(good);
  });

  it('drops invalid codes but keeps the rest', () => {
    const parsed = parseFeed({ ...good, rates: { ...BASELINE_RATES, INR: 0, EUR: 'x', XYZ: 5 } });
    expect(parsed?.rates.INR).toBeUndefined();
    expect(parsed?.rates.EUR).toBeUndefined();
    expect(parsed?.rates.XYZ).toBeUndefined();
    expect(parsed?.rates.AED).toBe(3.6725);
  });

  it('refuses a response that lost most of the table or its pivot', () => {
    expect(parseFeed({ ...good, rates: { USD: 1, INR: 92 } })).toBeNull();
    expect(parseFeed({ ...good, rates: { ...BASELINE_RATES, USD: 1.2 } })).toBeNull();
  });

  it('refuses the wrong base, a bad date or no source', () => {
    expect(parseFeed({ ...good, base: 'EUR' })).toBeNull();
    expect(parseFeed({ ...good, asOf: '24/11/2026' })).toBeNull();
    expect(parseFeed({ ...good, asOf: '2026-13-45' })).toBeNull();
    expect(parseFeed({ ...good, source: '' })).toBeNull();
    expect(parseFeed('<!doctype html>')).toBeNull();
  });
});
