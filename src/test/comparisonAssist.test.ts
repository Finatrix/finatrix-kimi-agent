import { describe, expect, it } from 'vitest';
import { investAnswerError, investScenarios, peerCashFlow, peerInputError, safeParkComparison } from '../tools/lib/comparisonAssist';
import { computeInvestMatch, IM_DEFAULTS, type ImAnswers } from '../tools/lib/investmatch';
import { computeParkSmart, type ParkInstruments } from '../tools/lib/parksmart';
import { MARKETS } from '../tools/lib/markets';

describe('comparison assistance accuracy boundaries', () => {
  it.each([NaN, Infinity, -1, 0, 99, 1e13])('rejects unsupported monthly investment %s without rewriting it', (monthly) => {
    const answers = { ...IM_DEFAULTS, monthly };
    expect(investAnswerError(answers)).not.toBeNull();
    expect(investScenarios(answers, MARKETS.IN.invest)).toEqual({ contributions: [], horizons: [] });
    expect(answers.monthly).toBe(monthly);
  });

  it('rejects unknown saved categories before accessing rate or allocation maps', () => {
    for (const key of ['risk', 'horizon', 'goal'] as const) {
      expect(investAnswerError({ ...IM_DEFAULTS, [key]: '__invalid__' })).toContain(key);
    }
    expect(investAnswerError({ ...IM_DEFAULTS, income: '50000' } as unknown as ImAnswers)).toContain('income');
  });

  it.each(Object.values(MARKETS))('uses original investment math and horizon caps for $id scenarios', (market) => {
    const answers = { ...market.invest.defaults, risk: 'aggressive', horizon: '10+' };
    const original = { ...answers };
    const scenarios = investScenarios(answers, market.invest);
    expect(scenarios.contributions).toHaveLength(3);
    for (const scenario of scenarios.contributions) {
      expect(scenario.result).toEqual(computeInvestMatch({ ...answers, monthly: scenario.monthly }, market.invest));
    }
    expect(scenarios.horizons.map(({ result }) => result.effRisk)).toEqual(['conservative', 'moderate', 'aggressive', 'aggressive']);
    for (const scenario of scenarios.horizons) {
      expect(scenario.result).toEqual(computeInvestMatch({ ...answers, horizon: scenario.horizon }, market.invest));
    }
    expect(answers).toEqual(original);
  });

  it('does not offer a contribution below the original calculator minimum', () => {
    const scenarios = investScenarios({ ...IM_DEFAULTS, monthly: 100 }, MARKETS.IN.invest);
    expect(scenarios.contributions.map(({ monthly }) => monthly)).toEqual([100, 120]);
  });

  it('guards unsupported durations, amounts, tax rates and empty eligibility', () => {
    const pack = MARKETS.IN.park;
    expect(safeParkComparison(100000, 'constructor', 0.2, pack)).toBeNull();
    expect(safeParkComparison(Infinity, '3-6', 0.2, pack)).toBeNull();
    expect(safeParkComparison(100000, '3-6', NaN, pack)).toBeNull();
    expect(safeParkComparison(100000, '3-6', 2, pack)).toBeNull();
    expect(safeParkComparison(100000, '3-6', 0.2, { ...pack, options: [] })).toBeNull();
    const lockedOnly = { ...pack, options: pack.options.filter((option) => !option.liquid) };
    expect(safeParkComparison(100000, '3-6', 0.2, lockedOnly, true)).toBeNull();
    expect(safeParkComparison(100000, '0-1', 0.2, lockedOnly)).toBeNull();
  });

  it('preserves exact return and tax calculations when filtering for accessible options', () => {
    const pack = MARKETS.IN.park;
    const baseline = computeParkSmart(100000, '6-12', 0.2, pack);
    expect(safeParkComparison(100000, '6-12', 0.2, pack)).toEqual(baseline);
    const filtered = safeParkComparison(100000, '6-12', 0.2, pack, true)!;
    expect(filtered.ranked.length).toBeGreaterThan(0);
    for (const option of filtered.ranked) {
      expect(option.liquid).toBe(true);
      expect(option).toEqual(baseline.ranked.find((original) => original.n === option.n));
    }
  });

  it('keeps an explicitly entered zero net rate valid and does not tax net rates twice', () => {
    const pack: ParkInstruments = {
      ...MARKETS.AU.park,
      options: [{ n: 'Cash', rate: 0, tax: 'enteredNet', liquid: true, minM: 0, risk: 'User checked', ic: 'bank', d: '' },
        { n: 'Quote', rate: 4, tax: 'enteredNet', liquid: false, minM: 0, risk: 'User checked', ic: 'bank', d: '' }],
    };
    const result = safeParkComparison(1000, '6-12', 0, pack)!;
    expect(result.ranked.map(({ net }) => net)).toEqual([30, 0]);
    expect(result.ranked[0].effRate).toBeCloseTo(4, 12);
    expect(safeParkComparison(1000, '0-1', 0, pack)?.ranked.map(({ n }) => n)).toEqual(['Cash']);
  });

  it('distinguishes valid zeros from missing or out-of-range peer values', () => {
    const input = { ...MARKETS.IN.peer.defaults, income: 0, savings: 0, invest: 0, debt: 0, rate: 0, expenses: 0 };
    expect(peerInputError(input, MARKETS.IN.peer)).toBeNull();
    expect(peerCashFlow(input)).toBeNull();
    expect(peerInputError({ ...input, income: NaN }, MARKETS.IN.peer)).toContain('income');
    expect(peerInputError({ ...input, age: 25.5 }, MARKETS.IN.peer)).toContain('whole years');
    expect(peerInputError({ ...input, rate: 101 }, MARKETS.IN.peer)).toContain('rate');
    expect(peerInputError({ ...input, cityKey: 'unknown' }, MARKETS.IN.peer)).toContain('location');
  });

  it('flags inconsistent savings without changing user inputs or treating debt payments as known', () => {
    const input = { ...MARKETS.IN.peer.defaults, income: 1000, expenses: 900, rate: 20 };
    expect(peerCashFlow(input)).toEqual({ surplus: 100, impliedSavings: 200, exceedsSurplus: true });
    expect(input.rate).toBe(20);
    expect(peerCashFlow({ ...input, rate: 10 })?.exceedsSurplus).toBe(false);
    expect(peerCashFlow({ ...input, expenses: 1200 })?.surplus).toBe(-200);
  });
});
