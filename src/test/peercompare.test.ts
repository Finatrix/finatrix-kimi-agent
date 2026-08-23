/**
 * PeerCompare, checked against its stated sources and guidelines.
 *
 * The property this suite exists to hold: every number the tool compares a user
 * against is either a published figure, arithmetic over the user's own inputs,
 * or a named planning convention — and the tool says which. It replaces a
 * parity suite that pinned the previous behaviour to a fixture and, in doing
 * so, defended an invented benchmark table, a mislabelled debt ratio and a
 * "percentile" that was not one.
 */

import { describe, it, expect } from 'vitest';
import {
  PC_CITIES,
  EXPENSE_SHARE_OF_INCOME,
  comparisonIndex,
  computePeerCompare,
  type PeerInput,
} from '../tools/lib/peercompare';
import {
  CITED_SOURCES,
  GUIDELINES,
  INCOME_BENCHMARK,
  PLFS_REGULAR_WAGE_MIDPOINT,
  PLFS_REGULAR_WAGE_MONTHLY,
  SAVINGS_RATE_BENCHMARK,
  SOURCES,
} from '../tools/lib/benchmarks';

const base: PeerInput = {
  age: 30, cityKey: 'mumbai', income: 50000, savings: 200000, invest: 100000,
  debt: 0, emi: 0, rate: 20, expenses: 30000,
};
const run = (over: Partial<PeerInput> = {}) => computePeerCompare({ ...base, ...over });
const metric = (r: ReturnType<typeof run>, k: string) => r.metrics.find((m) => m.k === k)!;

