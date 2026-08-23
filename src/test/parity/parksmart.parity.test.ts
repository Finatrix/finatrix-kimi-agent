import { describe, it, expect } from 'vitest';
import toolsHtml from './__fixtures__/original-tools-app.html?raw';
import { evalOriginalConst, extractFnSource, compileScope } from './harness';
import { PS_OPTS, PS_M, PS_DL, psTax, type ParkOption } from '../../tools/lib/parksmart';

/**
 * ParkSmart parity — DATA only, deliberately.
 *
 * The instrument table, the duration→months map and the duration labels are
 * still the ported originals and are still pinned to the fixture.
 *
 * `psTax` is NOT, and this file no longer asserts that it is. The original
 * pro-rated two statutory allowances by holding period:
 *
 *     const exempt = 125000 * (months / 12);   // §112A LTCG
 *     const exempt = 10000  * (months / 12);   // §80TTA
 *
 * Both are per-financial-year, per-taxpayer allowances that do not scale with
 * how long anything was held. On the 15-month "over 1 year" bucket the first
 * line granted ₹1,56,250 of exemption — more than the statute allows. §80TTA
 * was also granted regardless of tax regime, though it is old-regime only.
 *
 * Parity is a tool for preventing accidental drift, not a reason to keep a
 * calculation that is wrong. Holding `psTax` to the fixture meant the test
 * suite actively defended the error: any correct implementation failed CI. So
 * the tax assertions moved to `parksmart.tax.test.ts`, which checks the rules
 * against the Income-tax Act rather than against the previous code.
 *
 * What this file still guarantees is that the divergence is confined to tax:
 * every input the two implementations share must still produce the same
 * pre-tax gross, and the cases where the law and the original agree must still
 * agree.
 */

describe('parksmart parity — data tables', () => {
  it('PS_OPTS / PS_M / PS_DL match the source', () => {
    expect(PS_OPTS).toEqual(evalOriginalConst(toolsHtml, 'PS_OPTS'));
    expect(PS_M).toEqual(evalOriginalConst(toolsHtml, 'PS_M'));
    expect(PS_DL).toEqual(evalOriginalConst(toolsHtml, 'PS_DL'));
  });
});

describe('parksmart parity — where the law and the original still agree', () => {
  const original = compileScope<
    (opt: ParkOption, gross: number, months: number, slab: number, amt: number) => number
  >([extractFnSource(toolsHtml, 'psTax')], 'psTax');

  const slabOnly = PS_OPTS.filter((o) => o.tax === 'slab');
  const equity = PS_OPTS.find((o) => o.tax === 'equity')!;

  /**
   * Plain slab options never touched an allowance, so they were correct and
   * must stay byte-identical. If these drift, the change was not confined to
   * the allowance handling.
   */
  it('slab-taxed options are unchanged', () => {
    for (const opt of slabOnly) {
      for (const gross of [0, 1000, 12500, 130000, 260000]) {
        for (const months of [0.5, 2, 4.5, 9, 15]) {
          for (const slab of [0, 0.2, 0.3]) {
            expect(psTax(opt, gross, months, slab), `${opt.n} ${gross} ${months}m ${slab}`)
              .toBe(original(opt, gross, months, slab, 100000));
          }
        }
      }
    }
  });

  /** Short-term equity used no allowance either — flat 20%, then and now. */
  it('short-term equity is unchanged', () => {
    for (const gross of [0, 1000, 130000, 260000]) {
      for (const months of [0.5, 2, 4.5, 9]) {
        expect(psTax(equity, gross, months, 0.3)).toBe(original(equity, gross, months, 0.3, 100000));
      }
    }
  });

  /**
   * And the one case that must NOT match: at 15 months the original granted a
   * pro-rated ₹1,56,250 exemption, so it under-taxed a gain that sits above the
   * statutory ₹1.25 lakh. Pinning the difference keeps this file honest about
   * what changed rather than silently dropping the comparison.
   */
  it('long-term equity above the exemption diverges, and in the right direction', () => {
    const gross = 200000;
    const months = 15;
    const now = psTax(equity, gross, months, 0.3);
    const before = original(equity, gross, months, 0.3, 100000);
    expect(before).toBeGreaterThan(now); // the old code kept more, by under-taxing
    // Old: exempt = 125000 * 15/12 = 156250 → taxable 43750 → tax 5468.75
    expect(before).toBeCloseTo(gross - (gross - 156250) * 0.125, 6);
    // New: exempt = 125000 → taxable 75000 → tax 9375
    expect(now).toBeCloseTo(gross - (gross - 125000) * 0.125, 6);
  });
});
