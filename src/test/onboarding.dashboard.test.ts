import { describe, it, expect, beforeEach } from 'vitest';
import { store, setJSON } from '../tools/lib/storage';
import { currentMonth } from '../tools/lib/month';
import { readDashboard } from '../tools/lib/dashboard';

/**
 * Guards the onboarding → dashboard contract: the exact shapes Onboarding.persist()
 * writes must produce a populated, correct dashboard snapshot (no fabricated data).
 * If either side drifts, this test fails.
 */
describe('onboarding → dashboard data contract', () => {
  beforeEach(() => localStorage.clear());

  it('lights up income, savings rate, investor profile and goal', () => {
    // Mirror Onboarding.persist() exactly (₹80k income, ₹16k/mo set aside, House goal).
    store.set('fx_currency', 'INR');
    const cm = currentMonth();
    setJSON('fx_bb_data', { [cm]: { income: '80000', n: '50', w: '30', s: '20', vals: { emergency: 16000 } } });
    setJSON('fx_investmatch', { a: { age: 28, income: 80000, monthly: 16000, risk: 'moderate', horizon: '5-10', goal: 'wealth' } });
    setJSON('fx_goals', { 'gp-name': 'House', 'gp-target': '2000000', 'gp-years': '10', 'gp-existing': '0', 'gp-inflate': true });

    const s = readDashboard();
    expect(s.income).toBe(80000);
    expect(s.savingsRatePct).toBe(20);
    expect(s.invest?.profile).toBe('Moderate');
    expect(s.invest?.projected).toBeGreaterThan(0);
    expect(s.goal?.name).toBe('House');
    expect(s.goal?.monthlySip).toBeGreaterThan(0);
    expect(s.healthScore).not.toBeNull();
    expect(s.activeCount).toBeGreaterThanOrEqual(3);
  });

  it('stays empty (no fabricated figures) when nothing is set up', () => {
    const s = readDashboard();
    expect(s.hasAnyData).toBe(false);
    expect(s.income).toBeNull();
    expect(s.healthScore).toBeNull();
    expect(s.nextAction?.href).toBe('/tools/budget');
  });
});
