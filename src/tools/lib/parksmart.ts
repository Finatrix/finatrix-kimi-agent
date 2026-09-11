/**
 * ParkSmart — data + math, ported verbatim from PS_OPTS / PS_M / PS_DL and the
 * psTax()/psCalc() logic in tools-app.html. `psTax` and `computeParkSmart` are
 * pure and parity-checked against the source.
 *
 * MARKETS
 * -------
 * `PS_OPTS` is the Indian instrument set and stays exactly what it was — the
 * parity suite compares it field-for-field against the archived original. What
 * changed is that `computeParkSmart` now takes the instrument list and its tax
 * treatments as an optional argument, defaulting to India's. A market pack
 * (see `markets/`) supplies a different list; the ranking arithmetic below
 * never learns which country it is pricing.
 *
 * `psTax` is kept as a named export because the parity harness calls it
 * directly. It now delegates to the shared `netAfterTax` engine, which is
 * written to reproduce its branches operation-for-operation — the parity test
 * is what proves that, across every option, holding period and slab.
 */
import type { IconName } from '../ui/Icon';
import { netAfterTax, type TaxTreatment } from './markets/tax';

export interface ParkOption {
  n: string;
  rate: number;
  /**
   * Key into the market's `treatments` map. India's three keys are the original
   * literals; a pack may define any others it needs. Typed as `string` rather
   * than a union so adding a market never edits this file.
   */
  tax: string;
  liquid: boolean;
  risk: string;
  ic: IconName;
  d: string;
  minM: number;
}

export const PS_OPTS: ParkOption[] = [
  { n: 'Savings account', rate: 3.5, tax: 'slab80tta', liquid: true, risk: 'None', ic: 'bank', d: 'Instant access. First ₹10K interest tax-free under 80TTA (old regime). Small Finance Banks offer 6–7%.', minM: 0 },
  { n: 'Liquid mutual fund', rate: 7.0, tax: 'slab', liquid: true, risk: 'Very low', ic: 'invest-cat', d: 'Redeems next business day. Category avg 30-day annualised ~7%. Ideal 1 week – 3 months.', minM: 0 },
  { n: 'Overnight fund', rate: 6.2, tax: 'slab', liquid: true, risk: 'Negligible', ic: 'clock', d: '1-day maturity paper. Safest MF category. Slightly below liquid funds but zero duration risk.', minM: 0 },
  { n: 'Bank FD (1 yr)', rate: 7.0, tax: 'slab', liquid: false, risk: 'None*', ic: 'lock', d: 'SBI/HDFC: 6.5–7%. Small Finance Banks: 7.5–8%. DICGC insured to ₹5L. ~1% premature exit penalty.', minM: 1 },
  { n: 'Arbitrage fund', rate: 7.1, tax: 'equity', liquid: true, risk: 'Low', ic: 'refresh', d: 'Exploits cash-futures spread. Equity tax: 20% STCG, 12.5% LTCG above ₹1.25L. Best for 20–30% slab holders after 3+ months.', minM: 3 },
  { n: '91-day T-Bill', rate: 6.5, tax: 'slab', liquid: false, risk: 'None', ic: 'bills', d: 'Government of India backed. Zero credit risk. Buy via RBI Retail Direct or a debt MF.', minM: 3 },
  { n: 'Money market fund', rate: 6.8, tax: 'slab', liquid: true, risk: 'Very low', ic: 'dollar', d: 'CDs, CPs, T-bills up to 1-year. Lower volatility than liquid, slightly higher yield.', minM: 1 },
  { n: 'Ultra short duration', rate: 7.0, tax: 'slab', liquid: true, risk: 'Low', ic: 'zap', d: '3–6 month Macaulay duration. Minor NAV moves. Good for 3–9 month horizon.', minM: 3 },
  { n: 'Short duration fund', rate: 7.4, tax: 'slab', liquid: true, risk: 'Low–med', ic: 'trending', d: '1–3 year bond portfolio. Higher yield but sensitive to rate changes. Best for 6+ months.', minM: 6 },
  { n: 'Sweep-in FD', rate: 6.6, tax: 'slab', liquid: true, risk: 'None*', ic: 'layers', d: 'Bank auto-parks idle balance into FD; breaks in exact units when you spend. Zero effort, FD returns.', minM: 0 },
];

