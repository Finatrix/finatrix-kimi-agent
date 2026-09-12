/**
 * LifeMap's form, filled in from what FinatriX already holds.
 *
 * LifeMap asks for eleven figures and the budget, expense tracker, InvestMatch
 * and Net Worth between them already know most of them. Retyping all eleven is
 * the wall a first LifeMap run hits, and it is also the clearest possible
 * statement that these are eight separate calculators rather than one system.
 *
 * The two things that can go wrong are opposite and equally bad:
 *
 *   • Seeding nothing, silently — a defensive `try` swallowing a real read and
 *     leaving the user to type everything anyway, with no error to notice.
 *   • Seeding something wrong — a property counted as though it compounded at
 *     an equity rate, or a figure that does not match the dashboard's.
 *
 * Both are tested below, along with the rule that a seeded value must always be
 * attributable: a number that appears in a field the user did not type is only
 * helpful if the page can say where it came from.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readLifeMapSeed } from '../tools/lib/lifemapSeed';
import { readDashboard } from '../tools/lib/dashboard';
import { currentMonth } from '../tools/lib/month';
import { NET_WORTH_KEY, type NetWorthAccount } from '../tools/lib/netWorth';

const MONTH = currentMonth();

function account(over: Partial<NetWorthAccount> & { category: string; balance: number }): NetWorthAccount {
  return {
    id: `nw_${over.category}`,
    name: over.category,
    kind: over.kind ?? 'asset',
    category: over.category,
    balances: { [MONTH]: over.balance },
  } as NetWorthAccount;
}

function seedStores(accounts: NetWorthAccount[] = []) {
  localStorage.setItem('fx_bb_data', JSON.stringify({
    [MONTH]: { vals: { rent: 20000 }, income: '90000', n: '50', w: '30', s: '20', inc: {} },
  }));
  localStorage.setItem('fx_investmatch', JSON.stringify({
    a: { age: 30, income: 90000, monthly: 12000, risk: 'moderate', horizon: '5-10', goal: 'wealth' },
  }));
  if (accounts.length) localStorage.setItem(NET_WORTH_KEY, JSON.stringify(accounts));
}

beforeEach(() => localStorage.clear());

describe('LifeMap seed', () => {
  it('is empty for a first-time visitor, so the page shows guidance not figures', () => {
    const seed = readLifeMapSeed();
    expect(seed.values).toEqual({});
    expect(seed.from).toEqual([]);
  });

  it('fills the income from the budget and says so', () => {
    seedStores();
    const seed = readLifeMapSeed();
    expect(seed.values['lm-income']).toBe('90000');
    expect(seed.sources['lm-income']).toBe('Budget');
    expect(seed.from).toContain('Budget');
  });

  it('fills the monthly contribution from InvestMatch and switches the question on', () => {
    seedStores();
    const seed = readLifeMapSeed();
    expect(seed.values['lm-sip']).toBe('12000');
    expect(seed.sources['lm-sip']).toBe('InvestMatch');
    // Without this the seeded amount would be filled into a field the form
    // keeps hidden, which is worse than not seeding it at all.
    expect(seed.values['lm-sip-yn']).toBe('yes');
  });

  it('splits the balance sheet into cash and invested, and carries the debt', () => {
    seedStores([
      account({ category: 'cash', balance: 150000 }),
      account({ category: 'deposits', balance: 50000 }),
      account({ category: 'equity', balance: 300000 }),
      account({ category: 'retirement', balance: 200000 }),
      account({ category: 'home_loan', balance: 800000, kind: 'liability' }),
    ]);
    const seed = readLifeMapSeed();
    expect(seed.values['lm-savings']).toBe('200000'); // cash + deposits
    expect(seed.values['lm-invest']).toBe('500000'); // equity + retirement
    expect(seed.values['lm-debt-total']).toBe('800000');
    expect(seed.values['lm-debt-yn']).toBe('yes');
    expect(seed.sources['lm-savings']).toBe('Net Worth');
  });

  /**
   * The one mapping decision that would be wrong rather than merely incomplete.
   * LifeMap compounds `savings + invest` forward at an assumed rate, so a house
   * seeded in would be projected as though it were an index fund.
   */
  it('never seeds property or vehicles into the compounding pools', () => {
    seedStores([
      account({ category: 'cash', balance: 100000 }),
      account({ category: 'property', balance: 9000000 }),
      account({ category: 'vehicle', balance: 700000 }),
    ]);
    const seed = readLifeMapSeed();
    expect(seed.values['lm-savings']).toBe('100000');
    expect(seed.values['lm-invest']).toBeUndefined();
  });

  it('matches the dashboard, because it reads the same snapshot', () => {
    seedStores();
    const snap = readDashboard();
    const seed = readLifeMapSeed();
    expect(seed.values['lm-income']).toBe(String(Math.round(snap.income!)));
  });

  it('attributes every seeded figure — no anonymous numbers in the form', () => {
    seedStores([account({ category: 'cash', balance: 100000 })]);
    const seed = readLifeMapSeed();
    // The two `*-yn` switches are consequences of a seeded amount rather than
    // figures of their own, and carry no separate attribution.
    for (const key of Object.keys(seed.values)) {
      if (key.endsWith('-yn')) continue;
      expect(seed.sources[key], `${key} was seeded with no stated source`).toBeTruthy();
    }
  });

  it('survives a corrupt net-worth store without losing the rest of the seed', () => {
    seedStores();
    localStorage.setItem(NET_WORTH_KEY, '{{ not json');
    const seed = readLifeMapSeed();
    expect(seed.values['lm-income']).toBe('90000');
    expect(seed.values['lm-savings']).toBeUndefined();
  });

  it('ignores a zero balance rather than seeding a misleading 0', () => {
    seedStores([account({ category: 'cash', balance: 0 })]);
    const seed = readLifeMapSeed();
    // A field left blank invites a real answer; a field pre-filled with 0 looks
    // like a fact the user already told us.
    expect(seed.values['lm-savings']).toBeUndefined();
    expect(seed.values['lm-debt-yn']).toBeUndefined();
  });
});
