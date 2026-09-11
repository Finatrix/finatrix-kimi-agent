import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_CATS } from '../tools/lib/budget';
import { emergencyPlan, loadPlanning, monthlyReview, recurringPayments, savePlanning } from '../tools/lib/planning';
import type { ExpenseItem } from '../tools/lib/expense';
import { seedOnboarding } from '../tools/lib/onboarding';
import { currentMonth } from '../tools/lib/month';
import { readDashboard } from '../tools/lib/dashboard';
import { computeGoalPlanner } from '../tools/lib/goals';
import { MARKET_LIST } from '../tools/lib/markets';
import { computeInvestMatch, IM_DEFAULTS } from '../tools/lib/investmatch';
import { computeNetWorth, saveAccounts } from '../tools/lib/netWorth';
import { converterTo, effectiveRates } from '../tools/lib/fx';

beforeEach(() => localStorage.clear());
const expense = (id: string, date: string, amount: number, category = 'subscriptions'): ExpenseItem => ({ id, date, amount, category, merchant: 'Example merchant' });

describe('cash-reserve planning', () => {
  it('uses essentials, available cash and contributions without invented returns', () => {
    expect(emergencyPlan({ essentials: 2000, months: 6, saved: 2500, contribution: 1000 })).toMatchObject({ target: 12000, gap: 9500, coveredMonths: 1.25, monthsToTarget: 10 });
  });
  it('handles no essentials, no contribution and an already-funded target', () => {
    expect(emergencyPlan({ essentials: 0, months: 3, saved: 100, contribution: 0 })).toMatchObject({ coveredMonths: null, monthsToTarget: null });
    expect(emergencyPlan({ essentials: 1000, months: 3, saved: 100, contribution: 0 }).monthsToTarget).toBeNull();
    expect(emergencyPlan({ essentials: 1000, months: 3, saved: 4000, contribution: 0 })).toMatchObject({ gap: 0, progress: 100, monthsToTarget: 0 });
  });
  it('isolates currencies and tolerates malformed persisted state', () => {
    localStorage.setItem('fx_planning', JSON.stringify({ USD: { emergency: { essentials: 'bad', months: 999 }, recurring: { bad: 'evil' }, reviews: [] } }));
    const state = loadPlanning('USD');
    expect(state.emergency).toEqual({ essentials: 0, months: 24, saved: 0, contribution: 0 });
    state.emergency.saved = 900;
    savePlanning('USD', state);
    expect(loadPlanning('USD').emergency.saved).toBe(900);
    expect(loadPlanning('INR').emergency.saved).toBe(0);
  });
});

describe('ledger review and recurring payments', () => {
  it('separates investments/transfers from spending and includes refunds', () => {
    const items = [expense('1', '2026-08-01', 100), expense('2', '2026-08-02', -20), expense('3', '2026-08-03', 300, 'stocks'), expense('4', '2026-07-03', 150)];
    const review = monthlyReview(items, '2026-08', BUILTIN_CATS, BUILTIN_CATS);
    expect(review).toMatchObject({ count: 3, consumedTotal: 80, setAsideTotal: 300, difference: -70, plannedIncome: null });
  });
  it('does not imply a comparison when one month has no records', () => {
    expect(monthlyReview([expense('1', '2026-08-01', 100)], '2026-07', BUILTIN_CATS, BUILTIN_CATS).difference).toBeNull();
  });
  it('excludes investment patterns, future charges and stale patterns', () => {
    const items = [expense('1', '2026-07-01', 100), expense('2', '2026-08-01', 100), expense('3', '2026-07-01', 500, 'stocks'), expense('4', '2026-08-01', 500, 'stocks'), expense('5', '2026-10-01', 9999)];
    const patterns = recurringPayments(items, BUILTIN_CATS, '2026-09-10');
    expect(patterns).toHaveLength(1);
    expect(patterns[0].estimatedMonthly).toBe(100);
    expect(recurringPayments(items.slice(0, 2), BUILTIN_CATS, '2027-01-10')).toEqual([]);
  });
});

describe('setup preserves existing financial records', () => {
  const input = { code: 'INR', market: 'IN' as const, income: 50000, savings: 5000, goalName: 'Home', goalTarget: 1000000, goalYears: 10 };
  it('seeds only the entered values and does not invent an investor age or profile', () => {
    seedOnboarding(input);
    expect(JSON.parse(localStorage.getItem('fx_bb_data')!)[currentMonth()].vals).toEqual({ emergency: 5000 });
    expect(localStorage.getItem('fx_investmatch')).toBeNull();
  });
  it('keeps the original budget and goal when setup is repeated', () => {
    seedOnboarding(input);
    const budget = localStorage.getItem('fx_bb_data');
    const goal = localStorage.getItem('fx_goals');
    seedOnboarding({ ...input, income: 99999, goalName: 'Different', savings: 0 });
    expect(localStorage.getItem('fx_bb_data')).toBe(budget);
    expect(localStorage.getItem('fx_goals')).toBe(goal);
  });
});

describe('unified dashboard calculation parity', () => {
  it.each(MARKET_LIST)('uses the same goal and investment assumptions for $name', market => {
    localStorage.setItem('fx_market', market.id);
    localStorage.setItem('fx_goals', JSON.stringify({ 'gp-name': 'Home', 'gp-target': '1000000', 'gp-years': '10', 'gp-existing': '10000', 'gp-inflate': true }));
    localStorage.setItem('fx_investmatch', JSON.stringify({ a: IM_DEFAULTS }));
    const expected = computeGoalPlanner({ name: 'Home', targetToday: 1000000, years: 10, existing: 10000, inflate: true }, market.goals.inflation, market.goals.paths);
    const snapshot = readDashboard();
    expect(snapshot.goal?.monthlySip).toBe(Math.round(expected.results[0].monthly));
    expect(snapshot.invest?.projected).toBe(Math.round(computeInvestMatch(IM_DEFAULTS, market.invest).fv));
  });
  it('converts foreign accounts exactly as the Net Worth page does', () => {
    localStorage.setItem('fx_currency', 'INR');
    const accounts = [{ id: 'cash', name: 'USD bank', category: 'cash', kind: 'asset' as const, currency: 'USD', balances: { [currentMonth()]: 100 } }];
    saveAccounts(accounts);
    const expected = computeNetWorth(accounts, currentMonth(), { displayCurrency: 'INR', convert: converterTo('INR', effectiveRates()) });
    expect(readDashboard().netWorth?.net).toBe(expected.net);
    expect(expected.net).toBeGreaterThan(100);
  });
});