describe('every benchmark declares where it came from', () => {
  it('labels each metric measured, derived or a guideline', () => {
    for (const m of run().metrics) {
      expect(['measured', 'derived', 'guideline'], m.k).toContain(m.provenance);
      expect(m.basis.length, `${m.k} must say what it is based on`).toBeGreaterThan(20);
    }
  });

  it('gives every measured benchmark a real citation', () => {
    for (const m of run().metrics.filter((x) => x.provenance === 'measured')) {
      expect(m.sourceLabel, m.k).toBeTruthy();
      expect(m.sourceUrl, m.k).toMatch(/^https:\/\//);
    }
  });

  it('never attaches a source to a figure nobody published', () => {
    for (const m of run().metrics.filter((x) => x.provenance !== 'measured')) {
      expect(m.sourceLabel, `${m.k} is ${m.provenance} but cites a source`).toBeUndefined();
    }
  });

  it('cites publisher, period and release date for each source', () => {
    for (const s of CITED_SOURCES) {
      expect(s.publisher.length).toBeGreaterThan(3);
      expect(s.period.length).toBeGreaterThan(3);
      expect(s.released.length).toBeGreaterThan(3);
      expect(s.url).toMatch(/^https:\/\//);
    }
    expect(SOURCES.plfs2025.publisher).toMatch(/Ministry of Statistics/);
    expect(SOURCES.rbiAnnual2025.publisher).toMatch(/Reserve Bank of India/);
  });
});

describe('the income benchmark is the published PLFS figure', () => {
  it('uses the midpoint of the two published averages', () => {
    expect(PLFS_REGULAR_WAGE_MIDPOINT).toBe(
      Math.round((PLFS_REGULAR_WAGE_MONTHLY.male + PLFS_REGULAR_WAGE_MONTHLY.female) / 2),
    );
    expect(metric(run(), 'income').benchmark).toBe(PLFS_REGULAR_WAGE_MIDPOINT);
  });

  it('states that it is national, because MoSPI publishes no age or city split', () => {
    expect(INCOME_BENCHMARK.basis).toMatch(/National/i);
    expect(INCOME_BENCHMARK.basis).toMatch(/neither breakdown|no.*breakdown/i);
  });

  /**
   * The double-count that used to be here: the benchmark was already tiered
   * metro/tier-2/tier-3 and was then multiplied AGAIN by a cost-of-living
   * index, asserting that Kolkata salaries run below Chennai's because rent is
   * cheaper. Income must now be city-independent.
   */
  it('does not vary with the city', () => {
    const cities = Object.keys(PC_CITIES);
    const benchmarks = cities.map((cityKey) => metric(run({ cityKey }), 'income').benchmark);
    expect(new Set(benchmarks).size, 'income benchmark must not depend on city').toBe(1);
  });

  it('does not vary with age', () => {
    const benchmarks = [18, 25, 34, 45, 60, 70].map((age) => metric(run({ age }), 'income').benchmark);
    expect(new Set(benchmarks).size).toBe(1);
  });
});

describe('the savings-rate benchmark is the published RBI figure', () => {
  it('compares against net household financial savings', () => {
    expect(metric(run(), 'rate').benchmark).toBe(SAVINGS_RATE_BENCHMARK.value);
    expect(SAVINGS_RATE_BENCHMARK.value).toBe(7.0);
  });

  it('says it is a national-accounts aggregate, not a survey of individuals', () => {
    expect(SAVINGS_RATE_BENCHMARK.basis).toMatch(/national-accounts aggregate/i);
    expect(SAVINGS_RATE_BENCHMARK.basis).toMatch(/not a survey/i);
  });
});

describe('the expense benchmark is derived from the user, not from strangers', () => {
  it('is income × the post-saving share × the city cost index', () => {
    const cityKey = 'mumbai';
    const r = run({ cityKey, income: 100000 });
    const expected = Math.round(100000 * EXPENSE_SHARE_OF_INCOME * PC_CITIES[cityKey].col);
    expect(metric(r, 'expenses').benchmark).toBe(expected);
  });

  it('keeps the expense share consistent with the savings benchmark', () => {
    expect(EXPENSE_SHARE_OF_INCOME).toBeCloseTo((100 - SAVINGS_RATE_BENCHMARK.value) / 100, 10);
  });

  /** Cost of living belongs here, and only here. */
  it('scales with the city cost index', () => {
    const mumbai = metric(run({ cityKey: 'mumbai' }), 'expenses').benchmark;
    const kolkata = metric(run({ cityKey: 'kolkata' }), 'expenses').benchmark;
    expect(mumbai).toBeGreaterThan(kolkata);
  });
});

describe('the debt metric is a real debt-service ratio', () => {
  it('is EMIs over gross monthly income', () => {
    expect(run({ income: 100000, emi: 30000 }).debtServiceRatio).toBe(30);
    expect(run({ income: 80000, emi: 20000 }).debtServiceRatio).toBe(25);
  });

  it('ignores the outstanding balance', () => {
    const a = run({ income: 100000, emi: 25000, debt: 0 });
    const b = run({ income: 100000, emi: 25000, debt: 9_000_000 });
    expect(a.debtServiceRatio).toBe(b.debtServiceRatio);
  });

  /**
   * The regression in full. Someone with a ₹40 lakh home loan on ₹20 lakh a
   * year used to read 200% and be told to "clear high-interest loans before
   * adding investments". Their actual debt-service ratio is 30% — comfortably
   * inside the lending guideline — and they should now be told nothing of the
   * sort.
   */
  it('does not warn a healthy borrower with a large mortgage', () => {
    const r = run({ income: 166667, emi: 50000, debt: 4_000_000 });
    expect(r.debtServiceRatio).toBe(30);
    expect(r.debtServiceRatio).toBeLessThan(GUIDELINES.debtServiceComfortable);
    const titles = r.tips.map((t) => t[1]);
    expect(titles).not.toContain('Heavy debt load');
    expect(titles).not.toContain('Debt service is stretched');
    expect(titles).not.toContain('Debt service above the comfortable range');
  });

  it('does warn when EMIs genuinely dominate income', () => {
    const r = run({ income: 100000, emi: 50000 });
    expect(r.debtServiceRatio).toBe(50);
    expect(r.tips.map((t) => t[1])).toContain('Debt service is stretched');
  });

  it('treats no debt as the best possible ratio', () => {
    expect(metric(run({ emi: 0 }), 'debtService').status).toBe('ahead');
  });

  it('is zero, not NaN, when income is zero', () => {
    expect(run({ income: 0, emi: 5000 }).debtServiceRatio).toBe(0);
  });
});

describe('the comparison index is not a percentile', () => {
  it('returns 50 at parity with the benchmark', () => {
    expect(comparisonIndex(1)).toBe(50);
  });

  it('is monotonic in the ratio and stays inside 1..99', () => {
    let prev = -1;
    for (const ratio of [0.1, 0.25, 0.5, 0.8, 1, 1.5, 2, 5, 20, 100]) {
      const v = comparisonIndex(ratio);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(99);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('handles degenerate ratios without producing NaN', () => {
    for (const r of [-1, 0, NaN, Infinity]) {
      expect(Number.isFinite(comparisonIndex(r))).toBe(true);
    }
  });

  it('exposes the value as `index`, never as a percentile', () => {
    for (const m of run().metrics) {
      expect(m).toHaveProperty('index');
      expect(m).not.toHaveProperty('pct');
    }
  });
});

describe('the result no longer claims unpublished comparisons', () => {
  it('reports the user’s own net worth without a peer benchmark', () => {
    const r = run({ savings: 500000, invest: 300000, debt: 100000 });
    expect(r.nw).toBe(700000);
    expect(r.metrics.map((m) => m.k)).not.toContain('nw');
    expect(r.metrics.map((m) => m.k)).not.toContain('savings');
    expect(r.metrics.map((m) => m.k)).not.toContain('invest');
  });

  it('compares only the five measures it can actually source or derive', () => {
    expect(run().metrics.map((m) => m.k)).toEqual([
      'income', 'rate', 'expenses', 'emergency', 'debtService',
    ]);
  });
});

describe('emergency fund', () => {
  it('is savings over monthly expenses', () => {
    expect(run({ savings: 180000, expenses: 30000 }).eMonths).toBe(6);
  });

  it('warns below the three-month floor', () => {
    const r = run({ savings: 30000, expenses: 30000 });
    expect(r.eMonths).toBe(1);
    expect(r.tips.map((t) => t[1])).toContain('Thin emergency buffer');
  });

  it('reports Infinity rather than a magic 99 when there are no expenses', () => {
    expect(run({ expenses: 0, savings: 100000 }).eMonths).toBe(Infinity);
    expect(run({ expenses: 0, savings: 0 }).eMonths).toBe(0);
  });
});

describe('scoring stays well-formed', () => {
  it('produces a score inside 1..99 for any input', () => {
    const cases: Partial<PeerInput>[] = [
      {},
      { income: 0, savings: 0, invest: 0, debt: 0, emi: 0, rate: 0, expenses: 0 },
      { income: 5_000_000, savings: 90_000_000, invest: 90_000_000, rate: 90, expenses: 10000 },
      { income: 9000, savings: 0, invest: 0, debt: 900000, emi: 8000, rate: 0, expenses: 20000 },
    ];
    for (const c of cases) {
      const r = run(c);
      expect(r.score).toBeGreaterThanOrEqual(1);
      expect(r.score).toBeLessThanOrEqual(99);
      expect(Number.isFinite(r.score)).toBe(true);
    }
  });

  it('clamps age into the supported range', () => {
    expect(run({ age: 5 }).age).toBe(18);
    expect(run({ age: 120 }).age).toBe(70);
  });

  it('falls back to a known city for an unknown key', () => {
    expect(run({ cityKey: 'atlantis' }).city).toBe(PC_CITIES.tier2other);
  });
});
