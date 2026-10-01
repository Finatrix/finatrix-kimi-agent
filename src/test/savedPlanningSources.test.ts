import { beforeEach, describe, expect, it } from 'vitest';
import { readDashboard } from '../tools/lib/dashboard';
import { readLifeMapSeed } from '../tools/lib/lifemapSeed';
import { getMonthEvents } from '../tools/lib/calendar';
import { computeInvestMatch, IM_DEFAULTS } from '../tools/lib/investmatch';
import { marketFor } from '../tools/lib/markets';
import { currentMonth } from '../tools/lib/month';

const month = currentMonth();
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('fx_market', 'IN');
  localStorage.setItem('fx_currency', 'INR');
});

describe('saved investment sources', () => {
  it.each(Object.keys(IM_DEFAULTS))('never fills a missing %s answer with a default', (key) => {
    const answers: Record<string, unknown> = { ...IM_DEFAULTS };
    delete answers[key];
    localStorage.setItem('fx_investmatch', JSON.stringify({ a: answers }));
    expect(readDashboard().invest).toBeNull();
    expect(getMonthEvents(month).filter((event) => event.type === 'invest')).toEqual([]);
    expect(readLifeMapSeed().values['lm-sip']).toBeUndefined();
  });

  it.each([
    { currency: 'USD', market: 'IN' },
    { currency: 'INR', market: 'US' },
    { currency: 'AUD' },
    { market: 'AU' },
  ])('rejects a known context mismatch: %j', (context) => {
    localStorage.setItem('fx_investmatch', JSON.stringify({ a: IM_DEFAULTS, ...context }));
    expect(readDashboard().invest).toBeNull();
    expect(getMonthEvents(month).filter((event) => event.type === 'invest')).toEqual([]);
  });

  it.each([{ monthly: '1000' }, { income: null }, { risk: 'unknown' }, { horizon: '' }, { goal: 'unknown' }])('rejects malformed complete answers: %j', (patch) => {
    localStorage.setItem('fx_investmatch', JSON.stringify({ a: { ...IM_DEFAULTS, ...patch } }));
    expect(readDashboard().invest).toBeNull();
  });

  it('keeps complete legacy records compatible while identifying their unknown provenance', () => {
    localStorage.setItem('fx_investmatch', JSON.stringify({ a: IM_DEFAULTS }));
    const expected = computeInvestMatch(IM_DEFAULTS, marketFor('IN').invest);
    expect(readDashboard().invest).toMatchObject({
      monthly: IM_DEFAULTS.monthly, projected: Math.round(expected.fv), provenance: 'legacy',
    });
  });

  it('uses unchanged calculations for complete, matching saved answers', () => {
    const saved = { a: { ...IM_DEFAULTS, monthly: 1234.56 }, market: 'IN', currency: 'INR' };
    localStorage.setItem('fx_investmatch', JSON.stringify(saved));
    const expected = computeInvestMatch(saved.a, marketFor('IN').invest);
    expect(readDashboard().invest).toMatchObject({ monthly: 1234.56, projected: Math.round(expected.fv), provenance: 'confirmed' });
    expect(JSON.parse(localStorage.getItem('fx_investmatch')!)).toEqual(saved);
  });
});

describe('LifeMap uses converted Net Worth source amounts', () => {
  it('converts foreign assets and liabilities using current overrides, excluding property as before', () => {
    localStorage.setItem('fx_fx_overrides', JSON.stringify({ INR: 90 }));
    localStorage.setItem('fx_networth', JSON.stringify([
      { id: 'usd', name: 'US cash', kind: 'asset', category: 'cash', currency: 'USD', balances: { [month]: 1000 } },
      { id: 'inr', name: 'Local cash', kind: 'asset', category: 'cash', balances: { [month]: 1000 } },
      { id: 'invest', name: 'Equity', kind: 'asset', category: 'equity', currency: 'USD', balances: { [month]: 500 } },
      { id: 'loan', name: 'Loan', kind: 'liability', category: 'home_loan', currency: 'USD', balances: { [month]: 100 } },
      { id: 'house', name: 'House', kind: 'asset', category: 'property', currency: 'USD', balances: { [month]: 100000 } },
    ]));
    const seed = readLifeMapSeed();
    expect(seed.values['lm-savings']).toBe('91000');
    expect(seed.values['lm-invest']).toBe('45000');
    expect(seed.values['lm-debt-total']).toBe('9000');
    expect(seed.sources['lm-savings']).toBe('Net Worth');
  });

  it('respects a USD display and leaves unlabelled account balances in that display currency', () => {
    localStorage.setItem('fx_currency', 'USD');
    localStorage.setItem('fx_networth', JSON.stringify([
      { id: 'inr', name: 'IN cash', kind: 'asset', category: 'cash', currency: 'INR', balances: { [month]: 88000 } },
      { id: 'cash', name: 'Display currency', kind: 'asset', category: 'cash', balances: { [month]: 500 } },
    ]));
    expect(readLifeMapSeed().values['lm-savings']).toBe('1500');
    expect(readDashboard().netWorth?.assets).toBe(1500);
  });
});
