import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MONEY_CAL_PREFS, MONEY_CAL_KEY, everydayAverage, loadMoneyCalPrefs, patternKey, projectMoney,
  saveMoneyCalPrefs, toggleSkipped, type ProjectionInput,
} from '../tools/lib/moneyCalendar';
import { computeCommitments } from '../tools/lib/commitments';
import type { ExpenseItem } from '../tools/lib/expense';
import type { CatMeta } from '../tools/lib/expenseAnalytics';

// Pinned at the top level, not in beforeEach: anything that reads the clock at
// import time must agree with the fixtures below.
vi.useFakeTimers({ shouldAdvanceTime: true });
/** 10 August 2026, noon: mid-month, so "ahead" and "passed" are stable. */
const NOW = new Date(2026, 7, 10, 12);
vi.setSystemTime(NOW);

const CATS = new Map<string, CatMeta>(
  ([
    { k: 'rent', l: 'Rent', ic: 'rent', section: 'needs' },
    { k: 'utilities', l: 'Utilities', ic: 'bills', section: 'needs' },
    { k: 'groceries', l: 'Groceries', ic: 'grocery', section: 'needs' },
    { k: 'subscriptions', l: 'Subscriptions', ic: 'subs', section: 'wants' },
    { k: 'shopping', l: 'Shopping', ic: 'shopping', section: 'wants' },
    { k: 'stocks', l: 'Stocks / Equity', ic: 'trending', section: 'save' },
  ] satisfies CatMeta[]).map((c) => [c.k, c]),
);

let seq = 0;
function tx(date: string, amount: number, category: string, merchant?: string, extra: Partial<ExpenseItem> = {}): ExpenseItem {
  seq += 1;
  return { id: `t${seq}`, date, amount, category, ...(merchant ? { merchant } : {}), ...extra };
}

/**
 * The worked example in the PR description.
 *   Rent ₹20,000 on the 3rd (paid this month), electricity ₹1,700/1,800/1,900
 *   on the 15th (average ₹1,800, not yet paid), Netflix ₹649 on the 18th, a
 *   ₹5,000 SIP on the 5th (paid this month), and ₹46,000 of one-off spending
 *   over May–July (92 days, so ₹500 a day).
 */
function ledger(): ExpenseItem[] {
  return [
    ...['05', '06', '07', '08'].map((m) => tx(`2026-${m}-03`, 20000, 'rent', 'Landlord')),
    tx('2026-05-15', 1700, 'utilities', 'Power'),
    tx('2026-06-15', 1800, 'utilities', 'Power'),
    tx('2026-07-15', 1900, 'utilities', 'Power'),
    ...['05', '06', '07'].map((m) => tx(`2026-${m}-18`, 649, 'subscriptions', 'Netflix')),
    ...['05', '06', '07', '08'].map((m) => tx(`2026-${m}-05`, 5000, 'stocks', 'SIP')),
    tx('2026-05-01', 10000, 'groceries', 'Big Bazaar'),
    tx('2026-06-12', 16000, 'shopping', 'Croma'),
    tx('2026-07-20', 20000, 'shopping', 'Ikea'),
  ];
}

function input(over: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    items: ledger(), catMeta: CATS, now: NOW, horizon: 30,
    balance: { amount: 42000, asOf: '2026-08-10' },
    salary: { amount: 60000, day: 1 },
    everyday: true, skipped: [], ...over,
  };
}

const day = (p: ReturnType<typeof projectMoney>, date: string) => p.days.find((d) => d.date === date)!;

describe('projectMoney — worked example', () => {
  const p = projectMoney(input());

  it('covers today plus the next 30 days', () => {
    expect(p.today).toBe('2026-08-10');
    expect(p.end).toBe('2026-09-09');
    expect(p.days).toHaveLength(31);
  });

  it('spreads ₹46,000 of one-off spending over 92 days as ₹500 a day', () => {
    expect(p.everydayBasis).toEqual({ perDay: 500, total: 46000, days: 92, from: '2026-05-01', to: '2026-07-31' });
    expect(day(p, '2026-08-10').everyday).toBe(0);
    expect(day(p, '2026-08-11').everyday).toBe(500);
  });

  it('places each payment on its usual day and skips what is already paid this month', () => {
    const flows = p.days.flatMap((d) => d.flows.map((f) => [d.date, f.kind, f.label, f.amount]));
    expect(flows).toEqual([
      ['2026-08-15', 'bill', 'Power', 1800],
      ['2026-08-18', 'bill', 'Netflix', 649],
      ['2026-09-01', 'salary', 'Salary', 60000],
      ['2026-09-03', 'bill', 'Landlord', 20000],
      ['2026-09-05', 'saving', 'SIP', 5000],
    ]);
  });

  it('runs the balance day by day', () => {
    expect(day(p, '2026-08-10').balance).toBe(42000);
    expect(day(p, '2026-08-15').balance).toBe(37700);
    expect(day(p, '2026-08-18').balance).toBe(35551);
    expect(day(p, '2026-08-31').balance).toBe(29051);
    expect(day(p, '2026-09-01').balance).toBe(88551);
    expect(day(p, '2026-09-09').balance).toBe(59551);
  });

  it('totals the window and finds the low point before payday', () => {
    expect(p.totals).toEqual({ salary: 60000, bills: 22449, savings: 5000, everyday: 15000, net: 17551 });
    expect(p.low).toEqual({ date: '2026-08-31', balance: 29051 });
    expect(p.shortfall).toBeNull();
  });

  it('agrees with computeCommitments on what is still to pay this month', () => {
    const c = computeCommitments(ledger(), CATS, '2026-08', NOW, null);
    const ours = p.days.filter((d) => d.date.startsWith('2026-08')).flatMap((d) => d.flows
      .filter((f) => f.kind === 'bill').map((f) => [d.date, f.amount]));
    expect(ours).toEqual(c.bills.map((b) => [b.date, b.amount]));
  });
});

