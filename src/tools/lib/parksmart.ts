/**
 * ParkSmart — data + math, ported verbatim from PS_OPTS / PS_M / PS_DL and the
 * psTax()/psCalc() logic in tools-app.html. `psTax` and `computeParkSmart` are
 * pure and parity-checked against the source. ParkSmart renders with INR `fmt`.
 */
import type { IconName } from '../ui/Icon';

export interface ParkOption {
  n: string;
  rate: number;
  tax: 'slab80tta' | 'slab' | 'equity';
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

/** Post-tax return for an option (verbatim port of psTax). */
export function psTax(opt: ParkOption, gross: number, months: number, slabPct: number, _amt: number): number {
  void _amt;
  if (opt.tax === 'equity') {
    if (months >= 12) {
      const exempt = 125000 * (months / 12); // LTCG exemption pro-rated to holding period
      const taxable = Math.max(0, gross - exempt);
      return gross - taxable * 0.125; // LTCG 12.5%
    }
    return gross * (1 - 0.2); // STCG 20%
  }
  if (opt.tax === 'slab80tta') {
    const exempt = 10000 * (months / 12); // 80TTA pro-rated (old regime)
    const taxable = Math.max(0, gross - exempt);
    return gross - taxable * slabPct;
  }
  return gross * (1 - slabPct); // taxed at slab
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

/** Verbatim port of psCalc()'s ranking core. `amt < 1000` is invalid. */
export function computeParkSmart(amt: number, dur: string, slabPct: number): ParkResult {
  if (amt < 1000) return { valid: false, ranked: [], best: null, maxNet: 1, split: null };
  const months = PS_M[dur];

  const ranked: RankedOption[] = PS_OPTS.filter((o) => months >= o.minM && (dur !== '0-1' || o.liquid))
    .map((o) => {
      const gross = amt * (o.rate / 100) * (months / 12);
      const net = Math.max(0, psTax(o, gross, months, slabPct, amt));
      const effRate = amt > 0 && months > 0 ? (net / amt) * (12 / months) * 100 : 0;
      return { ...o, gross, net, effRate };
    })
    .sort((a, b) => b.net - a.net);

  const best = ranked[0];
  const maxNet = best.net || 1;

  let split: SplitIdea | null = null;
  const bestLiquid = ranked.find((o) => o.liquid);
  if (amt >= 100000 && bestLiquid && bestLiquid.n !== best.n && !best.liquid) {
    const buf = Math.round(amt * 0.3);
    const core = amt - buf;
    split = { core, buf, bestName: best.n, bestLiquidName: bestLiquid.n };
  }

  return { valid: true, ranked, best, maxNet, split };
}
