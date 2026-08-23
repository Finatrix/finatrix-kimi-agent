/**
 * ParkSmart's tax rules, checked against the Income-tax Act rather than
 * against the previous implementation.
 *
 * Sources for every figure asserted here:
 *   • §112A — LTCG on listed equity: ₹1.25 lakh exemption per financial year,
 *     12.5% above it, both effective 23 July 2024 (Finance (No. 2) Act, 2024).
 *   • §111A — STCG on listed equity: 20% flat, same date.
 *   • §80TTA — savings-account interest: ₹10,000 per financial year, aggregate
 *     across all accounts, available under the OLD regime only.
 *
 * The property that matters most is the one the old code broke: an allowance is
 * a per-year, per-taxpayer amount, so it must not move when the holding period
 * moves.
 */

import { describe, it, expect } from 'vitest';
import {
  PS_OPTS,
  TAX_RULES,
  psTax,
  computeParkSmart,
  type ParkOption,
} from '../tools/lib/parksmart';

const equity = PS_OPTS.find((o) => o.tax === 'equity')!;
const savings = PS_OPTS.find((o) => o.tax === 'slab80tta')!;
const slab = PS_OPTS.find((o) => o.tax === 'slab')!;

/** Tax actually charged, which is what the rules are stated in terms of. */
const taxPaid = (opt: ParkOption, gross: number, months: number, slabPct: number, regime?: 'new' | 'old') =>
  gross - psTax(opt, gross, months, slabPct, regime);

describe('§112A — long-term capital gains on equity', () => {
  it('exempts the first ₹1.25 lakh and charges 12.5% above it', () => {
    expect(taxPaid(equity, 200000, 12, 0.3)).toBeCloseTo((200000 - 125000) * 0.125, 6);
  });

  it('charges nothing at or below the exemption', () => {
    expect(taxPaid(equity, 125000, 12, 0.3)).toBeCloseTo(0, 6);
    expect(taxPaid(equity, 50000, 24, 0.3)).toBeCloseTo(0, 6);
  });

  /**
   * The regression. ₹1.25 lakh is an annual allowance; it does not grow with
   * the holding period. The old code computed `125000 * (months / 12)`, which
   * handed a 15-month holding ₹1,56,250 — above the statutory ceiling.
   */
  it('does not scale the exemption with the holding period', () => {
    const gross = 300000;
    const at12 = taxPaid(equity, gross, 12, 0.3);
    for (const months of [13, 15, 24, 36, 120]) {
      expect(taxPaid(equity, gross, months, 0.3), `${months} months`).toBeCloseTo(at12, 6);
    }
  });

  it('never exempts more than the statutory ceiling', () => {
    for (const months of [12, 15, 24, 60]) {
      const gross = 500000;
      const exempted = gross - taxPaid(equity, gross, months, 0.3) / TAX_RULES.LTCG_RATE;
      expect(exempted).toBeLessThanOrEqual(TAX_RULES.LTCG_EXEMPTION + 1e-6);
    }
  });

  it('is independent of the income-tax slab', () => {
    const a = taxPaid(equity, 200000, 15, 0);
    const b = taxPaid(equity, 200000, 15, 0.3);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('§111A — short-term capital gains on equity', () => {
  it('charges a flat 20% below twelve months, with no exemption', () => {
    expect(taxPaid(equity, 100000, 6, 0.05)).toBeCloseTo(20000, 6);
    expect(taxPaid(equity, 100000, 11.9, 0.3)).toBeCloseTo(20000, 6);
  });

  it('switches to long-term treatment exactly at twelve months', () => {
    expect(taxPaid(equity, 100000, 11.99, 0.3)).toBeCloseTo(20000, 6);
    // At 12 months the whole ₹1 lakh sits under the ₹1.25 lakh exemption.
    expect(taxPaid(equity, 100000, 12, 0.3)).toBeCloseTo(0, 6);
  });
});

describe('§80TTA — savings-account interest', () => {
  it('exempts ₹10,000 under the old regime, then charges slab', () => {
    expect(taxPaid(savings, 25000, 12, 0.3, 'old')).toBeCloseTo((25000 - 10000) * 0.3, 6);
  });

  /**
   * The second regression, and the one that affected the most users: §80TTA is
   * an old-regime deduction. The original granted it unconditionally, so every
   * new-regime visitor — the default since FY 2023-24 — was shown a savings
   * account yielding more after tax than it actually does.
   */
  it('grants nothing under the new regime', () => {
    expect(taxPaid(savings, 25000, 12, 0.3, 'new')).toBeCloseTo(25000 * 0.3, 6);
  });

  it('defaults to the new regime when the caller does not say', () => {
    expect(psTax(savings, 25000, 12, 0.3)).toBe(psTax(savings, 25000, 12, 0.3, 'new'));
  });

  it('does not scale the deduction with the holding period', () => {
    const gross = 40000;
    const at12 = taxPaid(savings, gross, 12, 0.3, 'old');
    for (const months of [1, 3, 6, 15, 24]) {
      expect(taxPaid(savings, gross, months, 0.3, 'old'), `${months} months`).toBeCloseTo(at12, 6);
    }
  });

  it('never exempts more than ₹10,000', () => {
    for (const months of [0.5, 6, 15, 36]) {
      const gross = 60000;
      const taxable = taxPaid(savings, gross, months, 0.3, 'old') / 0.3;
      expect(gross - taxable).toBeLessThanOrEqual(TAX_RULES.S80TTA_LIMIT + 1e-6);
    }
  });
});

describe('slab-taxed options', () => {
  it('charge the full slab with no allowance, in either regime', () => {
    expect(taxPaid(slab, 50000, 9, 0.3, 'old')).toBeCloseTo(15000, 6);
    expect(taxPaid(slab, 50000, 9, 0.3, 'new')).toBeCloseTo(15000, 6);
  });
});

describe('the ranking honours the regime', () => {
  /**
   * The point of threading the regime through: it can change which instrument
   * wins. A savings account keeping its §80TTA deduction is worth more to an
   * old-regime filer than to a new-regime one, so the net must differ.
   */
  it('values a savings account higher under the old regime', () => {
    const old = computeParkSmart(500000, '6-12', 0.3, 'old');
    const neu = computeParkSmart(500000, '6-12', 0.3, 'new');
    const sav = (r: ReturnType<typeof computeParkSmart>) =>
      r.ranked.find((o) => o.tax === 'slab80tta')!.net;
    expect(sav(old)).toBeGreaterThan(sav(neu));
  });

  it('leaves options with no allowance untouched by the regime', () => {
    const old = computeParkSmart(500000, '6-12', 0.3, 'old');
    const neu = computeParkSmart(500000, '6-12', 0.3, 'new');
    const plain = (r: ReturnType<typeof computeParkSmart>) =>
      r.ranked.filter((o) => o.tax === 'slab').map((o) => o.net);
    expect(plain(old)).toEqual(plain(neu));
  });

  it('still rejects amounts under ₹1,000', () => {
    expect(computeParkSmart(500, '3-6', 0.2).valid).toBe(false);
  });

  it('keeps the ranking sorted by net return', () => {
    const r = computeParkSmart(1000000, '12+', 0.3, 'old');
    const nets = r.ranked.map((o) => o.net);
    expect([...nets].sort((a, b) => b - a)).toEqual(nets);
    expect(r.best).toBe(r.ranked[0]);
  });
});