describe('projectMoney — shortfall', () => {
  it('warns at the first day below zero, with the deepest point rounded up to 100', () => {
    const p = projectMoney(input({ balance: { amount: 12000, asOf: '2026-08-10' } }));
    expect(day(p, '2026-08-29').balance).toBe(51);
    expect(day(p, '2026-08-30').balance).toBe(-449);
    expect(day(p, '2026-08-31').balance).toBe(-949);
    expect(p.shortfall).toEqual({ date: '2026-08-30', lowDate: '2026-08-31', amount: 949, about: 1000 });
    expect(p.low).toEqual({ date: '2026-08-31', balance: -949 });
  });

  it('has no low point or shortfall without a balance, but still tracks the change', () => {
    const p = projectMoney(input({ balance: null }));
    expect(p.balanceStatus).toBe('none');
    expect(p.days.every((d) => d.balance === null)).toBe(true);
    expect(p.low).toBeNull();
    expect(p.shortfall).toBeNull();
    expect(day(p, '2026-08-31').change).toBe(-12949);
    expect(p.totals.net).toBe(17551);
  });
});

describe('projectMoney — the starting balance', () => {
  it('carries an older balance forward: minus what was logged since, plus paydays since', () => {
    const items = [...ledger(), tx('2026-08-07', 2000, 'groceries', 'DMart'), tx('2026-07-30', 999, 'groceries', 'Same day')];
    const p = projectMoney(input({ items, balance: { amount: 50000, asOf: '2026-07-30' } }));
    // Logged after 30 July: rent 20,000 + SIP 5,000 + DMart 2,000. Payday 1 August: +60,000.
    expect(p.start).toEqual({
      typed: 50000, asOf: '2026-07-30', ageDays: 11, loggedSince: 27000, salarySince: 60000, amount: 83000, stale: true,
    });
    expect(day(p, '2026-08-10').balance).toBe(83000);
  });

  it('ignores a balance older than 31 days', () => {
    const p = projectMoney(input({ balance: { amount: 50000, asOf: '2026-07-09' } }));
    expect(p.balanceStatus).toBe('expired');
    expect(p.start).toBeNull();
    expect(p.low).toBeNull();
  });

  it('uses a 31-day-old balance, and calls a 7-day-old one fresh', () => {
    expect(projectMoney(input({ balance: { amount: 1, asOf: '2026-07-10' } })).balanceStatus).toBe('ok');
    expect(projectMoney(input({ balance: { amount: 1, asOf: '2026-08-03' } })).start?.stale).toBe(false);
  });

  it('does not add salary landing on the day the balance was typed — it may already be in it', () => {
    const today = projectMoney(input({ salary: { amount: 60000, day: 10 } }));
    expect(day(today, '2026-08-10').inflow).toBe(0);
    expect(day(today, '2026-09-09').inflow).toBe(0);
    expect(day(today, '2026-09-10')).toBeUndefined();

    const yesterday = projectMoney(input({ salary: { amount: 60000, day: 10 }, balance: { amount: 0, asOf: '2026-08-09' } }));
    expect(day(yesterday, '2026-08-10').inflow).toBe(60000);
  });

  it('counts money out only from spending and savings categories when carrying forward', () => {
    const items = [...ledger(), tx('2026-08-08', 9999, 'transfers', 'Own account')];
    const p = projectMoney(input({ items, balance: { amount: 30000, asOf: '2026-08-06' } }));
    expect(p.start?.loggedSince).toBe(0);
  });
});

describe('projectMoney — salary dates', () => {
  it('clamps a payday of the 31st to short months and crosses the year', () => {
    const p = projectMoney(input({
      now: new Date(2026, 11, 20, 12), horizon: 90, items: [],
      salary: { amount: 1000, day: 31 }, balance: { amount: 0, asOf: '2026-12-20' },
    }));
    expect(p.days.filter((d) => d.inflow > 0).map((d) => d.date)).toEqual(['2026-12-31', '2027-01-31', '2027-02-28']);
  });

  it('adds no salary without a payday or an amount', () => {
    expect(projectMoney(input({ salary: null })).totals.salary).toBe(0);
    expect(projectMoney(input({ salary: { amount: 0, day: 1 } })).totals.salary).toBe(0);
  });
});

