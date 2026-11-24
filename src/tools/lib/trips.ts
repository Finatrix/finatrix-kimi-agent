/**
 * Travel mode: trips, and how a spend abroad becomes a home-currency amount.
 *
 * WHAT A TRIP CHANGES, AND WHAT IT DOES NOT
 * -----------------------------------------
 * Every expense keeps `amount` in the home currency (`fx_currency`), so every
 * total, budget and report is computed exactly as before. A trip only decides
 * what goes INTO `amount` for a spend typed in the trip's currency:
 *
 *     home = roundAmount(foreign × rate × (1 + fee ÷ 100))
 *
 * with the fee skipped for cash. The foreign amount, its currency, the rate and
 * fee used and the trip id ride along on the expense as descriptive fields
 * (see `normalizeExpense`), so the trip can show both amounts and be re-priced.
 *
 * THE RATE
 * --------
 * Home units per 1 trip unit, taken from `fx.ts` (live rates, then the user's
 * own overrides) when the trip is set up, rounded once so the rate on screen is
 * exactly the rate used, and fixed for the trip. The AI never sets it. With no
 * rate for either currency the setup asks; it never guesses.
 *
 * DATES
 * -----
 * Trip windows are local calendar days (`YYYY-MM-DD`, inclusive), compared as
 * strings, so a trip does not shift by a day in another time zone.
 *
 * Pure apart from the load/save pair.
 */
import { ymdLocal } from '../../lib/date';
import { EXPENSE_CAT_MIGRATION, migrateCategory, type ExpenseItem } from './expense';
import { roundAmount } from './formula';
import { convert, hasRate, type RateTable } from './fx';
import { getJSON, setJSON } from './storage';
import { TRIPS_KEY } from './syncMerge';

export { TRIPS_KEY };

/** The ended trip whose summary card the user closed. Device-only: a display preference. */
export const TRIP_CARD_HIDDEN_KEY = 'fx_trip_card_hidden';

/** Categories that stay in the home currency on a trip, until the user changes the list. */
export const DEFAULT_HOME_CATS: readonly string[] = ['rent', 'bills', 'emi', 'subs', 'invest_et'];

/** Where a trip's rate came from. Only a rate typed by hand is never refreshed. */
export type RateSource = 'live' | 'builtin' | 'manual';

export interface Trip {
  id: string;
  /** Optional, e.g. "Dubai trip". */
  name?: string;
  /** The country picked, e.g. "United Arab Emirates". */
  place?: string;
  /** The trip currency, e.g. AED. Equal to `homeCurrency` for a trip at home. */
  currency: string;
  /** The home currency when the trip was set up. */
  homeCurrency: string;
  /** First and last day, local `YYYY-MM-DD`, inclusive. */
  start: string;
  end: string;
  /** Home units per 1 trip unit, fixed for the trip. 1 for a trip at home. */
  rate: number;
  rateSource: RateSource;
  /** The date of the rates the trip's rate came from, when it was not typed. */
  rateAsOf?: string;
  /** The one refresh on the first day has happened, or is no longer due. */
  rateRefreshed?: boolean;
  /** Optional card forex fee, in %. Skipped for cash. */
  feePct?: number;
  /** Category keys that stay in the home currency. Recurring spends always do. */
  homeCats: string[];
  createdAt: string;
  updatedAt: string;
  /** Set when deleted. Kept so a deletion reaches other devices instead of being merged back. */
  deletedAt?: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[A-Z]{3}$/;

export function genTripId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return 'trip_' + crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return 'trip_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

/** A stored trip made well-formed, or null when it cannot be one. */
export function normalizeTrip(raw: unknown): Trip | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const id = str(t.id);
  const currency = str(t.currency).toUpperCase();
  const homeCurrency = str(t.homeCurrency).toUpperCase();
  const start = str(t.start);
  const end = str(t.end);
  const rate = Number(t.rate);
  if (!id || !CODE.test(currency) || !CODE.test(homeCurrency)) return null;
  if (!ISO_DAY.test(start) || !ISO_DAY.test(end) || end < start) return null;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const fee = Number(t.feePct);
  const source = t.rateSource === 'live' || t.rateSource === 'builtin' || t.rateSource === 'manual'
    ? t.rateSource : 'manual';
  const homeCats = Array.isArray(t.homeCats)
    ? t.homeCats.filter((k): k is string => typeof k === 'string' && k !== '')
    : [...DEFAULT_HOME_CATS];
  const created = str(t.createdAt);
  return {
    id,
    ...(str(t.name) ? { name: str(t.name) } : {}),
    ...(str(t.place) ? { place: str(t.place) } : {}),
    currency,
    homeCurrency,
    start,
    end,
    rate,
    rateSource: source,
    ...(ISO_DAY.test(str(t.rateAsOf)) ? { rateAsOf: str(t.rateAsOf) } : {}),
    ...(t.rateRefreshed === true ? { rateRefreshed: true } : {}),
    ...(Number.isFinite(fee) && fee > 0 ? { feePct: fee } : {}),
    homeCats,
    createdAt: created,
    updatedAt: str(t.updatedAt) || created,
    ...(str(t.deletedAt) ? { deletedAt: str(t.deletedAt) } : {}),
  };
}

