/**
 * The homepage's illustrated month, per market.
 *
 * FinatriX carries instrument sets, tax shapes and peer benchmarks for four
 * markets, and the homepage said so in words while showing rupees to all of
 * them. A visitor in Manchester read "built for India, the US, the UK and the
 * UAE" above ₹80,000 and had to take the first half on trust; the one concrete
 * demonstration of the claim on the whole page quietly contradicted it.
 *
 * WHY NOT CONVERT
 * ---------------
 * These are not the Indian figures at an exchange rate. ₹80,000 is about $900,
 * which is not a monthly take-home anyone in the US would recognise, and a
 * converted number carries the arithmetic of one country into the living costs
 * of another — the most misleading possible way to look local. Each market gets
 * round, plausible figures of its own, anchored on the same age band and city
 * tier the peer benchmarks in `tools/lib/markets` already use, and shaped to
 * the same proportions as the Indian original (≈46% recorded, 20% set aside,
 * the rest still to allocate) so the illustration tells the same story
 * everywhere.
 *
 * WHY IT IS STILL A DEFAULT AND NEVER A CLAIM ABOUT THE VISITOR
 * ------------------------------------------------------------
 * This reads the market the user has already CHOSEN, and nothing else. There is
 * no IP lookup, no geolocation prompt, and no inference from the request. With
 * no stored preference the homepage shows India's figures, which is what it has
 * always shown — see `marketForHomeExample`. The card says "Example figures" in
 * two places either way.
 *
 * Pure data. No DOM, no React, no storage access.
 */

import { DEFAULT_MARKET, MARKET_KEY, isMarketId, type MarketId } from '../tools/lib/markets/types';

export { MARKET_KEY } from '../tools/lib/markets/types';

export interface HomeExample {
  /** ISO 4217, shown next to "Illustration" so the currency is never guessed at. */
  currency: string;
  /** BCP-47 tag used to format the four figures. */
  locale: string;
  /** Monthly take-home. */
  income: number;
  /** Logged so far this month — not a full month of expenses. */
  spending: number;
  /** Moved to savings or investments this month. */
  setAside: number;
}

/**
 * One illustrated month per market.
 *
 * India's four figures are the ones the homepage has always shown, unchanged.
 * The other three are new and rounded to the nearest sensible note.
 */
export const HOME_EXAMPLES: Readonly<Record<MarketId, HomeExample>> = {
  IN: { currency: 'INR', locale: 'en-IN', income: 80_000, spending: 36_500, setAside: 16_000 },
  US: { currency: 'USD', locale: 'en-US', income: 4_800, spending: 2_200, setAside: 950 },
  GB: { currency: 'GBP', locale: 'en-GB', income: 3_200, spending: 1_450, setAside: 640 },
  AE: { currency: 'AED', locale: 'en-AE', income: 18_000, spending: 8_200, setAside: 3_600 },
  // Authored illustrations, not earnings or expenditure benchmarks.
  AU: { currency: 'AUD', locale: 'en-AU', income: 6_000, spending: 2_750, setAside: 1_200 },
  SG: { currency: 'SGD', locale: 'en-SG', income: 5_000, spending: 2_300, setAside: 1_000 },
  CN: { currency: 'CNY', locale: 'zh-CN', income: 10_000, spending: 4_600, setAside: 2_000 },
};

export interface HomeExampleView {
  market: MarketId;
  currency: string;
  income: string;
  spending: string;
  setAside: string;
  /** Income less what has been recorded and what has been set aside. */
  left: string;
  /** Segment widths for the allocation bar, as whole percentages of income. */
  bar: { spending: number; setAside: number; left: number };
}

/** Whole currency units, no decimals — these are illustrative round numbers. */
function money(amount: number, e: HomeExample): string {
  return new Intl.NumberFormat(e.locale, {
    style: 'currency',
    currency: e.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** The formatted illustration for a market, ready to render. */
export function homeExampleFor(market: MarketId): HomeExampleView {
  const e = HOME_EXAMPLES[market] ?? HOME_EXAMPLES[DEFAULT_MARKET];
  const left = e.income - e.spending - e.setAside;
  const pct = (n: number) => Math.round((n / e.income) * 100);
  return {
    market,
    currency: e.currency,
    income: money(e.income, e),
    spending: money(e.spending, e),
    setAside: money(e.setAside, e),
    left: money(left, e),
    bar: { spending: pct(e.spending), setAside: pct(e.setAside), left: pct(left) },
  };
}

/**
 * Which market's illustration to show: the one the user has chosen, or the
 * default when they have not chosen one.
 *
 * Deliberately NOT the detection used inside the tools. That guesses from the
 * browser's locale and time zone, which is defensible for seeding a setting the
 * user then owns — and indefensible on a marketing page, where the same guess
 * becomes the site telling a visitor where it thinks they are before they have
 * asked it anything. A stranger sees the default; someone who has used the
 * tools sees their own market, because they told us.
 *
 * Safe against a `localStorage` that throws (private mode, blocked site data).
 */
export function marketForHomeExample(): MarketId {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_MARKET;
    const stored = localStorage.getItem(MARKET_KEY);
    return isMarketId(stored) ? stored : DEFAULT_MARKET;
  } catch {
    return DEFAULT_MARKET;
  }
}
