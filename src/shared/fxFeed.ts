/**
 * Exchange rates: the built-in table, and the contract between the edge Worker
 * that fetches live rates and the app that uses them.
 *
 * Shared by `worker/fxLatest.ts` and `src/tools/lib/fx.ts`, so the two can never
 * disagree about which currencies exist, what a believable rate is, or what a
 * response looks like. Pure: no storage, no network, no clock.
 *
 * WHERE LIVE RATES COME FROM
 * --------------------------
 * ExchangeRate-API's open endpoint (https://www.exchangerate-api.com/docs/free).
 * It is free with no key, updates once a day, and covers all forty codes below,
 * including VND, LKR and NPR, which the free central-bank feeds miss. Its terms
 * (read 24 Nov 2026) allow caching and personal or commercial use for currency
 * conversion. They require the attribution link in `FX_SOURCE` on pages that
 * use the rates, and they forbid redistributing the data. That last rule is why
 * the Worker answers only this app's own origins and is not offered as an API.
 */

/** The pivot. Every rate is units of that currency per 1 USD. */
export const FX_BASE = 'USD';

/** When `BASELINE_RATES` was captured. ISO date. */
export const FX_AS_OF = '2026-06-01';

/**
 * Indicative mid-market rates as of `FX_AS_OF`, units per 1 USD.
 *
 * Used only until this device has fetched live rates once (see
 * `effectiveRates` in src/tools/lib/fx.ts), so it is the offline fallback, not
 * the source of truth. Pegged currencies (AED, SAR, QAR, HKD) barely move and
 * are the most reliable entries here; free-floating ones drift and are exactly
 * why the staleness warning exists. These are mid-market rates. The rate a bank
 * or card actually gives you is worse, typically by 0.5–3%.
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

/** Every currency the app can convert. The live feed is checked against this list. */
export const FX_CODES: readonly string[] = Object.keys(BASELINE_RATES);

/** Where the app asks its own Worker for today's rates. */
export const FX_FEED_PATH = '/api/fx/latest';

/** The live source, and the attribution its terms require wherever its rates are used. */
export const FX_SOURCE = {
  id: 'exchangerate-api',
  label: 'Rates By Exchange Rate API',
  url: 'https://www.exchangerate-api.com',
} as const;

/**
 * The largest one-day move believed without a second look: 50%. A bigger jump
 * is far more often a broken feed than a real devaluation, so it is held back
 * until the next day's data confirms it (see `screenRates`).
 */
export const MAX_DAILY_MOVE = 0.5;

/** What the Worker answers with, and what the app saves. Rates are units per 1 USD. */
export interface FxFeed {
  base: typeof FX_BASE;
  /** The day the rates were published, `YYYY-MM-DD` (UTC). */
  asOf: string;
  /** `FX_SOURCE.id` for live rates. */
  source: string;
  rates: Record<string, number>;
}

