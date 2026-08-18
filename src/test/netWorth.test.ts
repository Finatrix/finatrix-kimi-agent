import { describe, it, expect, beforeEach } from 'vitest';
import {
  NET_WORTH_CATEGORIES, NET_WORTH_KEY, balanceAt, categoriesFor, categoryFor,
  changeBetween, computeNetWorth, exportRows, genAccountId, lastRecordedMonth,
  loadAccounts, monthsBetween, monthsWithData, netWorthSeries, normalizeAccount,
  saveAccounts, setBalance, staleAccounts,
  type NetWorthAccount,
} from '../tools/lib/netWorth';

function account(over: Partial<NetWorthAccount> = {}): NetWorthAccount {
  return normalizeAccount({
    id: 'a1', name: 'Salary account', kind: 'asset', category: 'cash',
    balances: { '2026-01': 100000 },
    ...over,
  });
}

describe('the taxonomy', () => {
  it('gives every category a unique key and a side of the sheet', () => {
    const keys = NET_WORTH_CATEGORIES.map((c) => c.k);
    expect(new Set(keys).size).toBe(keys.length);
    expect(categoriesFor('asset').length).toBeGreaterThan(0);
    expect(categoriesFor('liability').length).toBeGreaterThan(0);
    for (const c of NET_WORTH_CATEGORIES) expect(categoryFor(c.k)).toBe(c);
  });

  it('keeps an "other" bucket on both sides, so nothing is unfileable', () => {
    expect(categoryFor('other_asset')?.kind).toBe('asset');
    expect(categoryFor('other_liability')?.kind).toBe('liability');
  });
});

describe('normalizeAccount', () => {
  it('mints an id, never drops the account', () => {
    const a = normalizeAccount({ name: 'Cash' });
    expect(a.id).toMatch(/^nw_/);
    expect(a.name).toBe('Cash');
    expect(a.kind).toBe('asset');
  });

  it('files an unknown or mismatched category under "other" of its own kind', () => {
    expect(normalizeAccount({ kind: 'asset', category: 'nonsense' }).category).toBe('other_asset');
    // A liability carrying an ASSET category is the dangerous case: silently
    // keeping it would sum a loan into the asset side.
    expect(normalizeAccount({ kind: 'liability', category: 'cash' }).category).toBe('other_liability');
  });

  it('discards junk month keys and non-numeric balances rather than trusting storage', () => {
    const a = normalizeAccount({
      balances: {
        '2026-01': 500, '2026-13': 900, 'january': 100,
        '2026-02': Number.NaN as unknown as number, '2026-03': '750' as unknown as number,
      },
    });
    expect(a.balances).toEqual({ '2026-01': 500, '2026-03': 750 });
  });

  it('stores a magnitude — a negative balance can never invert the sheet', () => {
    expect(normalizeAccount({ balances: { '2026-01': -4000 } }).balances['2026-01']).toBe(0);
  });

  it('names an account that arrived without one', () => {
    expect(normalizeAccount({ name: '   ' }).name).toBe('Untitled account');
  });
});

describe('balanceAt — the carry-forward rule', () => {
  const a = account({ balances: { '2026-01': 100, '2026-04': 400 } });

  it('uses the most recent balance on or before the month asked for', () => {
    expect(balanceAt(a, '2026-01')).toBe(100);
    expect(balanceAt(a, '2026-02')).toBe(100);
    expect(balanceAt(a, '2026-03')).toBe(100);
    expect(balanceAt(a, '2026-04')).toBe(400);
    expect(balanceAt(a, '2027-09')).toBe(400);
  });

  it('returns null before the account existed — which is not the same as zero', () => {
    expect(balanceAt(a, '2025-12')).toBeNull();
    expect(balanceAt(account({ balances: { '2026-01': 0 } }), '2026-01')).toBe(0);
  });

  it('reports which month the carried balance came from', () => {
    expect(lastRecordedMonth(a, '2026-03')).toBe('2026-01');
    expect(lastRecordedMonth(a, '2025-11')).toBeNull();
  });
});

