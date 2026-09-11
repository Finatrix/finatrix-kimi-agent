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
 * WHAT THIS IS, AND WHAT IT IS NOT
 * --------------------------------
 * This is a DATED, STATIC baseline table plus a per-user override. It is not a
 * live feed, and it does not pretend to be:
 *
 *   • `FX_AS_OF` is shipped with the table and rendered next to converted
 *     totals, so a rate is never presented as current when it is not.
 *   • `isStale` goes true after `STALE_AFTER_DAYS`, and the UI says so rather
 *     than quietly reporting figures from last year.
 *   • Any rate can be overridden by the user and the override is synced, which
 *     is the honest answer for someone who knows the rate they actually got.
 *
 * A cron-refreshed dataset is the real fix and this module is shaped for it:
 * swap `BASELINE_RATES` for fetched values and everything above keeps working.
 * Until then a stale, visible, correctable rate beats no conversion at all.
 *
 * WHY USD IS THE PIVOT
 * --------------------
 * Every rate is "units of this currency per 1 USD" — one column of numbers
 * rather than a 40×40 matrix, and the convention every published table already
 * uses, so replacing the baseline later is a copy rather than a transform.
 *
 * Pure apart from the override load/save pair at the bottom.
 */

import { getJSON, setJSON } from './storage';

/** When `BASELINE_RATES` was captured. ISO date. */
export const FX_AS_OF = '2026-06-01';

/** The pivot. Every rate below is units of that currency per 1 USD. */
export const FX_BASE = 'USD';

/** After this long, conversions are labelled stale in the UI. */
export const STALE_AFTER_DAYS = 120;

export const FX_OVERRIDES_KEY = 'fx_fx_overrides';

/**
 * Indicative mid-market rates as of `FX_AS_OF`, units per 1 USD.
 *
 * Pegged currencies (AED, SAR, QAR, HKD) barely move and are the most reliable
 * entries here; free-floating ones drift and are exactly why the staleness
 * warning exists. These are mid-market rates — the rate a bank or card actually
 * gives you is worse, typically by 0.5–3%.
 */
export const BASELINE_RATES: Readonly<Record<string, number>> = {
  USD: 1,
  INR: 88, EUR: 0.92, GBP: 0.79, JPY: 150, CNY: 7.2,
  AUD: 1.52, CAD: 1.38, CHF: 0.88, SGD: 1.34, HKD: 7.8,
  NZD: 1.66, AED: 3.6725, SAR: 3.75, QAR: 3.64, KWD: 0.307,
  ZAR: 18.2, BRL: 5.4, MXN: 18.5, RUB: 92, KRW: 1350,
  TRY: 38, IDR: 16000, MYR: 4.4, THB: 34.5, PHP: 57,
  VND: 25000, PKR: 278, BDT: 120, LKR: 300, NPR: 141,
  NGN: 1500, EGP: 48, ILS: 3.7, SEK: 10.5, NOK: 10.8,
  DKK: 6.85, PLN: 3.95, CZK: 23, HUF: 360,
};

export type RateTable = Readonly<Record<string, number>>;

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

/** The baseline with the user's own rates layered on top. */
export function effectiveRates(overrides = loadRateOverrides()): RateTable {
  return { ...BASELINE_RATES, ...overrides };
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

/** Whole days between `FX_AS_OF` and `now`. Negative before the capture date. */
export function rateAgeDays(now: Date = new Date()): number {
  const asOf = Date.parse(`${FX_AS_OF}T00:00:00Z`);
  if (!Number.isFinite(asOf)) return 0;
  return Math.floor((now.getTime() - asOf) / 86_400_000);
}

export function isStale(now: Date = new Date()): boolean {
  return rateAgeDays(now) > STALE_AFTER_DAYS;
}

/**
 * A converter bound to one target currency — the shape the tools want, so a
 * compute function can stay ignorant of rate tables entirely.
 */
export function converterTo(to: string, rates: RateTable = BASELINE_RATES) {
  return (amount: number, from: string): number => convert(amount, from, to, rates);
}
