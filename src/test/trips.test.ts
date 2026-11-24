import { describe, it, expect, beforeEach } from 'vitest';
import { BASELINE_RATES } from '../shared/fxFeed';
import { loadExpenses, normalizeExpense, saveExpenses, type ExpenseItem } from '../tools/lib/expense';
import { SYNC_KEYS } from '../tools/cloudSync';
import { mergeCloudBlob, mergeTrips } from '../tools/lib/syncMerge';
import {
  DEFAULT_HOME_CATS, TRIPS_KEY, addDays, daysInclusive, daysLeft, defaultHomeCats, feeApplies, firstDayRefresh, fixTripRate,
  fmtExact, fmtForeign, inTrip, loadAllTrips, loadTrips, normalizeTrip, overlappingTrip, repriceTripExpenses,
  saveAllTrips, staysHome, summarizeTrip, tripHomeAmount, tripLabel, tripOn, tripRateFor, upsertTrip, type Trip,
} from '../tools/lib/trips';

/**
 * Travel mode, stage 1 (src/tools/lib/trips.ts). The maths here decides what
 * goes into `amount`, the one field every total reads, so it is pinned to the
 * worked example agreed in the PR before any of it was written.
 */

const NOW = '2026-11-24T10:00:00.000Z';

function trip(over: Partial<Trip> = {}): Trip {
  return {
    id: 'trip_dubai',
    name: 'Dubai trip',
    place: 'United Arab Emirates',
    currency: 'AED',
    homeCurrency: 'INR',
    start: '2026-12-01',
    end: '2026-12-05',
    rate: 24,
    rateSource: 'live',
    rateAsOf: '2026-11-24',
    feePct: 3.5,
    homeCats: [...DEFAULT_HOME_CATS],
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function spend(over: Partial<ExpenseItem>): ExpenseItem {
  return { id: `tx_${Math.random().toString(36).slice(2)}`, amount: 0, category: 'food', date: '2026-12-02', ...over };
}

describe('the home amount: foreign × rate × (1 + fee ÷ 100)', () => {
  it('turns AED 120 at 24.0 with a 3.5% card fee into ₹2,980.80', () => {
    expect(tripHomeAmount(120, 24.0, 3.5, 'Credit card')).toBe(2980.8);
    expect(fmtExact(tripHomeAmount(120, 24.0, 3.5, 'Credit card'), 'INR')).toBe('₹2,980.80');
  });

  it('skips the fee for cash', () => {
    expect(tripHomeAmount(120, 24.0, 3.5, 'Cash')).toBe(2880);
  });

  it('adds the fee for every other payment method, and when none is set', () => {
    for (const method of ['Debit card', 'UPI', 'Wallet', 'Other', '', undefined]) {
      expect(tripHomeAmount(120, 24.0, 3.5, method)).toBe(2980.8);
    }
  });

  it('adds nothing when the trip has no card fee', () => {
    expect(tripHomeAmount(120, 24.0, undefined, 'Credit card')).toBe(2880);
    expect(tripHomeAmount(120, 24.0, 0, 'Credit card')).toBe(2880);
  });

  it('rounds to paise like every other amount', () => {
    // 33.33 × 23.96 × 1.035 = 826.535...
    expect(tripHomeAmount(33.33, 23.96, 3.5, 'Credit card')).toBe(826.54);
  });

  it('works the same for a refund', () => {
    expect(tripHomeAmount(-120, 24.0, 3.5, 'Credit card')).toBe(-2980.8);
  });

  it('knows when the fee applies', () => {
    expect(feeApplies(3.5, 'Credit card')).toBe(true);
    expect(feeApplies(3.5, 'Cash')).toBe(false);
    expect(feeApplies(undefined, 'Credit card')).toBe(false);
  });
});

describe("the trip's rate", () => {
  it('comes from the layered rates, rounded once so the rate shown is the rate used', () => {
    // 88 INR and 3.6725 AED per USD: 1 AED = 23.9619... INR, fixed at 23.96.
    expect(tripRateFor('AED', 'INR', BASELINE_RATES)).toBe(23.96);
  });

  it('keeps four significant figures for a rate below 1', () => {
    // 88 / 25000 = 0.00352 INR per VND.
    expect(tripRateFor('VND', 'INR', BASELINE_RATES)).toBe(0.00352);
    expect(fixTripRate(0.0036045123)).toBe(0.003605);
  });

  it('is exactly 1 at home, where nothing is converted', () => {
    expect(tripRateFor('INR', 'INR', BASELINE_RATES)).toBe(1);
  });

  it('is null, never a guess, when either currency has no rate', () => {
    expect(tripRateFor('XYZ', 'INR', BASELINE_RATES)).toBeNull();
    expect(tripRateFor('AED', 'XYZ', BASELINE_RATES)).toBeNull();
  });
});

describe('trip windows, in local calendar days', () => {
  const t = trip();

  it('includes both the first and the last day', () => {
    expect(inTrip(t, '2026-11-30')).toBe(false);
    expect(inTrip(t, '2026-12-01')).toBe(true);
    expect(inTrip(t, '2026-12-05')).toBe(true);
    expect(inTrip(t, '2026-12-06')).toBe(false);
  });

  it('finds the trip a day falls in', () => {
    const next = trip({ id: 'trip_paris', currency: 'EUR', start: '2026-12-06', end: '2026-12-09' });
    expect(tripOn([t, next], '2026-12-05')?.id).toBe('trip_dubai');
    expect(tripOn([t, next], '2026-12-06')?.id).toBe('trip_paris');
    expect(tripOn([t, next], '2026-12-10')).toBeNull();
  });

  it('ignores a deleted trip', () => {
    expect(tripOn([trip({ deletedAt: NOW })], '2026-12-02')).toBeNull();
  });

  it('refuses overlaps but allows back-to-back trips', () => {
    const backToBack = trip({ id: 'b', start: '2026-12-06', end: '2026-12-08' });
    const overlap = trip({ id: 'c', start: '2026-12-05', end: '2026-12-08' });
    expect(overlappingTrip([t], backToBack)).toBeNull();
    expect(overlappingTrip([t], overlap)?.id).toBe('trip_dubai');
    // A trip never overlaps itself, so editing one is fine.
    expect(overlappingTrip([t], { ...t, end: '2026-12-07' })).toBeNull();
  });

  it('counts days left including today', () => {
    expect(daysLeft(t, '2026-12-03')).toBe(3);
    expect(daysLeft(t, '2026-12-05')).toBe(1);
    expect(daysLeft(t, '2026-12-06')).toBeNull();
  });

  it('does calendar arithmetic across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(daysInclusive('2026-12-30', '2027-01-02')).toBe(4);
    expect(daysInclusive('2026-12-05', '2026-12-01')).toBe(0);
  });
});

describe('what stays in the home currency', () => {
  const t = trip();

  it('keeps rent, bills, EMIs, subscriptions and investments in ₹ by default', () => {
    for (const k of ['rent', 'bills', 'emi', 'subs', 'invest_et']) expect(staysHome(t, k, false)).toBe(true);
    expect(staysHome(t, 'food', false)).toBe(false);
  });

  it('keeps anything recurring in ₹, whatever its category', () => {
    expect(staysHome(t, 'food', true)).toBe(true);
  });

  it('starts a new trip from the user’s own Budget categories, resolving the original keys', () => {
    // The Budget Builder's default categories, not the old Expense Tracker keys.
    const cats = [
      { k: 'rent', section: 'needs' }, { k: 'utilities', section: 'needs' }, { k: 'groceries', section: 'needs' },
      { k: 'eating_out', section: 'wants' }, { k: 'subscriptions', section: 'wants' },
      { k: 'emergency', section: 'save' }, { k: 'loan_invest', section: 'save' }, { k: 'stocks', section: 'save' },
    ];
    expect(defaultHomeCats(cats).sort()).toEqual(
      ['emergency', 'loan_invest', 'rent', 'stocks', 'subscriptions', 'utilities'],
    );
  });

  it('lets an original key cover the Budget category it migrated to', () => {
    // A trip whose list says "bills" keeps Utilities / Bills in ₹.
    expect(staysHome(t, 'utilities', false)).toBe(true);
    expect(staysHome(t, 'subscriptions', false)).toBe(true);
    expect(staysHome(t, 'eating_out', false)).toBe(false);
  });

  it("follows the trip's own list once the user changes it", () => {
    const custom = trip({ homeCats: ['rent', 'shopping'] });
    expect(staysHome(custom, 'shopping', false)).toBe(true);
    expect(staysHome(custom, 'bills', false)).toBe(false);
  });
});

describe('normalizeExpense keeps the travel fields across a reload', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a trip expense through storage', () => {
    const item = spend({
      id: 'tx_1', amount: 2980.8, fxAmount: 120, fxCurrency: 'AED', fxRate: 24, fxFee: 3.5, tripId: 'trip_dubai',
      paymentMethod: 'Credit card',
    });
    saveExpenses([item]);
    expect(loadExpenses()).toEqual([item]);
  });

  it('keeps a cash spend without a fee, and a ₹ trip spend with only its trip', () => {
    const cash = normalizeExpense(spend({ id: 'a', amount: 2880, fxAmount: 120, fxCurrency: 'AED', fxRate: 24, tripId: 't' }));
    expect(cash.fxFee).toBeUndefined();
    expect(cash.fxAmount).toBe(120);
    const inRupees = normalizeExpense(spend({ id: 'b', amount: 5000, tripId: 't' }));
    expect(inRupees.tripId).toBe('t');
    expect(inRupees.fxAmount).toBeUndefined();
  });

  it('drops a foreign amount that lost its currency or rate, rather than keep half of it', () => {
    const broken = normalizeExpense({ id: 'c', amount: 10, category: 'food', date: '2026-12-02', fxAmount: 5, fxRate: 2 });
    expect(broken).not.toHaveProperty('fxAmount');
    expect(broken).not.toHaveProperty('fxRate');
  });

  it('leaves an ordinary expense exactly as it was', () => {
    const plain = spend({ id: 'd', amount: 250 });
    expect(normalizeExpense(plain)).toEqual(plain);
  });
});