describe('computeNetWorth', () => {
  const accounts = [
    account({ id: 'cash', name: 'Salary account', category: 'cash', balances: { '2026-01': 140000 } }),
    account({ id: 'mf', name: 'Equity MFs', category: 'equity', balances: { '2026-01': 620000, '2026-03': 700000 } }),
    account({ id: 'loan', name: 'Home loan', kind: 'liability', category: 'home_loan', balances: { '2026-02': 3200000 } }),
    account({ id: 'flat', name: 'Flat', category: 'property', balances: { '2026-02': 4800000 } }),
  ];

  it('is one subtraction: assets minus liabilities', () => {
    const s = computeNetWorth(accounts, '2026-02');
    expect(s.assets).toBe(140000 + 620000 + 4800000);
    expect(s.liabilities).toBe(3200000);
    expect(s.net).toBe(s.assets - s.liabilities);
  });

  it('does not let a liability reach back before it existed', () => {
    const jan = computeNetWorth(accounts, '2026-01');
    expect(jan.liabilities).toBe(0);
    expect(jan.assets).toBe(760000);
    expect(jan.net).toBe(760000);
  });

  it('reports a negative net worth honestly', () => {
    const s = computeNetWorth(
      [
        account({ id: 'c', balances: { '2026-01': 50000 } }),
        account({ id: 'l', kind: 'liability', category: 'education_loan', balances: { '2026-01': 900000 } }),
      ],
      '2026-01',
    );
    expect(s.net).toBe(-850000);
  });

  it('splits each side by category, largest first, and shares sum to 100', () => {
    const s = computeNetWorth(accounts, '2026-02');
    expect(s.assetCategories[0].category.k).toBe('property');
    const total = s.assetCategories.reduce((n, c) => n + c.share, 0);
    expect(total).toBeCloseTo(100, 6);
    // A category nobody recorded anything in is absent, not a zero row.
    expect(s.assetCategories.some((c) => c.category.k === 'gold')).toBe(false);
  });

  it('orders account rows by size and marks a carried-forward balance', () => {
    const s = computeNetWorth(accounts, '2026-03');
    expect(s.assetRows[0].account.name).toBe('Flat');
    const mf = s.assetRows.find((r) => r.account.id === 'mf')!;
    expect(mf.balance).toBe(700000);
    expect(mf.current).toBe(true);
    const cash = s.assetRows.find((r) => r.account.id === 'cash')!;
    expect(cash.current).toBe(false);
    expect(cash.recorded).toBe('2026-01');
  });

  it('expresses debt against assets, and says nothing when there are no assets', () => {
    expect(computeNetWorth(accounts, '2026-02').debtRatio).toBeCloseTo(
      (3200000 / 5560000) * 100, 6,
    );
    expect(computeNetWorth([], '2026-02').debtRatio).toBeNull();
  });

  it('is empty, not broken, with no accounts at all', () => {
    const s = computeNetWorth([], '2026-05');
    expect(s).toMatchObject({ assets: 0, liabilities: 0, net: 0 });
    expect(s.assetRows).toEqual([]);
  });
});

