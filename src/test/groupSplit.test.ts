import { describe, expect, it } from 'vitest';
import {
  checkSplit, computeBalances, parseShares, reminderText, shareOf, splitExpense, suggestPayments, toPaise,
  weightedSplit, whatsappLink, type SplitExpense, type SplitSettlement,
} from '../tools/lib/groupSplit';

/** A small seeded generator so the property tests are repeatable. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const id = (n: number) => `m${String(n).padStart(2, '0')}`;
const sum = (m: ReadonlyMap<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe('splitExpense: equal', () => {
  it('splits 100.00 among 3 with the spare paisa to the lowest member id', () => {
    const r = splitExpense(10000, 'equal', [{ member: 'c', value: 1 }, { member: 'a', value: 1 }, { member: 'b', value: 1 }])!;
    expect([...r.shares.entries()].sort()).toEqual([['a', 3334], ['b', 3333], ['c', 3333]]);
    expect(r.repaired).toBe(false);
  });
  it('ignores the stored values and the array order', () => {
    const a = splitExpense(10001, 'equal', [{ member: 'x', value: 9 }, { member: 'y', value: 0 }]);
    const b = splitExpense(10001, 'equal', [{ member: 'y', value: 1 }, { member: 'x', value: 1 }]);
    expect([...a!.shares]).toEqual([...b!.shares].sort());
    expect(a!.shares.get('x')).toBe(5001);
    expect(a!.shares.get('y')).toBe(5000);
  });
  it('splits one paisa between two: the lower id has it', () => {
    expect([...splitExpense(1, 'equal', [{ member: 'b', value: 1 }, { member: 'a', value: 1 }])!.shares.entries()].sort())
      .toEqual([['a', 1], ['b', 0]]);
  });
  it('gives a single person the whole amount', () => {
    expect(splitExpense(12345, 'equal', [{ member: 'a', value: 1 }])!.shares.get('a')).toBe(12345);
  });
});

describe('splitExpense: shares (weights)', () => {
  it('splits 100.00 as 2:1 into 66.67 and 33.33 (largest remainder)', () => {
    const r = splitExpense(10000, 'shares', [{ member: 'a', value: 2 }, { member: 'b', value: 1 }])!;
    expect(r.shares.get('a')).toBe(6667);
    expect(r.shares.get('b')).toBe(3333);
  });
  it('handles fractional weights to two decimals', () => {
    const r = splitExpense(10000, 'shares', [{ member: 'a', value: 1.5 }, { member: 'b', value: 0.5 }])!;
    expect(r.shares.get('a')).toBe(7500);
    expect(r.shares.get('b')).toBe(2500);
  });
  it('breaks a remainder tie by member id', () => {
    // 1:1:1 on 10 paise: base 3 each, one spare, equal remainders -> lowest id.
    const r = splitExpense(10, 'shares', [{ member: 'c', value: 1 }, { member: 'b', value: 1 }, { member: 'a', value: 1 }])!;
    expect([r.shares.get('a'), r.shares.get('b'), r.shares.get('c')]).toEqual([4, 3, 3]);
  });
  it('does not overflow at the largest amount the database holds', () => {
    const big = 1e14 - 1; // 999,999,999,999.99
    const r = splitExpense(big, 'shares', [{ member: 'a', value: 1000 }, { member: 'b', value: 999.99 }, { member: 'c', value: 0.01 }])!;
    expect(sum(r.shares)).toBe(big);
  });
  it('falls back to equal, flagged, when a weight is not usable', () => {
    const r = splitExpense(1000, 'shares', [{ member: 'a', value: 0 }, { member: 'b', value: 2 }])!;
    expect(r.repaired).toBe(true);
    expect([...r.shares.values()]).toEqual([500, 500]);
  });
});

describe('splitExpense: exact', () => {
  it('uses the parts as written when they add up', () => {
    const r = splitExpense(10000, 'exact', [{ member: 'a', value: 70.5 }, { member: 'b', value: 29.5 }])!;
    expect(r.shares.get('a')).toBe(7050);
    expect(r.shares.get('b')).toBe(2950);
    expect(r.repaired).toBe(false);
  });
  it('lets someone pay 0', () => {
    const r = splitExpense(5000, 'exact', [{ member: 'a', value: 50 }, { member: 'b', value: 0 }])!;
    expect(r.shares.get('b')).toBe(0);
  });
  it('is not fooled by float noise (0.1 + 0.2)', () => {
    const r = splitExpense(30, 'exact', [{ member: 'a', value: 0.1 }, { member: 'b', value: 0.2 }])!;
    expect(r.repaired).toBe(false);
    expect(sum(r.shares)).toBe(30);
  });
  it('falls back to equal, flagged, when the parts do not add up', () => {
    const r = splitExpense(10000, 'exact', [{ member: 'a', value: 60 }, { member: 'b', value: 30 }])!;
    expect(r.repaired).toBe(true);
    expect(sum(r.shares)).toBe(10000);
  });
});

describe('splitExpense: not a split', () => {
  it('is null without a rule, or with a malformed list', () => {
    expect(splitExpense(1000, null, null)).toBeNull();
    expect(splitExpense(1000, 'equal', [])).toBeNull();
    expect(splitExpense(1000, 'equal', 'nope')).toBeNull();
    expect(splitExpense(1000, 'equal', [{ member: 'a', value: 1 }, { member: 'a', value: 1 }])).toBeNull();
    expect(splitExpense(0, 'equal', [{ member: 'a', value: 1 }])).toBeNull();
    expect(splitExpense(1000, 'bogus', [{ member: 'a', value: 1 }])).toBeNull();
  });
  it('parseShares keeps up to 20 people', () => {
    expect(parseShares(Array.from({ length: 21 }, (_, i) => ({ member: id(i), value: 1 })))).toBeNull();
    expect(parseShares(Array.from({ length: 20 }, (_, i) => ({ member: id(i), value: 1 })))).toHaveLength(20);
  });
});

describe('property: shares always add up to the amount', () => {
  it('holds for random amounts, people, weights and exact parts', () => {
    const next = rng(42);
    for (let i = 0; i < 2000; i += 1) {
      const n = 1 + Math.floor(next() * 20);
      const amount = 1 + Math.floor(next() * 5_000_000);
      const members = Array.from({ length: n }, (_, k) => id(k));
      const equal = splitExpense(amount, 'equal', members.map((member) => ({ member, value: 1 })))!;
      expect(sum(equal.shares)).toBe(amount);
      const weights = members.map((member) => ({ member, value: Math.max(0.01, Math.round(next() * 1000) / 100) }));
      const weighted = splitExpense(amount, 'shares', weights)!;
      expect(weighted.repaired).toBe(false);
      expect(sum(weighted.shares)).toBe(amount);
      // Nobody is more than one paisa from their exact (real-number) share.
      const W = weights.reduce((s, w) => s + Math.round(w.value * 100), 0);
      for (const w of weights) {
        const exact = (amount * Math.round(w.value * 100)) / W;
        expect(Math.abs(weighted.shares.get(w.member)! - exact)).toBeLessThan(1 + 1e-6);
      }
      // The same answer for any order of the stored list.
      const shuffled = [...weights].sort(() => next() - 0.5);
      expect([...splitExpense(amount, 'shares', shuffled)!.shares].sort()).toEqual([...weighted.shares].sort());
      // Equal shares differ by at most one paisa.
      const vals = [...equal.shares.values()];
      expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(1);
    }
  });
  it('weightedSplit keeps the total for awkward weights', () => {
    const r = weightedSplit(100, [{ member: 'a', weight: 1 }, { member: 'b', weight: 1 }, { member: 'c', weight: 1 }, { member: 'd', weight: 1 }, { member: 'e', weight: 1 }, { member: 'f', weight: 1 }, { member: 'g', weight: 1 }]);
    expect(sum(r)).toBe(100);
  });
});

const exp = (over: Partial<SplitExpense> & Pick<SplitExpense, 'amount' | 'paid_by'>): SplitExpense => ({
  split_rule: 'equal', shares: [], deleted_at: null, ...over,
});
const everyone = (...members: string[]) => members.map((member) => ({ member, value: 1 }));

describe('computeBalances', () => {
  it('nets a dinner paid by one of three', () => {
    const b = computeBalances([exp({ amount: 900, paid_by: 'a', shares: everyone('a', 'b', 'c') })], []);
    expect(b.get('a')).toBe(60000);
    expect(b.get('b')).toBe(-30000);
    expect(b.get('c')).toBe(-30000);
    expect(sum(b)).toBe(0);
  });
  it('counts the payer who is not in the split as owed the whole amount', () => {
    const b = computeBalances([exp({ amount: 100, paid_by: 'a', shares: everyone('b', 'c') })], []);
    expect(b.get('a')).toBe(10000);
    expect(b.get('b')).toBe(-5000);
  });
  it('ignores deleted rows and Budget-together rows', () => {
    const b = computeBalances([
      exp({ amount: 900, paid_by: 'a', shares: everyone('a', 'b'), deleted_at: '2026-11-01T00:00:00Z' }),
      exp({ amount: 500, paid_by: 'a', split_rule: null, shares: null }),
    ], []);
    expect(b.size).toBe(0);
  });
  it('a settlement reduces both balances', () => {
    const expenses = [exp({ amount: 900, paid_by: 'a', shares: everyone('a', 'b', 'c') })];
    const settlements: SplitSettlement[] = [{ from_member: 'b', to_member: 'a', amount: 300 }];
    const b = computeBalances(expenses, settlements);
    expect(b.get('b')).toBe(0);
    expect(b.get('a')).toBe(30000);
    expect(sum(b)).toBe(0);
    // A deleted settlement does not count.
    const undone = computeBalances(expenses, [{ ...settlements[0], deleted_at: 'x' }]);
    expect(undone.get('b')).toBe(-30000);
  });
  it('a former member keeps a balance, and the group still nets to zero', () => {
    const b = computeBalances([exp({ amount: 100, paid_by: 'gone', shares: everyone('gone', 'a') })], []);
    expect(b.get('gone')).toBe(5000);
    expect(sum(b)).toBe(0);
  });
  it('shareOf is your share, and 0 when you are out of the split', () => {
    const e = exp({ amount: 1000, paid_by: 'a', shares: everyone('a', 'b', 'c', 'd') });
    expect(shareOf(e, 'a')).toBe(25000);
    expect(shareOf(e, 'z')).toBe(0);
    expect(shareOf(exp({ amount: 10, paid_by: 'a', split_rule: null, shares: null }), 'a')).toBe(0);
  });
  it('property: balances net to zero for random groups, with settlements', () => {
    const next = rng(7);
    for (let i = 0; i < 300; i += 1) {
      const n = 2 + Math.floor(next() * 12);
      const members = Array.from({ length: n }, (_, k) => id(k));
      const pick = () => members[Math.floor(next() * n)];
      const expenses: SplitExpense[] = [];
      for (let k = 0; k < 1 + Math.floor(next() * 15); k += 1) {
        const rule = (['equal', 'shares', 'exact'] as const)[Math.floor(next() * 3)];
        const amount = Math.round(next() * 500000) / 100 + 0.01;
        const people = members.filter(() => next() < 0.6);
        if (people.length === 0) people.push(pick());
        let shares: Array<{ member: string; value: number }>;
        if (rule === 'exact') {
          // Exact parts that add up, built in paise.
          const total = toPaise(amount);
          const parts = people.map(() => Math.floor(next() * 100));
          const w = parts.reduce((a, b) => a + b, 0) || 1;
          const paise = parts.map((p) => Math.floor((total * p) / w));
          paise[0] += total - paise.reduce((a, b) => a + b, 0);
          shares = people.map((member, j) => ({ member, value: paise[j] / 100 }));
        } else {
          shares = people.map((member) => ({ member, value: rule === 'shares' ? 1 + Math.floor(next() * 5) : 1 }));
        }
        expenses.push({ amount, paid_by: pick(), split_rule: rule, shares, deleted_at: next() < 0.1 ? 'x' : null });
      }
      const settlements: SplitSettlement[] = [];
      for (let k = 0; k < Math.floor(next() * 5); k += 1) {
        const from = pick();
        let to = pick();
        if (to === from) to = members.find((m) => m !== from)!;
        settlements.push({ from_member: from, to_member: to, amount: Math.round(next() * 10000) / 100 + 0.01 });
      }
      expect(sum(computeBalances(expenses, settlements))).toBe(0);
    }
  });
});

describe('suggestPayments', () => {
  const apply = (balances: Map<string, number>, payments: ReturnType<typeof suggestPayments>) => {
    const after = new Map(balances);
    for (const p of payments) {
      after.set(p.from, (after.get(p.from) ?? 0) + p.amount);
      after.set(p.to, (after.get(p.to) ?? 0) - p.amount);
    }
    return after;
  };

  it('is empty when everyone is square', () => {
    expect(suggestPayments(new Map([['a', 0], ['b', 0]]))).toEqual([]);
    expect(suggestPayments(new Map())).toEqual([]);
  });
  it('one debtor, one creditor: one payment', () => {
    expect(suggestPayments(new Map([['a', 60000], ['b', -60000]]))).toEqual([{ from: 'b', to: 'a', amount: 60000 }]);
  });
  it('pairs exact amounts first, so two pairs take two payments, not three', () => {
    const payments = suggestPayments(new Map([['a', 5000], ['b', 3000], ['c', -3000], ['d', -5000]]));
    expect(payments).toHaveLength(2);
    expect(payments).toContainEqual({ from: 'c', to: 'b', amount: 3000 });
    expect(payments).toContainEqual({ from: 'd', to: 'a', amount: 5000 });
  });
  it('one creditor, three debtors: three payments', () => {
    const p = suggestPayments(new Map([['a', 9000], ['b', -3000], ['c', -3000], ['d', -3000]]));
    expect(p).toHaveLength(3);
    expect(p.every((x) => x.to === 'a' && x.amount === 3000)).toBe(true);
  });
  it('breaks ties by member id', () => {
    const p = suggestPayments(new Map([['a', 1000], ['b', 1000], ['c', -2000]]));
    expect(p).toEqual([{ from: 'c', to: 'a', amount: 1000 }, { from: 'c', to: 'b', amount: 1000 }]);
  });
  it('property: settles everyone, at most k-1 payments, positive, order-independent', () => {
    const next = rng(99);
    for (let i = 0; i < 500; i += 1) {
      const n = 2 + Math.floor(next() * 15);
      const raw = Array.from({ length: n - 1 }, () => Math.round((next() - 0.5) * 200000));
      const balances = new Map<string, number>(raw.map((v, k) => [id(k), v] as [string, number]));
      balances.set(id(n - 1), -raw.reduce((a, b) => a + b, 0));
      const payments = suggestPayments(balances);
      for (const v of apply(balances, payments).values()) expect(v).toBe(0);
      const k = [...balances.values()].filter((v) => v !== 0).length;
      expect(payments.length).toBeLessThanOrEqual(Math.max(0, k - 1));
      expect(payments.every((p) => p.amount > 0 && p.from !== p.to)).toBe(true);
      const reversed = new Map([...balances].reverse());
      expect(suggestPayments(reversed)).toEqual(payments);
    }
  });
});

describe('checkSplit (the form)', () => {
  const money = (p: number) => `₹${(p / 100).toFixed(2)}`;
  it('equal needs at least one person', () => {
    expect(checkSplit({ rule: 'equal', members: [], values: {} }, 1000, money)).toMatchObject({ ok: false });
    const ok = checkSplit({ rule: 'equal', members: ['a', 'b'], values: {} }, 1001, money);
    expect(ok.ok && sum(ok.preview)).toBe(1001);
  });
  it('shares defaults a missing weight to 1 and rejects 0 and over 1000', () => {
    const ok = checkSplit({ rule: 'shares', members: ['a', 'b'], values: { a: 2 } }, 900, money);
    expect(ok.ok && ok.preview.get('a')).toBe(600);
    expect(checkSplit({ rule: 'shares', members: ['a'], values: { a: 0 } }, 900, money)).toMatchObject({ ok: false });
    expect(checkSplit({ rule: 'shares', members: ['a'], values: { a: 1001 } }, 900, money)).toMatchObject({ ok: false });
  });
  it('exact says how much is left, or too much', () => {
    expect(checkSplit({ rule: 'exact', members: ['a', 'b'], values: { a: 60, b: 30 } }, 10000, money))
      .toEqual({ ok: false, reason: '₹10.00 left to assign.' });
    expect(checkSplit({ rule: 'exact', members: ['a', 'b'], values: { a: 60, b: 50 } }, 10000, money))
      .toEqual({ ok: false, reason: '₹10.00 too much: the parts must add up to the total.' });
    const ok = checkSplit({ rule: 'exact', members: ['a', 'b'], values: { a: 60, b: 40 } }, 10000, money);
    expect(ok.ok && ok.shares).toEqual([{ member: 'a', value: 60 }, { member: 'b', value: 40 }]);
  });
});

describe('reminder', () => {
  it('builds an encoded wa.me link and puts only names, an amount and the group in it', () => {
    const text = reminderText({ toName: 'Rahul', amount: '₹600.00', groupName: 'Goa trip' });
    const link = whatsappLink(text);
    expect(link.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(link.slice('https://wa.me/?text='.length))).toBe(text);
    expect(text).toContain('Rahul');
    expect(text).toContain('₹600.00');
    expect(text).toContain('Goa trip');
  });
});