export const PS_M: Record<string, number> = { '0-1': 0.5, '1-3': 2, '3-6': 4.5, '6-12': 9, '12+': 15 };
export const PS_DL: Record<string, string> = { '0-1': 'under 1 month', '1-3': '1–3 months', '3-6': '3–6 months', '6-12': '6–12 months', '12+': 'over 1 year' };

/**
 * India's three tax treatments, as data.
 *
 * These reproduce the original `psTax` exactly: equity is 20% STCG under twelve
 * months and 12.5% LTCG above a ₹1.25L exemption pro-rated to the holding
 * period; `slab80tta` is the ₹10,000 savings-interest allowance pro-rated the
 * same way and then the user's slab; `slab` is the slab on the whole return.
 */
export const IN_TREATMENTS: Readonly<Record<string, TaxTreatment>> = {
  equity: { gains: { months: 12, allowance: 125000, rate: 0.125, shortRate: 0.2 } },
  slab80tta: { allowance: 10000 },
  slab: {},
};

/**
 * Post-tax return for an option (verbatim port of psTax).
 *
 * Delegates to `netAfterTax` with India's treatments. Kept as its own export
 * with its original signature because the parity harness compares it directly
 * against the function compiled out of the archived tools-app.html.
 */
export function psTax(opt: ParkOption, gross: number, months: number, slabPct: number, _amt: number): number {
  void _amt;
  return netAfterTax(IN_TREATMENTS[opt.tax] ?? IN_TREATMENTS.slab, gross, months, slabPct);
}

export interface RankedOption extends ParkOption {
  gross: number;
  net: number;
  effRate: number;
}
export interface SplitIdea {
  core: number;
  buf: number;
  bestName: string;
  bestLiquidName: string;
}
export interface ParkResult {
  valid: boolean;
  ranked: RankedOption[];
  best: RankedOption | null;
  maxNet: number;
  split: SplitIdea | null;
}

/**
 * The instrument set a ranking runs against: what you can park cash in, and how
 * each is taxed. A market pack is one of these plus its labels.
 */
export interface ParkInstruments {
  options: readonly ParkOption[];
  treatments: Readonly<Record<string, TaxTreatment>>;
  /**
   * Below this the tool declines to answer, in the market's own currency.
   * ₹1,000 in India; a pack sets its own, because "too small to bother
   * optimising" is a different number in dollars than it is in rupees.
   */
  minAmount: number;
  /** Above this a liquid/locked split is worth suggesting. */
  splitThreshold: number;
}

/**
 * India — the original instrument set and thresholds, unchanged.
 * `computeParkSmart` uses this when no pack is passed, which is what keeps the
 * parity suite (and every existing caller) on exactly the code that shipped.
 */
export const IN_PARK: ParkInstruments = {
  options: PS_OPTS,
  treatments: IN_TREATMENTS,
  minAmount: 1000,
  splitThreshold: 100000,
};

/**
 * Verbatim port of psCalc()'s ranking core, now parameterised by market.
 *
 * The arithmetic is untouched: gross return, post-tax net, annualised effective
 * rate, sort by net, and a split suggestion when the winner locks the money up.
 * Only the inputs moved — which instruments exist, how they are taxed, and the
 * two currency-scaled thresholds.
 */
export function computeParkSmart(
  amt: number,
  dur: string,
  slabPct: number,
  pack: ParkInstruments = IN_PARK,
): ParkResult {
  if (amt < pack.minAmount) return { valid: false, ranked: [], best: null, maxNet: 1, split: null };
  const months = PS_M[dur];

  const ranked: RankedOption[] = pack.options.filter((o) => months >= o.minM && (dur !== '0-1' || o.liquid))
    .map((o) => {
      const gross = amt * (o.rate / 100) * (months / 12);
      const net = Math.max(0, netAfterTax(pack.treatments[o.tax] ?? {}, gross, months, slabPct));
      const effRate = amt > 0 && months > 0 ? (net / amt) * (12 / months) * 100 : 0;
      return { ...o, gross, net, effRate };
    })
    .sort((a, b) => b.net - a.net);

  const best = ranked[0];
  const maxNet = best.net || 1;

  let split: SplitIdea | null = null;
  const bestLiquid = ranked.find((o) => o.liquid);
  if (amt >= pack.splitThreshold && bestLiquid && bestLiquid.n !== best.n && !best.liquid) {
    const buf = Math.round(amt * 0.3);
    const core = amt - buf;
    split = { core, buf, bestName: best.n, bestLiquidName: bestLiquid.n };
  }

  return { valid: true, ranked, best, maxNet, split };
}
