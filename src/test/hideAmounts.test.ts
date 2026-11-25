import { describe, it, expect, afterEach } from 'vitest';
import { cfmt, cfmtSh, fmt, maskedAmount } from '../tools/lib/format';
import {
  AMOUNT_MASK, HIDE_AMOUNTS_KEY, amountsHidden, resetAmountsHiddenCache, setAmountsHidden, subscribeAmountsHidden,
} from '../tools/lib/hideAmounts';
import { store } from '../tools/lib/storage';
import { SYNC_KEYS } from '../tools/cloudSync';
import { fmtExact, fmtForeign, fmtRate } from '../tools/lib/trips';

/**
 * Hide amounts (lib/hideAmounts.ts): one switch, read by the shared money
 * formatters, that prints "₹ ••••" in place of every amount. Off, the
 * formatters' output must be byte-for-byte what it was.
 */

afterEach(() => {
  setAmountsHidden(false);
  localStorage.removeItem(HIDE_AMOUNTS_KEY);
  resetAmountsHiddenCache();
});

describe('hide amounts', () => {
  it('is off by default and leaves every formatter unchanged', () => {
    expect(amountsHidden()).toBe(false);
    expect(cfmt(298080)).toBe('₹2.98 L');
    expect(cfmt(2980.8)).toBe('₹2,981');
    expect(cfmtSh(29760)).toBe('₹30K');
    expect(cfmt(1200, 'USD')).toBe('$1,200');
    expect(fmtForeign(120, 'AED')).toBe('AED 120');
    expect(fmtExact(2980.8, 'INR')).toBe('₹2,980.80');
  });

  it('masks cfmt, cfmtSh and the trip formatters while on', () => {
    setAmountsHidden(true);
    expect(cfmt(298080)).toBe(`₹ ${AMOUNT_MASK}`);
    expect(cfmt(-500)).toBe('₹ ••••');
    expect(cfmtSh(29760)).toBe('₹ ••••');
    expect(cfmt(1200, 'USD')).toBe('$ ••••');
    expect(cfmt(1200, 'AED')).toBe('AED ••••');
    expect(fmtForeign(120, 'AED')).toBe('AED ••••');
    expect(fmtExact(2980.8, 'INR')).toBe('₹ ••••');
  });

  it('leaves rates and the calculators’ ₹ formatter alone', () => {
    setAmountsHidden(true);
    expect(fmtRate(24)).toBe('24.00');
    expect(fmt(5000)).toBe('₹5,000');
  });

  it('names a currency with no symbol by its code', () => {
    expect(maskedAmount('XYZ')).toBe('XYZ ••••');
  });

  it('is remembered on this device, and never synced', () => {
    setAmountsHidden(true);
    expect(store.get(HIDE_AMOUNTS_KEY, '')).toBe('1');
    resetAmountsHiddenCache();
    expect(amountsHidden()).toBe(true);
    expect(SYNC_KEYS).not.toContain(HIDE_AMOUNTS_KEY);
  });

  it('tells subscribers when it flips', () => {
    let calls = 0;
    const off = subscribeAmountsHidden(() => { calls += 1; });
    setAmountsHidden(true);
    setAmountsHidden(false);
    off();
    setAmountsHidden(true);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(calls).toBeLessThanOrEqual(3);
  });
});