/** A rate that can be divided by: a finite number above zero. */
export function isValidRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDay(value: unknown): value is string {
  return typeof value === 'string' && ISO_DAY.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

/**
 * The UTC calendar day of a Unix time in seconds.
 *
 * Deliberately UTC, unlike the app's local-day helpers: this labels when a
 * dataset was published, which is the same moment for everyone, not a day in
 * the reader's own calendar.
 */
function utcDay(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** What the Worker takes from one upstream response. Rates are not checked yet. */
export interface UpstreamRates {
  asOf: string;
  /** When the source says its next dataset is due, epoch ms, if it says. */
  nextUpdateAt: number | null;
  rates: Record<string, unknown>;
}

/** ExchangeRate-API's open-endpoint payload, or null when it is not one. */
export function parseUpstream(json: unknown): UpstreamRates | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const body = json as Record<string, unknown>;
  if (body.result !== 'success' || body.base_code !== FX_BASE) return null;
  const updated = body.time_last_update_unix;
  if (typeof updated !== 'number' || !Number.isFinite(updated) || updated <= 0) return null;
  const rates = body.rates;
  if (!rates || typeof rates !== 'object' || Array.isArray(rates)) return null;
  const next = body.time_next_update_unix;
  return {
    asOf: utcDay(updated),
    nextUpdateAt: typeof next === 'number' && Number.isFinite(next) && next > 0 ? next * 1000 : null,
    rates: rates as Record<string, unknown>,
  };
}

/** A rate that was not believed. */
export interface Rejection {
  code: string;
  /** `invalid`: not a number above zero. `jump`: moved more than `MAX_DAILY_MOVE` since the previous rate. */
  reason: 'invalid' | 'jump';
  value: unknown;
  /** The previous rate served instead, or null when there was none. */
  kept: number | null;
}

export interface Screened {
  rates: Record<string, number>;
  /** Jumps held back today. The next dataset confirms or drops each one. */
  pending: Record<string, number>;
  rejected: Rejection[];
}

/** True when `to` is more than `MAX_DAILY_MOVE` away from `from`, either way. */
export function movedTooFar(from: number, to: number): boolean {
  return Math.abs(to - from) / from > MAX_DAILY_MOVE;
}

/**
 * Today's rates, minus anything that should not be believed.
 *
 * A rate that is not a number above zero is rejected. So is a move of more than
 * 50% from the previous rate. Either way the previous rate is kept, and the
 * rejection is returned so the caller can log it.
 *
 * A held-back jump is remembered in `pending`. If the next dataset reports the
 * same new level again, the move is real and is accepted. Without that, a
 * genuine devaluation would be held back forever, because every later day would
 * be compared with the same old rate. A one-day glitch is never confirmed and
 * simply drops out.
 *
 * With no previous rates (the first fetch), only the number check applies:
 * there is no earlier day to compare with.
 */
export function screenRates(
  incoming: Readonly<Record<string, unknown>>,
  previous: Readonly<Record<string, number>> | null,
  pending: Readonly<Record<string, number>> = {},
  codes: readonly string[] = FX_CODES,
): Screened {
  const rates: Record<string, number> = {};
  const nextPending: Record<string, number> = {};
  const rejected: Rejection[] = [];

  for (const code of codes) {
    const value = incoming[code];
    const prev = previous && isValidRate(previous[code]) ? previous[code] : null;
    const reject = (reason: Rejection['reason']) => {
      rejected.push({ code, reason, value, kept: prev });
      if (prev !== null) rates[code] = prev;
    };

    if (!isValidRate(value)) {
      reject('invalid');
    } else if (prev !== null && movedTooFar(prev, value)) {
      const heldBack = pending[code];
      if (isValidRate(heldBack) && !movedTooFar(heldBack, value)) {
        rates[code] = value;
      } else {
        nextPending[code] = value;
        reject('jump');
      }
    } else {
      rates[code] = value;
    }
  }
  return { rates, pending: nextPending, rejected };
}

/**
 * The Worker's response, checked before the app saves anything.
 *
 * Codes that are missing or invalid are dropped, so the caller keeps whatever
 * it had for them. A response that has lost most of the table, or whose pivot
 * is not 1, is broken rather than sparse, and is refused whole.
 */
export function parseFeed(json: unknown, codes: readonly string[] = FX_CODES): FxFeed | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const body = json as Record<string, unknown>;
  if (body.base !== FX_BASE || !isIsoDay(body.asOf) || typeof body.source !== 'string' || !body.source) return null;
  const raw = body.rates;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const rates: Record<string, number> = {};
  for (const code of codes) {
    const value = (raw as Record<string, unknown>)[code];
    if (isValidRate(value)) rates[code] = value;
  }
  if (rates[FX_BASE] !== 1 || Object.keys(rates).length < codes.length / 2) return null;
  return { base: FX_BASE, asOf: body.asOf, source: body.source, rates };
}
