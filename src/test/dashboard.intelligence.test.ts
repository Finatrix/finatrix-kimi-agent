import { describe, it, expect, beforeEach } from 'vitest';
import { readDashboard } from '../tools/lib/dashboard';
import { currentMonth } from '../tools/lib/month';

/** First day of the calendar month `back` months before the current month. */
function monthKey(back: number): string {
  const [y, m] = currentMonth().split('-').map(Number);
  const d = new Date(y, (m - 1) - back, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

describe('Personal Finance Intelligence — spend trend insight', () => {
  beforeEach(() => localStorage.clear());

  it('flags a meaningful month-over-month spending increase (derived, not fabricated)', () => {
    const thisMonth = `${monthKey(0)}-05`;
    const lastMonth = `${monthKey(1)}-05`;
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: 'a', amount: 10000, category: 'rent', date: lastMonth },
      { id: 'b', amount: 15000, category: 'rent', date: thisMonth }, // +50%
    ]));
    const snap = readDashboard();
    expect(snap.insights.some((i) => i.tone === 'warn' && /up 50% vs last month/i.test(i.text))).toBe(true);
  });

  it('celebrates a meaningful decrease', () => {
    const thisMonth = `${monthKey(0)}-05`;
    const lastMonth = `${monthKey(1)}-05`;
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: 'a', amount: 20000, category: 'rent', date: lastMonth },
      { id: 'b', amount: 10000, category: 'rent', date: thisMonth }, // -50%
    ]));
    const snap = readDashboard();
    expect(snap.insights.some((i) => i.tone === 'ok' && /down 50% vs last month/i.test(i.text))).toBe(true);
  });

  it('stays silent when there is no prior-month data (never invents a trend)', () => {
    const thisMonth = `${monthKey(0)}-05`;
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: 'b', amount: 15000, category: 'rent', date: thisMonth },
    ]));
    const snap = readDashboard();
    expect(snap.insights.every((i) => !/vs last month/i.test(i.text))).toBe(true);
  });
});

/**
 * The dashboard's net worth block.
 *
 * It exists to prove two properties rather than the arithmetic (which is
 * covered in netWorth.test.ts): that the dashboard reads the tool's own model
 * instead of re-deriving the figure, and that adding it left the journey and
 * the health score — which describe how much has been SET UP — untouched.
 */
describe('dashboard — net worth', () => {
  beforeEach(() => localStorage.clear());

  const seedAccounts = () =>
    localStorage.setItem('fx_networth', JSON.stringify([
      { id: 'a', name: 'Savings', kind: 'asset', category: 'cash', balances: { [monthKey(1)]: 100000, [monthKey(0)]: 140000 } },
      { id: 'l', name: 'Card', kind: 'liability', category: 'credit_card', balances: { [monthKey(0)]: 40000 } },
    ]));

  it('reports nothing at all when no account has been recorded', () => {
    expect(readDashboard().netWorth).toBeNull();
  });

  it('reports the current balance sheet and the month-over-month change', () => {
    seedAccounts();
    const nw = readDashboard().netWorth!;
    expect(nw).toMatchObject({ month: currentMonth(), assets: 140000, liabilities: 40000, net: 100000 });
    expect(nw.change).toEqual({ abs: 0, pct: 0 }); // 100,000 last month → 100,000 now
  });

  it('does not become a journey step or move the health score', () => {
    const before = readDashboard();
    seedAccounts();
    const after = readDashboard();
    expect(after.totalPillars).toBe(before.totalPillars);
    expect(after.pillars.map((p) => p.id)).toEqual(before.pillars.map((p) => p.id));
    expect(after.healthScore).toBe(before.healthScore);
  });

  it('survives corrupt net worth storage without taking the dashboard down', () => {
    localStorage.setItem('fx_networth', '{"not":"an array"}');
    expect(() => readDashboard()).not.toThrow();
    expect(readDashboard().netWorth).toBeNull();
  });
});