/** Every stored trip, deleted ones included. Write back through `saveAllTrips`. */
export function loadAllTrips(): Trip[] {
  const raw = getJSON<unknown[]>(TRIPS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeTrip).filter((t): t is Trip => t !== null);
}

/** The trips that exist (not deleted), earliest first. */
export function liveTrips(all: readonly Trip[]): Trip[] {
  return all.filter((t) => !t.deletedAt).sort((a, b) => a.start.localeCompare(b.start) || a.createdAt.localeCompare(b.createdAt));
}

export function loadTrips(): Trip[] {
  return liveTrips(loadAllTrips());
}

export function saveAllTrips(trips: readonly Trip[]): boolean {
  return setJSON(TRIPS_KEY, trips);
}

/** Replace one trip (matched by id) or add it, keeping every other record. */
export function upsertTrip(all: readonly Trip[], trip: Trip): Trip[] {
  return all.some((t) => t.id === trip.id) ? all.map((t) => (t.id === trip.id ? trip : t)) : [...all, trip];
}

/** A trip's display name: its own name, else the country, else the currency. */
export function tripLabel(trip: Pick<Trip, 'name' | 'place' | 'currency'>): string {
  return trip.name || trip.place?.replace(/\s*\(.*\)$/, '') || trip.currency;
}

/** True for a trip in the home currency, where nothing is converted. */
export function isHomeTrip(trip: Pick<Trip, 'currency' | 'homeCurrency'>): boolean {
  return trip.currency === trip.homeCurrency;
}

/* ── Dates ─────────────────────────────────────────────────────────────── */

function parts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number);
  return [y, m, d];
}

/** `ymd` moved by `n` calendar days. */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = parts(ymd);
  return ymdLocal(new Date(y, m - 1, d + n));
}

/** Calendar days from `from` to `to`, inclusive of both. 0 when `to` is before `from`. */
export function daysInclusive(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  const diff = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
  return Math.max(0, diff + 1);
}

export function inTrip(trip: Pick<Trip, 'start' | 'end'>, ymd: string): boolean {
  return !!ymd && trip.start <= ymd && ymd <= trip.end;
}

/** The trip a day falls in, if any. With overlaps merged in from two devices, the earliest wins. */
export function tripOn(trips: readonly Trip[], ymd: string): Trip | null {
  return liveTrips(trips).find((t) => inTrip(t, ymd)) ?? null;
}

/** Another trip whose days overlap `candidate`'s, if any. Trips may not overlap. */
export function overlappingTrip(trips: readonly Trip[], candidate: Pick<Trip, 'id' | 'start' | 'end'>): Trip | null {
  return liveTrips(trips).find(
    (t) => t.id !== candidate.id && t.start <= candidate.end && candidate.start <= t.end,
  ) ?? null;
}

/** Whole days left including today, or null when the trip is not on today. */
export function daysLeft(trip: Pick<Trip, 'start' | 'end'>, today: string): number | null {
  return inTrip(trip, today) ? daysInclusive(today, trip.end) : null;
}

/* ── The rate and the maths ───────────────────────────────────────────── */

/**
 * A rate rounded the way a trip fixes it: 2 decimals, or 4 significant figures
 * below 1 (1 VND = ₹0.003605), so the rate shown is exactly the rate used.
 */
