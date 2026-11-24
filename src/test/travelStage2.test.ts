import { describe, it, expect } from 'vitest';
import { normalizeExpense, type ExpenseItem } from '../tools/lib/expense';
import { roundAmount } from '../tools/lib/formula';
import {
  chargedMoney, impliedRate, nextTripAfter, normalizeTrip, repriceTripExpenses, repriceableCount, spendMoney,
  summarizeTrip, tripBudgetProgress, tripDefaults, tripHomeAmount, tripSpendInMonth, type Trip,
} from '../tools/lib/trips';

/**
 * Travel mode, stage 2 (src/tools/lib/trips.ts): the trip budget, the amount
 * typed from the bank statement, bookings made before the trip, and the month
 * budget's "Includes ₹X from the trip" line. The statement maths is pinned to
 * the worked example in the PR description, written before the code.
 */

const NOW = '2026-11-24T10:00:00.000Z';

function trip(over: Partial<Trip> = {}): Trip {
  return {
    id: 'trip_dubai',
    name: 'Dubai trip',
    currency: 'AED',
    homeCurrency: 'INR',
    start: '2026-12-01',
    end: '2026-12-05',
    rate: 24,
    rateSource: 'live',
    feePct: 3.5,
    homeCats: ['rent', 'utilities'],
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function spend(over: Partial<ExpenseItem> = {}): ExpenseItem {
  return { id: 'e1', amount: 100, category: 'eating_out', date: '2026-12-02', ...over };
}

describe('charged a different amount (the statement figure)', () => {
  const dubai = trip();
  const ctx = tripDefaults(dubai, 'eating_out', false);

  it('worked example: AED 120 priced at ₹2,980.80, charged ₹2,995.40', () => {
    const priced = spendMoney(120, { ...ctx, paymentMethod: 'Credit card' });
    expect(priced.amount).toBe(2980.8);
    expect(priced.fxFee).toBe(3.5);

    const charged = chargedMoney(priced, 2995.4);
    expect(charged.amount).toBe(2995.4);
    expect(charged.fxAmount).toBe(120);
    expect(charged.fxCurrency).toBe('AED');
    expect(charged.fxRate).toBeCloseTo(24.961667, 6);
    expect(charged.fxCharged).toBe(true);
    expect(charged).not.toHaveProperty('fxFee');
    expect(charged.tripId).toBe('trip_dubai');
    // Consistent with stage 1: foreign × rate × (1 + 0 ÷ 100) gives back the statement.
    expect(tripHomeAmount(120, charged.fxRate!, undefined, 'Credit card')).toBe(2995.4);
  });

  it('round-trips exactly on large amounts, because the implied rate is not rounded', () => {
    const vnd = trip({ currency: 'VND', rate: 0.003605, feePct: undefined });
    const priced = spendMoney(25_000_000, { ...tripDefaults(vnd, 'shopping', false), paymentMethod: 'Debit card' });
    const charged = chargedMoney(priced, 91_234.57);
    expect(charged.amount).toBe(91234.57);
    expect(roundAmount(charged.fxAmount! * charged.fxRate!)).toBe(91234.57);
  });

  it('rounds the statement figure like every other amount', () => {
    expect(chargedMoney(spendMoney(10, { ...ctx }), 245.678).amount).toBe(245.68);
  });

  it('keeps a refund a refund whatever sign the statement figure was typed with', () => {
    const refund = spendMoney(-120, { ...ctx, paymentMethod: 'Credit card' });
    const charged = chargedMoney(refund, 2995.4);
    expect(charged.amount).toBe(-2995.4);
    expect(charged.fxRate! > 0).toBe(true);
    expect(chargedMoney(refund, -2995.4).amount).toBe(-2995.4);
  });

  it('leaves a home-currency spend, or an unusable figure, unchanged', () => {
    const home = spendMoney(500, { ctx: null, paidInTrip: false, tripId: 'trip_dubai' });
    expect(chargedMoney(home, 600)).toEqual(home);
    const priced = spendMoney(120, { ...ctx, paymentMethod: 'Credit card' });
    expect(chargedMoney(priced, 0)).toEqual(priced);
    expect(chargedMoney(priced, Number.NaN)).toEqual(priced);
  });

  it('impliedRate refuses what is not a rate', () => {
    expect(impliedRate(2995.4, 120)).toBeCloseTo(24.961667, 6);
    expect(impliedRate(100, 0)).toBeNull();
    expect(impliedRate(0, 120)).toBeNull();
    expect(impliedRate(-100, 120)).toBeNull();
    expect(impliedRate(Number.POSITIVE_INFINITY, 1)).toBeNull();
  });

  it('survives a reload: normalizeExpense keeps fxCharged only with the foreign amount it explains', () => {
    const saved = normalizeExpense({
      ...spend(), ...chargedMoney(spendMoney(120, { ...ctx, paymentMethod: 'Credit card' }), 2995.4),
    });
    expect(saved.fxCharged).toBe(true);
    expect(saved.amount).toBe(2995.4);
    expect(normalizeExpense({ ...spend(), fxCharged: true }).fxCharged).toBeUndefined();
    expect(normalizeExpense({ ...spend(), ...spendMoney(120, { ...ctx }) }).fxCharged).toBeUndefined();
  });

  it('is never re-priced when the trip rate or fee changes', () => {
    const priced = { ...spend({ id: 'a' }), ...spendMoney(120, { ...ctx, paymentMethod: 'Credit card' }) };
    const statement = { ...spend({ id: 'b' }), ...chargedMoney(spendMoney(50, { ...ctx, paymentMethod: 'Credit card' }), 1300) };
    const items = [priced, statement];
    expect(repriceableCount(items, dubai)).toBe(1);
    const { next, changes } = repriceTripExpenses(items, dubai, 25, 3.5, NOW);
    expect(changes.map((c) => c.before.id)).toEqual(['a']);
    expect(next.find((e) => e.id === 'b')).toBe(statement);
  });
});

describe('trip budget', () => {
  it('is kept by normalizeTrip only as a positive amount, rounded', () => {
    expect(normalizeTrip(trip({ budget: 48000 }))?.budget).toBe(48000);
    expect(normalizeTrip(trip({ budget: 1234.567 }))?.budget).toBe(1234.57);
    expect(normalizeTrip(trip({ budget: 0 }))).not.toHaveProperty('budget');
    expect(normalizeTrip(trip({ budget: -5 }))).not.toHaveProperty('budget');
    expect(normalizeTrip({ ...trip(), budget: 'lots' })).not.toHaveProperty('budget');
    expect(normalizeTrip(trip())).not.toHaveProperty('budget');
  });

  it('progress: share spent, what is left, and over', () => {
    expect(tripBudgetProgress(30000, undefined)).toBeNull();
    expect(tripBudgetProgress(30000, 0)).toBeNull();
    expect(tripBudgetProgress(30000, 48000)).toEqual({ pct: 62.5, left: 18000, over: false });
    expect(tripBudgetProgress(48000, 48000)).toEqual({ pct: 100, left: 0, over: false });
    expect(tripBudgetProgress(50980.8, 48000)).toEqual({ pct: 50980.8 / 48000 * 100, left: -2980.8, over: true });
  });

  it('counts a booking made before the trip, because the trip total does', () => {
    const dubai = trip({ budget: 48000 });
    const items = [
      spend({ id: 'flight', amount: 18500, category: 'travel', date: '2026-11-10', tripId: dubai.id }),
      spend({ id: 'dinner', amount: 2980.8, date: '2026-12-02', tripId: dubai.id }),
    ];
    const s = summarizeTrip(dubai, items, '2026-12-03');
    expect(s.homeTotal).toBe(21480.8);
    expect(tripBudgetProgress(s.homeTotal, dubai.budget)?.left).toBe(26519.2);
  });
});

describe('bookings made before the trip', () => {
  const goa = trip({ id: 'trip_goa', currency: 'INR', start: '2026-10-02', end: '2026-10-04' });
  const dubai = trip();
  const gone = trip({ id: 'trip_gone', start: '2027-01-10', end: '2027-01-12', deletedAt: NOW });

  it('offers the next trip to start after the date', () => {
    expect(nextTripAfter([dubai, goa], '2026-09-20')?.id).toBe('trip_goa');
    expect(nextTripAfter([dubai, goa], '2026-11-10')?.id).toBe('trip_dubai');
  });

  it('offers nothing inside a trip, after the last one, or for a deleted one', () => {
    expect(nextTripAfter([dubai], '2026-12-02')).toBeNull();
    expect(nextTripAfter([dubai, gone], '2026-12-20')).toBeNull();
    expect(nextTripAfter([dubai], '')).toBeNull();
  });
});

describe('a month’s share of trip spending (the budget line)', () => {
  const dubai = trip();
  const goa = trip({ id: 'trip_goa', name: 'Goa trip', currency: 'INR', start: '2026-12-20', end: '2026-12-22' });
  const items: ExpenseItem[] = [
    spend({ id: '1', amount: 2980.8, date: '2026-12-02', tripId: dubai.id }),
    spend({ id: '2', amount: 1200, date: '2026-12-03', tripId: dubai.id }),
    spend({ id: '3', amount: 18500, date: '2026-11-10', tripId: dubai.id }),
    spend({ id: '4', amount: 4000, date: '2026-12-21', tripId: goa.id }),
    spend({ id: '5', amount: 900, date: '2026-12-05' }),
    spend({ id: '6', amount: 300, date: '2026-12-04', tripId: 'trip_deleted' }),
  ];

  it('sums each trip’s spends dated in the month, largest first', () => {
    expect(tripSpendInMonth(items, [dubai, goa], '2026-12').map((x) => [x.trip.id, x.home]))
      .toEqual([['trip_dubai', 4180.8], ['trip_goa', 4000]]);
  });

  it('puts a booking in the month it was paid, like monthlySpent does', () => {
    expect(tripSpendInMonth(items, [dubai, goa], '2026-11').map((x) => [x.trip.id, x.home]))
      .toEqual([['trip_dubai', 18500]]);
  });

  it('skips deleted trips, months with no trip spending, and trips that net to zero', () => {
    expect(tripSpendInMonth(items, [{ ...dubai, deletedAt: NOW }, goa], '2026-12').map((x) => x.trip.id)).toEqual(['trip_goa']);
    expect(tripSpendInMonth(items, [dubai, goa], '2026-10')).toEqual([]);
    const refunded = [...items, spend({ id: '7', amount: -4000, date: '2026-12-22', tripId: goa.id })];
    expect(tripSpendInMonth(refunded, [dubai, goa], '2026-12').map((x) => x.trip.id)).toEqual(['trip_dubai']);
  });
});