describe('trips in storage', () => {
  beforeEach(() => localStorage.clear());

  it('saves and loads, hiding deleted trips from the live list', () => {
    saveAllTrips([trip(), trip({ id: 'gone', start: '2027-01-01', end: '2027-01-02', deletedAt: NOW })]);
    expect(loadAllTrips()).toHaveLength(2);
    expect(loadTrips().map((t) => t.id)).toEqual(['trip_dubai']);
  });

  it('refuses records that cannot be a trip', () => {
    expect(normalizeTrip({ ...trip(), end: '2026-11-01' })).toBeNull();
    expect(normalizeTrip({ ...trip(), rate: 0 })).toBeNull();
    expect(normalizeTrip({ ...trip(), currency: 'dirham' })).toBeNull();
    localStorage.setItem(TRIPS_KEY, '"nonsense"');
    expect(loadTrips()).toEqual([]);
  });

  it('replaces a trip by id or adds it', () => {
    const t = trip();
    expect(upsertTrip([t], { ...t, name: 'Dubai' })).toEqual([{ ...t, name: 'Dubai' }]);
    expect(upsertTrip([t], trip({ id: 'x' }))).toHaveLength(2);
  });

  it('is labelled by its name, else its country, else its currency', () => {
    expect(tripLabel(trip())).toBe('Dubai trip');
    expect(tripLabel(trip({ name: undefined, place: 'Indonesia (Bali)' }))).toBe('Indonesia');
    expect(tripLabel(trip({ name: undefined, place: undefined }))).toBe('AED');
  });
});