describe('netWorthSeries', () => {
  const accounts = [
    account({ id: 'a', balances: { '2026-01': 1000, '2026-04': 4000 } }),
    account({ id: 'b', kind: 'liability', category: 'credit_card', balances: { '2026-03': 500 } }),
  ];

  it('fills every month between the first record and the month asked for', () => {
    const s = netWorthSeries(accounts, '2026-05');
    expect(s.map((p) => p.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']);
  });

  it('carries balances across the months nobody touched', () => {
    const s = netWorthSeries(accounts, '2026-05');
    expect(s.map((p) => p.net)).toEqual([1000, 1000, 500, 3500, 3500]);
  });

  it('crosses a year boundary without losing a month', () => {
    const s = netWorthSeries([account({ balances: { '2025-11': 10 } })], '2026-02');
    expect(s.map((p) => p.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('is empty when nothing has been recorded', () => {
    expect(netWorthSeries([], '2026-05')).toEqual([]);
  });
});

describe('changeBetween', () => {
  it('gives the signed difference and its percentage', () => {
    expect(changeBetween(1000, 1250)).toEqual({ abs: 250, pct: 25 });
    expect(changeBetween(1000, 800)).toEqual({ abs: -200, pct: -20 });
  });

  it('refuses a percentage that would be meaningless', () => {
    expect(changeBetween(0, 5000).pct).toBeNull();       // from nothing
    expect(changeBetween(1000, -500).pct).toBeNull();    // across zero
    expect(changeBetween(-100, 200).pct).toBeNull();     // from negative
  });
});

describe('staleAccounts', () => {
  it('names accounts whose balance is three months old or more', () => {
    const fresh = account({ id: 'f', name: 'Fresh', balances: { '2026-05': 10 } });
    const stale = account({ id: 's', name: 'Stale', balances: { '2026-01': 10 } });
    const names = staleAccounts([fresh, stale], '2026-05').map((a) => a.name);
    expect(names).toEqual(['Stale']);
  });

  it('does not call an account stale before it existed', () => {
    const future = account({ balances: { '2026-09': 10 } });
    expect(staleAccounts([future], '2026-05')).toEqual([]);
  });

  it('counts whole months, in both directions', () => {
    expect(monthsBetween('2026-01', '2026-04')).toBe(3);
    expect(monthsBetween('2025-11', '2026-02')).toBe(3);
    expect(monthsBetween('2026-04', '2026-01')).toBe(-3);
  });
});

describe('setBalance', () => {
  const accounts = [account({ id: 'a', balances: { '2026-01': 100 } })];

  it('records a new balance without touching the others', () => {
    const next = setBalance(accounts, 'a', '2026-02', 250);
    expect(next[0].balances).toEqual({ '2026-01': 100, '2026-02': 250 });
    expect(accounts[0].balances).toEqual({ '2026-01': 100 }); // original untouched
  });

  it('clearing a month restores the carry-forward, and is not the same as zero', () => {
    const withTwo = setBalance(accounts, 'a', '2026-02', 250);
    expect(balanceAt(setBalance(withTwo, 'a', '2026-02', null)[0], '2026-02')).toBe(100);
    expect(balanceAt(setBalance(withTwo, 'a', '2026-02', 0)[0], '2026-02')).toBe(0);
  });

  it('never stores a negative balance', () => {
    expect(setBalance(accounts, 'a', '2026-02', -50)[0].balances['2026-02']).toBe(0);
  });

  it('ignores an id it does not hold', () => {
    expect(setBalance(accounts, 'nope', '2026-02', 1)).toEqual(accounts);
  });
});

describe('storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips through localStorage', () => {
    const accounts = [account({ id: 'x', name: 'PPF', category: 'retirement' })];
    saveAccounts(accounts);
    expect(loadAccounts()).toEqual(accounts);
  });

  it('survives corrupt storage rather than taking the page down', () => {
    localStorage.setItem(NET_WORTH_KEY, 'not json');
    expect(loadAccounts()).toEqual([]);
    localStorage.setItem(NET_WORTH_KEY, '{"nope":true}');
    expect(loadAccounts()).toEqual([]);
  });

  it('mints unique ids', () => {
    const ids = new Set(Array.from({ length: 200 }, genAccountId));
    expect(ids.size).toBe(200);
  });
});

describe('monthsWithData', () => {
  it('lists every recorded month plus the current one, in order', () => {
    const accounts = [
      account({ id: 'a', balances: { '2026-03': 1, '2026-01': 1 } }),
      account({ id: 'b', balances: { '2026-02': 1 } }),
    ];
    expect(monthsWithData(accounts, '2026-04')).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
  });
});

describe('exportRows', () => {
  it('exports one line per recorded balance, oldest month first, with a header', () => {
    const rows = exportRows([
      account({ id: 'a', name: 'Salary', balances: { '2026-02': 200, '2026-01': 100 } }),
      account({ id: 'l', name: 'Card', kind: 'liability', category: 'credit_card', balances: { '2026-02': 50 } }),
    ]);
    expect(rows[0]).toEqual(['Month', 'Type', 'Category', 'Account', 'Balance']);
    expect(rows.slice(1)).toEqual([
      ['2026-01', 'Asset', 'Cash & bank', 'Salary', 100],
      ['2026-02', 'Asset', 'Cash & bank', 'Salary', 200],
      ['2026-02', 'Liability', 'Credit card', 'Card', 50],
    ]);
  });

  it('exports only the header when there is nothing to export', () => {
    expect(exportRows([])).toHaveLength(1);
  });
});