describe('projectMoney — what counts', () => {
  it('lists every pattern, and leaves a skipped one out of the estimate', () => {
    const key = patternKey('subscriptions', 'Netflix');
    const p = projectMoney(input({ skipped: [key] }));
    expect(p.recurring.find((r) => r.key === key)).toMatchObject({ name: 'Netflix', included: false, amount: 649, day: 18 });
    expect(p.days.flatMap((d) => d.flows).some((f) => f.label === 'Netflix')).toBe(false);
    // A skipped pattern does not turn into "everyday" spending either.
    expect(p.everydayBasis?.total).toBe(46000);
  });

  it('leaves out transfers and income patterns, whose direction is unknown', () => {
    const items = [
      ...ledger(),
      ...['05', '06', '07'].map((m) => tx(`2026-${m}-25`, 3000, 'transfers', 'Mum')),
      ...['05', '06', '07'].map((m) => tx(`2026-${m}-01`, 60000, 'income', 'Employer')),
    ];
    const p = projectMoney(input({ items }));
    expect(p.recurring.map((r) => r.name)).toEqual(['Landlord', 'SIP', 'Power', 'Netflix']);
    expect(p.everydayBasis?.total).toBe(46000);
  });

  it('does not project past months of a payment whose day has passed unpaid (commitments rule)', () => {
    const items = ledger().filter((e) => !(e.category === 'rent' && e.date.startsWith('2026-08')));
    const p = projectMoney(input({ items }));
    expect(p.days.flatMap((d) => d.flows).filter((f) => f.label === 'Landlord')).toHaveLength(1);
  });

  it('can switch the everyday average off', () => {
    const p = projectMoney(input({ everyday: false }));
    expect(p.everydayApplied).toBe(false);
    expect(p.everydayBasis?.perDay).toBe(500);
    expect(p.totals.everyday).toBe(0);
    expect(day(p, '2026-08-31').balance).toBe(42000 - 2449);
  });
});

describe('everydayAverage', () => {
  const none = new Set<string>();

  it('needs 28 days of logging', () => {
    expect(everydayAverage([tx('2026-07-15', 100, 'groceries')], CATS, NOW, none)).toBeNull();
    expect(everydayAverage([tx('2026-07-04', 280, 'groceries')], CATS, NOW, none)).toEqual({
      perDay: 10, total: 280, days: 28, from: '2026-07-04', to: '2026-07-31',
    });
  });

  it('ignores this month, trip spending abroad and savings', () => {
    const items = [
      tx('2026-07-01', 310, 'groceries'),
      tx('2026-08-02', 5000, 'groceries'),
      tx('2026-07-10', 9000, 'shopping', 'Dubai Mall', { fxCurrency: 'AED', fxAmount: 400 }),
      tx('2026-07-11', 7000, 'stocks'),
    ];
    expect(everydayAverage(items, CATS, NOW, none)?.total).toBe(310);
  });

  it('resolves retired category keys before deciding', () => {
    // `subs` is the retired Subscriptions key; it is spending.
    expect(everydayAverage([tx('2026-07-01', 310, 'subs', 'One-off')], CATS, NOW, none)?.total).toBe(310);
  });

  it('returns null with nothing logged before this month', () => {
    expect(everydayAverage([tx('2026-08-01', 100, 'groceries')], CATS, NOW, none)).toBeNull();
    expect(everydayAverage([], CATS, NOW, none)).toBeNull();
  });
});

describe('prefs', () => {
  it('round-trips and toggles a skipped pattern', () => {
    const next = toggleSkipped({ ...DEFAULT_MONEY_CAL_PREFS, balance: 1200.5, asOf: '2026-08-10', payday: 31, horizon: 60 }, 'a::b');
    expect(saveMoneyCalPrefs(next)).toBe(true);
    expect(loadMoneyCalPrefs()).toEqual(next);
    expect(toggleSkipped(next, 'a::b').skipped).toEqual([]);
  });

  it('drops anything malformed', () => {
    localStorage.setItem(MONEY_CAL_KEY, JSON.stringify({
      balance: '5', asOf: '2026-13-01', salary: -4, payday: 32, everyday: 'no', skipped: ['ok', 3], horizon: 45,
    }));
    expect(loadMoneyCalPrefs()).toEqual({ ...DEFAULT_MONEY_CAL_PREFS, skipped: ['ok'] });
  });

  it('keeps a negative balance (an overdraft is a real balance)', () => {
    saveMoneyCalPrefs({ ...DEFAULT_MONEY_CAL_PREFS, balance: -2500, asOf: '2026-08-10' });
    expect(loadMoneyCalPrefs().balance).toBe(-2500);
  });
});