export function fixTripRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return rate >= 1 ? roundAmount(rate) : Number(rate.toPrecision(4));
}

/**
 * Today's rate for a trip, home units per 1 trip unit, from the layered rates
 * in `fx.ts`. Null when either currency has no rate: ask the user, never guess.
 */
export function tripRateFor(currency: string, homeCurrency: string, rates: RateTable): number | null {
  if (currency === homeCurrency) return 1;
  if (!hasRate(currency, rates) || !hasRate(homeCurrency, rates)) return null;
  const rate = fixTripRate(convert(1, currency, homeCurrency, rates));
  return rate > 0 ? rate : null;
}

/** The card fee is added to everything except cash. */
export function feeApplies(feePct: number | undefined, paymentMethod: string | undefined): boolean {
  return !!feePct && feePct > 0 && paymentMethod !== 'Cash';
}

/**
 * The home-currency amount of a spend paid in the trip currency:
 * foreign × rate × (1 + fee ÷ 100), fee skipped for cash, rounded like every
 * other amount (`roundAmount`, 2 decimals). Refunds (negative) work the same.
 */
export function tripHomeAmount(
  foreign: number,
  rate: number,
  feePct: number | undefined,
  paymentMethod: string | undefined,
): number {
  const fee = feeApplies(feePct, paymentMethod) ? feePct! : 0;
  return roundAmount(foreign * rate * (1 + fee / 100));
}

/** The rate with the card fee folded in, for display only ("= ₹24.84"). */
export function rateWithFee(rate: number, feePct: number | undefined): number {
  return rate * (1 + (feePct && feePct > 0 ? feePct : 0) / 100);
}

/**
 * Whether a spend stays in the home currency on a trip: anything recurring,
 * and the trip's home categories (rent, bills and so on by default). A legacy
 * key in the list also covers the Budget category it migrated to.
 */
export function staysHome(trip: Pick<Trip, 'homeCats'>, category: string, recurring: boolean | undefined): boolean {
  return !!recurring
    || trip.homeCats.some((k) => k === category || EXPENSE_CAT_MIGRATION[k] === category);
}

/**
 * The stays-home list a new trip starts with, in the user's own category keys.
 *
 * `DEFAULT_HOME_CATS` names the Expense Tracker's original keys (rent, bills,
 * EMI, subscriptions, investments); each is resolved with `migrateCategory`,
 * so "bills" is Utilities / Bills and "emi" is Investment for Loan. Everything
 * in the Savings section is added too: money set aside is not trip spending,
 * which is what "investments" means once categories come from the budget.
 */
export function defaultHomeCats(cats: ReadonlyArray<{ k: string; section?: string }>): string[] {
  const valid = new Set(cats.map((c) => c.k));
  const keys = [
    ...DEFAULT_HOME_CATS.map((k) => migrateCategory(k, valid)),
    ...cats.filter((c) => c.section === 'save').map((c) => c.k),
  ];
  return [...new Set(keys)].filter((k) => valid.has(k));
}

/** What a spend is priced against: a trip, or an edited spend's own saved rate and fee. */
export interface FxContext {
  /** The trip to tag the spend with, or null when that trip no longer exists. */
  tripId: string | null;
  currency: string;
  rate: number;
  feePct?: number;
}

export function contextOf(trip: Trip): FxContext {
  return { tripId: trip.id, currency: trip.currency, rate: trip.rate, feePct: trip.feePct };
}

type SpendMoney = Pick<ExpenseItem, 'amount' | 'fxAmount' | 'fxCurrency' | 'fxRate' | 'fxFee' | 'tripId'>;

/**
 * The money fields of a spend typed as `typed`.
 *
 * Used by every entry route (the full form and the quick-add line), so a spend
 * is priced the same way however it was entered:
 *
 *   - paid in the trip currency: priced with `tripHomeAmount`, with the foreign
 *     amount, currency, rate and applied fee saved alongside;
 *   - otherwise the typed amount, in the home currency.
 *
 * `tripId` tags the spend as trip spending either way (a hotel booked in ₹ is
 * still the trip's); it is null for rent, bills and the like.
 */