describe('merging trips across devices', () => {
  const t = trip();
  const raw = (list: Trip[]) => JSON.stringify(list);

  it('keeps trips from both devices', () => {
    const other = trip({ id: 'trip_paris', currency: 'EUR', start: '2027-01-01', end: '2027-01-05' });
    const merged = JSON.parse(mergeTrips(raw([t]), raw([other]))!);
    expect(merged.map((x: Trip) => x.id)).toEqual(['trip_dubai', 'trip_paris']);
  });

  it('lets the later edit of the same trip win', () => {
    const renamed = { ...t, name: 'Dubai with family', updatedAt: '2026-11-25T08:00:00.000Z' };
    expect(JSON.parse(mergeTrips(raw([t]), raw([renamed]))!)[0].name).toBe('Dubai with family');
    expect(JSON.parse(mergeTrips(raw([renamed]), raw([t]))!)[0].name).toBe('Dubai with family');
  });

  it('carries a deletion to the other device instead of merging the trip back', () => {
    const deleted = { ...t, deletedAt: '2026-11-25T08:00:00.000Z', updatedAt: '2026-11-25T08:00:00.000Z' };
    const merged = JSON.parse(mergeTrips(raw([t]), raw([deleted]))!);
    expect(merged).toHaveLength(1);
    expect(merged[0].deletedAt).toBeTruthy();
  });

  it('changes nothing when both sides agree, whatever the order', () => {
    const a = trip({ id: 'a', start: '2027-01-01', end: '2027-01-02' });
    const remote = raw([a, t]);
    expect(mergeTrips(raw([t, a]), remote)).toBe(remote);
  });

  it('never lets one unreadable side empty the other', () => {
    expect(mergeTrips('{oops', raw([t]))).toBe(raw([t]));
    expect(mergeTrips(raw([t]), null)).toBe(raw([t]));
  });

  it('is the rule sync uses for the synced fx_trips key', () => {
    expect(SYNC_KEYS).toContain('fx_trips');
    const other = trip({ id: 'trip_paris', currency: 'EUR', start: '2027-01-01', end: '2027-01-05' });
    const { merged, aheadKeys } = mergeCloudBlob(
      ['fx_trips'],
      { fx_trips: raw([t]) },
      { fx_trips: raw([other]) },
    );
    expect(JSON.parse(merged.fx_trips).map((x: Trip) => x.id)).toEqual(['trip_dubai', 'trip_paris']);
    expect(aheadKeys).toEqual(['fx_trips']);
  });
});

