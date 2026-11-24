/**
 * Currency conversion.
 *
 * WHY THIS EXISTS
 * ---------------
 * The product offered forty currencies and could not convert between any of
 * them. Changing the display currency swapped the symbol in front of every
 * number and left the number alone — so a user with a dollar salary and euro
 * rent was shown a total that was not a quantity of anything. The settings
 * screen even described amounts as "converted for display only", which was the
 * one thing they were not.
 *
 * WHERE THE RATES COME FROM
 * -------------------------
 * Three layers, later ones winning:
 *
 *   1. `BASELINE_RATES`, a dated table built into the app. Only for a device
 *      that has never fetched live rates, and for any code a fetch lacked.
 *   2. Live rates, fetched at most once a day through this app's own Worker
 *      (`fxLive.ts`, `worker/fxLatest.ts`) and saved with their date, so the
 *      app keeps working offline on the last rates it saw.
 *   3. The user's own overrides, synced, which is the honest answer for someone
 *      who knows the rate they actually got.
 *
 * Whatever is in use, its date is shown next to converted totals (`ratesAsOf`),
 * and `isStale` goes true after `STALE_AFTER_DAYS`, so a rate is never
 * presented as current when it is not.
 *
 * WHY USD IS THE PIVOT
 * --------------------
 * Every rate is "units of this currency per 1 USD" — one column of numbers
 * rather than a 40×40 matrix, and the convention every published table already
 * uses, so a fetched table is a copy rather than a transform.
 *
 * Pure apart from the load/save pairs for overrides and live rates.
 */

import { BASELINE_RATES, FX_AS_OF, FX_SOURCE, isValidRate, parseFeed } from '../../shared/fxFeed';
import { getJSON, setJSON } from './storage';

// The table and its date live in src/shared so the edge Worker reads the same
// forty codes. Re-exported here, where every caller already imports them from.
export { BASELINE_RATES, FX_AS_OF, FX_BASE } from '../../shared/fxFeed';

/** After this long, conversions are labelled stale in the UI. */
export const STALE_AFTER_DAYS = 120;

export const FX_OVERRIDES_KEY = 'fx_fx_overrides';

/**
 * This device's last live rates. A cache, not the user's data: it is not
 * synced, because every device can fetch its own.
 */
export const FX_LIVE_KEY = 'fx_fx_live';

export type RateTable = Readonly<Record<string, number>>;

/** Live rates as saved on this device. */
export interface LiveRates {
  /** The day the rates were published, `YYYY-MM-DD`. */
  asOf: string;
  /** Which feed they came from (`FX_SOURCE.id`). */
  source: string;
  /** Units per 1 USD. */
  rates: Record<string, number>;
  /** The local day this device last checked for newer rates, `YYYY-MM-DD`. */
  checkedOn: string;
}

/** The saved live rates, or null when this device has never fetched any. */
export function loadLiveRates(): LiveRates | null {
  const raw = getJSON<Record<string, unknown> | null>(FX_LIVE_KEY, null);
  if (!raw || typeof raw !== 'object') return null;
  // Saved data is re-checked like a response: storage is just another input.
  const feed = parseFeed({ base: 'USD', asOf: raw.asOf, source: raw.source, rates: raw.rates });
  if (!feed) return null;
  const checkedOn = typeof raw.checkedOn === 'string' ? raw.checkedOn : '';
  return { asOf: feed.asOf, source: feed.source, rates: feed.rates, checkedOn };
}

export function saveLiveRates(live: LiveRates): void {
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(live.rates)) if (isValidRate(value)) rates[code] = value;
  setJSON(FX_LIVE_KEY, { ...live, rates });
}

/** The date of the rates in use: the live date once fetched, the built-in table's before. */
export function ratesAsOf(live: LiveRates | null = loadLiveRates()): string {
  return live?.asOf ?? FX_AS_OF;
}

/** "24 November 2026", for a rates date (`YYYY-MM-DD`, a UTC publication day). */
export function ratesDateLabel(asOf: string): string {
  return new Date(`${asOf}T00:00:00Z`).toLocaleDateString('en', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/** True when the rates in use came from the live feed (so its attribution must be shown). */
export function ratesAreLive(live: LiveRates | null = loadLiveRates()): boolean {
  return live?.source === FX_SOURCE.id;
}

/** A rate the user typed in themselves, per currency code. */
export function loadRateOverrides(): Record<string, number> {
  const raw = getJSON<Record<string, unknown>>(FX_OVERRIDES_KEY, {});
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [code, value] of Object.entries(raw)) {
      const n = Number(value);
      // A zero or negative rate would divide by zero or flip signs downstream.
      if (Number.isFinite(n) && n > 0) out[code] = n;
    }
  }
  return out;
}

export function saveRateOverride(code: string, rate: number | null): void {
  const current = loadRateOverrides();
  if (rate === null || !Number.isFinite(rate) || rate <= 0) delete current[code];
  else current[code] = rate;
  setJSON(FX_OVERRIDES_KEY, current);
}

/**
 * The rates in use: the built-in table, then live rates, then the user's own.
 *
 * The table sits underneath rather than being dropped once live rates exist,
 * so a code a fetch lacked still converts instead of silently not converting.
 */
export function effectiveRates(
  overrides = loadRateOverrides(),
  live: LiveRates | null = loadLiveRates(),
): RateTable {
  return { ...BASELINE_RATES, ...(live?.rates ?? {}), ...overrides };
}

export function hasRate(code: string, rates: RateTable = BASELINE_RATES): boolean {
  return Number.isFinite(rates[code]) && rates[code] > 0;
}

/**
 * `amount` expressed in `from`, converted to `to`.
 *
 * Returns the amount UNCHANGED when either currency has no rate, rather than
 * zero or NaN. A missing rate is a gap in the table, and silently turning
 * someone's balance into nothing is the worst possible way to report one — the
 * caller asks `hasRate` when it needs to say so out loud.
 */
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: RateTable = BASELINE_RATES,
): number {
  if (from === to) return amount;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) {
    return amount;
  }
  // Via the pivot: into USD, then out to the target.
  return (amount / fromRate) * toRate;
}

/**
 * Whole days between the rates' date and `now`. Negative before that date.
 * Defaults to the rates in use, so it follows the live date once there is one.
 */
export function rateAgeDays(now: Date = new Date(), asOf: string = ratesAsOf()): number {
  const captured = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(captured)) return 0;
  return Math.floor((now.getTime() - captured) / 86_400_000);
}

export function isStale(now: Date = new Date(), asOf: string = ratesAsOf()): boolean {
  return rateAgeDays(now, asOf) > STALE_AFTER_DAYS;
}

/**
 * A converter bound to one target currency — the shape the tools want, so a
 * compute function can stay ignorant of rate tables entirely.
 */
export function converterTo(to: string, rates: RateTable = BASELINE_RATES) {
  return (amount: number, from: string): number => convert(amount, from, to, rates);
}