export function spendMoney(
  typed: number,
  { ctx, paidInTrip, tripId, paymentMethod }: {
    ctx: FxContext | null;
    /** The amount was typed in `ctx.currency`. */
    paidInTrip: boolean;
    tripId: string | null;
    paymentMethod?: string;
  },
): SpendMoney {
  const tag = tripId ? { tripId } : {};
  if (!ctx || !paidInTrip) return { amount: typed, ...tag };
  return {
    amount: tripHomeAmount(typed, ctx.rate, ctx.feePct, paymentMethod),
    fxAmount: typed,
    fxCurrency: ctx.currency,
    fxRate: ctx.rate,
    ...(feeApplies(ctx.feePct, paymentMethod) ? { fxFee: ctx.feePct } : {}),
    ...tag,
  };
}

/**
 * How a spend dated on `trip` is entered by default: in the trip currency,
 * unless it stays home (a home category, or recurring) or the trip is at home.
 * Returns the context to price against and the trip to tag, for `spendMoney`.
 */
export function tripDefaults(
  trip: Trip | null,
  category: string,
  recurring: boolean | undefined,
): { ctx: FxContext | null; paidInTrip: boolean; tripId: string | null } {
  if (!trip) return { ctx: null, paidInTrip: false, tripId: null };
  const home = staysHome(trip, category, recurring);
  const ctx = isHomeTrip(trip) ? null : contextOf(trip);
  return { ctx, paidInTrip: !!ctx && !home, tripId: home ? null : trip.id };
}

/* ── Trip expenses ─────────────────────────────────────────────────────── */

export function tripExpenses(items: readonly ExpenseItem[], tripId: string): ExpenseItem[] {
  return items.filter((e) => e.tripId === tripId);
}

/** True for a trip expense entered in the trip currency (it has a foreign amount). */
export function paidInTripCurrency(e: ExpenseItem, trip: Pick<Trip, 'currency'>): boolean {
  return e.fxCurrency === trip.currency && typeof e.fxAmount === 'number';
}

/**
 * The once-only rate refresh on the first day.
 *
 * A trip set up before it starts was priced at that day's rate. The first time
 * the app has fresh live rates on or after the start day, the rate is taken
 * again, once, and then never moves on its own. Skipped for a rate typed by
 * hand, and for a trip that already has expenses: their amounts were computed
 * at the old rate, and only the user changes those (with a question first).
 * Returns the updated trip, or null when nothing should change.
 */
export function firstDayRefresh(
  trip: Trip,
  { today, liveToday, liveAsOf, rates, hasExpenses, nowIso }: {
    today: string;
    /** Live rates were fetched today on this device. */
    liveToday: boolean;
    liveAsOf: string | null;
    rates: RateTable;
    hasExpenses: boolean;
    nowIso: string;
  },
): Trip | null {
  if (trip.rateRefreshed || trip.deletedAt || trip.rateSource === 'manual' || isHomeTrip(trip)) return null;
  if (today < trip.start || today > trip.end || !liveToday) return null;
  // Spends already priced at the old rate: the refresh is no longer due.
  if (hasExpenses) return { ...trip, rateRefreshed: true, updatedAt: nowIso };
  const rate = tripRateFor(trip.currency, trip.homeCurrency, rates);
  if (rate === null) return null;
  return {
    ...trip,
    rate,
    rateSource: 'live',
    ...(liveAsOf ? { rateAsOf: liveAsOf } : {}),
    rateRefreshed: true,
    updatedAt: nowIso,
  };
}

/**
 * Re-price a trip's foreign-currency expenses at a new rate or fee, after the
 * user said yes. Each one is recomputed from its own foreign amount and payment
 * method with `tripHomeAmount`. Returns the new ledger and each before/after
 * pair, so the change can be written to the history like any edit.
 */