/**
 * LifeMap on the dashboard.
 *
 * Presence was all the dashboard knew about LifeMap: it could say the tool had
 * been opened and nothing about what it said. That made the product's most
 * distinctive output the only one that never reached the page meant to be the
 * user's financial home.
 *
 * Like `netWorth` above, this is deliberately outside the journey and the
 * health score — it is a PROJECTION, and folding a modelled figure into a score
 * that describes real progress would make the score partly fictional.
 */
describe('dashboard — LifeMap', () => {
  beforeEach(() => localStorage.clear());

  const seedProfile = (over: Record<string, string> = {}) =>
    localStorage.setItem('fx_lifemap', JSON.stringify({
      'lm-name': 'Test', 'lm-age': '30', 'lm-income': '90000', 'lm-expenses': '50000',
      'lm-savings': '200000', 'lm-emergency': '100000', 'lm-invest': '300000',
      'lm-sip-yn': 'yes', 'lm-sip': '15000', 'lm-debt-yn': 'no',
      'lm-debt-total': '0', 'lm-debt-emi': '0', 'lm-career': 'tech', ...over,
    }));

  it('reports nothing before a profile has been built', () => {
    expect(readDashboard().lifemap).toBeNull();
  });

  it('projects to 60 from the profile, and states the gap between the two paths', () => {
    seedProfile();
    const lm = readDashboard().lifemap!;
    expect(lm.age).toBe(30);
    expect(lm.surplus).toBe(40000); // 90,000 income − 50,000 expenses
    expect(lm.projected).toBeGreaterThan(0);
    expect(lm.gap).toBeGreaterThan(0);
  });

  it('agrees with LifeMap itself, because it runs the same functions', async () => {
    seedProfile();
    const { buildProfile, calcWealth } = await import('../tools/lib/lifemap');
    const profile = buildProfile({
      name: 'Test', age: 30, income: 90000, expenses: 50000, savings: 200000,
      emergency: 100000, invest: 300000, sipYn: true, sip: 15000,
      debtYn: false, debtTotal: 0, debtEmi: 0, career: 'tech', goals: [],
    });
    expect(readDashboard().lifemap!.projected).toBe(calcWealth(profile, [], new Set(), 60, true));
  });

  it('shows the baseline, with no decision toggles applied', () => {
    // The card must not depend on switches the user flipped once inside the
    // tool and cannot see from the dashboard.
    seedProfile();
    const withoutDecisions = readDashboard().lifemap!.projected;
    seedProfile({ 'lm-career': 'tech' });
    expect(readDashboard().lifemap!.projected).toBe(withoutDecisions);
  });

  it('ignores a profile with no usable income or age', () => {
    seedProfile({ 'lm-income': '0' });
    expect(readDashboard().lifemap).toBeNull();
  });

  it('marks the existing journey step done without adding a new one', () => {
    // LifeMap has always been one of the pillars — unlike net worth — so
    // building a profile does complete a step. What must not change is how many
    // steps there are: reading a projection is not a ninth thing to set up.
    const before = readDashboard();
    seedProfile();
    const after = readDashboard();
    expect(after.totalPillars).toBe(before.totalPillars);
    expect(after.pillars.find((p) => p.id === 'lifemap')!.done).toBe(true);
  });

  it('keeps the projected figure out of the health score', () => {
    // Two profiles whose projections differ by an order of magnitude. The score
    // describes how much of the journey is set up; letting a modelled figure
    // move it would make a real progress number partly fictional.
    seedProfile({ 'lm-invest': '10000', 'lm-sip': '1000' });
    const modest = readDashboard();
    seedProfile({ 'lm-invest': '5000000', 'lm-sip': '200000' });
    const large = readDashboard();
    expect(large.lifemap!.projected).toBeGreaterThan(modest.lifemap!.projected * 2);
    expect(large.healthScore).toBe(modest.healthScore);
  });

  it('survives corrupt LifeMap storage without taking the dashboard down', () => {
    localStorage.setItem('fx_lifemap', '{{ not json');
    expect(() => readDashboard()).not.toThrow();
    expect(readDashboard().lifemap).toBeNull();
  });
});
