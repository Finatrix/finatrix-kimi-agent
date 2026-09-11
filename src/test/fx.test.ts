import { describe, it, expect, beforeEach } from 'vitest';
import {
  BASELINE_RATES, FX_AS_OF, STALE_AFTER_DAYS, convert, converterTo, effectiveRates,
  hasRate, isStale, loadRateOverrides, rateAgeDays, saveRateOverride,
} from '../tools/lib/fx';
import { CURRENCY_CODES } from '../tools/lib/format';

/**
 * The product offered forty currencies and converted between none of them, so
 * these tests care most about the two ways conversion can lie: silently
 * returning a wrong number, and silently returning zero.
 */

describe('the rate table', () => {
  it('covers every currency the picker offers', () => {
    // A currency someone can select but cannot convert is a total that is
    // quietly wrong, which is worse than one the UI refuses to show.
    const missing = CURRENCY_CODES.filter((c) => !hasRate(c));
    expect(missing).toEqual([]);
  });

  it('anchors on USD at exactly 1', () => {
    expect(BASELINE_RATES.USD).toBe(1);
  });

  it('has no zero or negative rate — either would divide by zero downstream', () => {
    for (const [code, rate] of Object.entries(BASELINE_RATES)) {
      expect(rate, code).toBeGreaterThan(0);
    }
  });

  it('carries a parseable capture date', () => {
    expect(Number.isFinite(Date.parse(`${FX_AS_OF}T00:00:00Z`))).toBe(true);
  });
});

describe('convert', () => {
  it('is the identity when nothing changes hands', () => {
    expect(convert(1234.56, 'INR', 'INR')).toBe(1234.56);
  });

  it('round-trips within floating-point tolerance', () => {
    const there = convert(1000, 'GBP', 'INR');
    expect(convert(there, 'INR', 'GBP')).toBeCloseTo(1000, 6);
  });

  it('converts through the USD pivot, not pairwise', () => {
    // 1 USD is INR 88 and GBP 0.79, so GBP 79 is USD 100 is INR 8,800.
    expect(convert(79, 'GBP', 'INR')).toBeCloseTo(8800, 6);
  });

  it('returns the amount untouched when a rate is missing', () => {
    // Never zero and never NaN: a gap in the table must not delete someone's
    // balance. `hasRate` is how a caller finds out and says so.
    expect(convert(500, 'XYZ', 'USD')).toBe(500);
    expect(convert(500, 'USD', 'XYZ')).toBe(500);
    expect(hasRate('XYZ')).toBe(false);
  });

  it('refuses a corrupt rate rather than trusting it', () => {
    expect(convert(100, 'AAA', 'USD', { AAA: 0, USD: 1 })).toBe(100);
    expect(convert(100, 'BBB', 'USD', { BBB: -2, USD: 1 })).toBe(100);
  });
});

describe('user overrides', () => {
  beforeEach(() => localStorage.clear());

  it('layers over the baseline and is used by conversion', () => {
    saveRateOverride('INR', 100);
    expect(effectiveRates().INR).toBe(100);
    expect(convert(1, 'USD', 'INR', effectiveRates())).toBe(100);
  });

  it('clears back to the shipped rate', () => {
    saveRateOverride('INR', 100);
    saveRateOverride('INR', null);
    expect(loadRateOverrides().INR).toBeUndefined();
    expect(effectiveRates().INR).toBe(BASELINE_RATES.INR);
  });

  it('rejects a rate that would break the arithmetic', () => {
    saveRateOverride('INR', 0);
    saveRateOverride('EUR', -1);
    saveRateOverride('GBP', Number.NaN);
    expect(loadRateOverrides()).toEqual({});
  });

  it('survives junk in storage', () => {
    localStorage.setItem('fx_fx_overrides', JSON.stringify({ INR: 'many', EUR: 0.9 }));
    expect(loadRateOverrides()).toEqual({ EUR: 0.9 });
  });
});

describe('staleness', () => {
  const asOf = new Date(`${FX_AS_OF}T00:00:00Z`);
  const daysAfter = (n: number) => new Date(asOf.getTime() + n * 86_400_000);

  it('counts whole days from the capture date', () => {
    expect(rateAgeDays(asOf)).toBe(0);
    expect(rateAgeDays(daysAfter(45))).toBe(45);
  });

  it('goes stale only after the window, so the warning means something', () => {
    expect(isStale(daysAfter(STALE_AFTER_DAYS))).toBe(false);
    expect(isStale(daysAfter(STALE_AFTER_DAYS + 1))).toBe(true);
  });
});

describe('converterTo', () => {
  it('binds one target so callers never handle a rate table', () => {
    const toInr = converterTo('INR');
    expect(toInr(1, 'USD')).toBeCloseTo(BASELINE_RATES.INR, 6);
    expect(toInr(250, 'INR')).toBe(250);
  });
});