export function repriceTripExpenses(
  items: readonly ExpenseItem[],
  trip: Pick<Trip, 'id' | 'currency'>,
  rate: number,
  feePct: number | undefined,
  nowIso: string,
): { next: ExpenseItem[]; changes: Array<{ before: ExpenseItem; after: ExpenseItem }> } {
  const changes: Array<{ before: ExpenseItem; after: ExpenseItem }> = [];
  const next = items.map((e) => {
    if (e.tripId !== trip.id || !paidInTripCurrency(e, trip)) return e;
    const amount = tripHomeAmount(e.fxAmount!, rate, feePct, e.paymentMethod);
    const fee = feeApplies(feePct, e.paymentMethod) ? feePct : undefined;
    const after: ExpenseItem = { ...e, amount, fxRate: rate, updatedAt: nowIso, editCount: (e.editCount ?? 0) + 1 };
    if (fee !== undefined) after.fxFee = fee;
    else delete after.fxFee;
    if (after.amount === e.amount && after.fxRate === e.fxRate && after.fxFee === e.fxFee) return e;
    changes.push({ before: e, after });
    return after;
  });
  return { next, changes };
}

/** How many of a trip's expenses a new rate or fee would re-price. */
export function repriceableCount(items: readonly ExpenseItem[], trip: Pick<Trip, 'id' | 'currency'>): number {
  return items.filter((e) => e.tripId === trip.id && paidInTripCurrency(e, trip)).length;
}

/* ── Summary ───────────────────────────────────────────────────────────── */

export interface TripSummary {
  /** Sum of `amount` over the trip's expenses, home currency. */
  homeTotal: number;
  /** Sum of the foreign amounts of expenses paid in the trip currency. */
  foreignTotal: number;
  /** Home-currency total of trip expenses switched to the home currency. */
  paidInHome: number;
  /** Trip days so far (start to today), or the whole trip once it has ended. 0 before it starts. */
  days: number;
  /** `homeTotal ÷ days`, or null before the trip starts. */
  dailyAverage: number | null;
  /** Home amounts by category, largest first. */
  byCategory: Array<{ category: string; home: number }>;
  /** The three biggest spends by home amount. */
  biggest: ExpenseItem[];
  count: number;
}

/** The figures the trip strip and the end-of-trip summary show. Read-only: nothing is stored. */
export function summarizeTrip(trip: Trip, items: readonly ExpenseItem[], today: string): TripSummary {
  const spends = tripExpenses(items, trip.id);
  let homeTotal = 0;
  let foreignTotal = 0;
  let paidInHome = 0;
  const byCat = new Map<string, number>();
  for (const e of spends) {
    homeTotal += e.amount;
    if (paidInTripCurrency(e, trip)) foreignTotal += e.fxAmount!;
    else paidInHome += e.amount;
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  }
  const lastDay = today < trip.end ? today : trip.end;
  const days = today < trip.start ? 0 : daysInclusive(trip.start, lastDay);
  return {
    homeTotal: roundAmount(homeTotal),
    foreignTotal: roundAmount(foreignTotal),
    paidInHome: roundAmount(paidInHome),
    days,
    dailyAverage: days > 0 ? roundAmount(homeTotal / days) : null,
    byCategory: [...byCat.entries()]
      .map(([category, home]) => ({ category, home: roundAmount(home) }))
      .sort((a, b) => b.home - a.home),
    biggest: [...spends].sort((a, b) => b.amount - a.amount).slice(0, 3),
    count: spends.length,
  };
}

/* ── Formatting ────────────────────────────────────────────────────────── */

/** "AED 120" or "AED 12.50": the trip currency by its code, which no symbol can confuse. */
export function fmtForeign(n: number, code: string): string {
  const abs = Math.abs(n);
  const digits = Number.isInteger(abs) ? 0 : 2;
  const body = abs.toLocaleString('en', { minimumFractionDigits: digits, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}${code} ${body}`;
}

/** An exact home amount with paise, e.g. "₹2,980.80", for previews of what will be saved. */
export function fmtExact(n: number, code: string): string {
  try {
    return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en', {
      style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(n).replace('-', '−');
  } catch {
    return `${n < 0 ? '−' : ''}${code} ${Math.abs(n).toFixed(2)}`;
  }
}

/** A trip day, short, in the reader's own style ("1 Dec"), like the transaction list's dates. */
export function fmtTripDay(ymd: string): string {
  const [y, m, d] = parts(ymd);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? ymd : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** A trip rate for display: as fixed, "24" → "24.00", "0.003605" as is. */
export function fmtRate(rate: number): string {
  return rate >= 1
    ? rate.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(Number(rate.toPrecision(4)));
}