describe('the once-only rate refresh on the first day', () => {
  const live = { ...BASELINE_RATES, INR: 93 };
  const base = { today: '2026-12-01', liveToday: true, liveAsOf: '2026-12-01', rates: live, hasExpenses: false, nowIso: NOW };

  it('re-takes the live rate on the first day of a trip set up early, then never again', () => {
    const refreshed = firstDayRefresh(trip(), base);
    // 93 / 3.6725 = 25.32...
    expect(refreshed).toMatchObject({ rate: 25.32, rateAsOf: '2026-12-01', rateRefreshed: true });
    expect(firstDayRefresh(refreshed!, base)).toBeNull();
  });

  it('waits for live rates fetched today, and for the trip to start', () => {
    expect(firstDayRefresh(trip(), { ...base, liveToday: false })).toBeNull();
    expect(firstDayRefresh(trip(), { ...base, today: '2026-11-30' })).toBeNull();
  });

  it('leaves a rate typed by hand alone', () => {
    expect(firstDayRefresh(trip({ rateSource: 'manual' }), base)).toBeNull();
  });

  it('does not move a rate that expenses were already priced at', () => {
    const out = firstDayRefresh(trip(), { ...base, hasExpenses: true });
    expect(out).toMatchObject({ rate: 24, rateRefreshed: true });
  });
});

describe('changing the rate or fee re-prices only after a yes', () => {
  it('recomputes each foreign spend from its own amount and payment method', () => {
    const t = trip();
    const card = spend({ id: 'card', amount: 2980.8, fxAmount: 120, fxCurrency: 'AED', fxRate: 24, fxFee: 3.5, tripId: t.id, paymentMethod: 'Credit card' });
    const cash = spend({ id: 'cash', amount: 2880, fxAmount: 120, fxCurrency: 'AED', fxRate: 24, tripId: t.id, paymentMethod: 'Cash' });
    const rupees = spend({ id: 'hotel', amount: 9000, tripId: t.id });
    const other = spend({ id: 'home', amount: 500, date: '2026-11-20' });
    const { next, changes } = repriceTripExpenses([card, cash, rupees, other], t, 25, 2, NOW);
    expect(next.find((e) => e.id === 'card')).toMatchObject({ amount: 3060, fxRate: 25, fxFee: 2 });
    expect(next.find((e) => e.id === 'cash')).toMatchObject({ amount: 3000, fxRate: 25 });
    expect(next.find((e) => e.id === 'cash')?.fxFee).toBeUndefined();
    expect(next.find((e) => e.id === 'hotel')).toBe(rupees);
    expect(next.find((e) => e.id === 'home')).toBe(other);
    expect(changes.map((c) => c.before.id)).toEqual(['card', 'cash']);
  });
});

describe('the trip summary', () => {
  const t = trip();
  const items = [
    spend({ id: 'a', amount: 2980.8, fxAmount: 120, fxCurrency: 'AED', fxRate: 24, fxFee: 3.5, tripId: t.id, category: 'food', date: '2026-12-01' }),
    spend({ id: 'b', amount: 2880, fxAmount: 120, fxCurrency: 'AED', fxRate: 24, tripId: t.id, category: 'transport', date: '2026-12-02', paymentMethod: 'Cash' }),
    spend({ id: 'c', amount: 9000, tripId: t.id, category: 'travel', date: '2026-12-01' }),
    spend({ id: 'd', amount: 25000, category: 'rent', date: '2026-12-01' }),
  ];

  it('totals both currencies, keeping ₹-paid spends apart', () => {
    const s = summarizeTrip(t, items, '2026-12-03');
    expect(s.homeTotal).toBe(14860.8);
    expect(s.foreignTotal).toBe(240);
    expect(s.paidInHome).toBe(9000);
    expect(s.count).toBe(3);
  });

  it('averages over the days so far, then over the whole trip once it ends', () => {
    expect(summarizeTrip(t, items, '2026-12-03')).toMatchObject({ days: 3, dailyAverage: 4953.6 });
    expect(summarizeTrip(t, items, '2026-12-20')).toMatchObject({ days: 5, dailyAverage: 2972.16 });
    expect(summarizeTrip(t, items, '2026-11-20')).toMatchObject({ days: 0, dailyAverage: null });
  });

  it('ranks categories and the biggest spends by home amount', () => {
    const s = summarizeTrip(t, items, '2026-12-03');
    expect(s.byCategory.map((c) => c.category)).toEqual(['travel', 'food', 'transport']);
    expect(s.biggest.map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('formatting', () => {
  it('names the trip currency by its code', () => {
    expect(fmtForeign(120, 'AED')).toBe('AED 120');
    expect(fmtForeign(12.5, 'AED')).toBe('AED 12.50');
    expect(fmtForeign(-1240, 'AED')).toBe('−AED 1,240');
  });
});
