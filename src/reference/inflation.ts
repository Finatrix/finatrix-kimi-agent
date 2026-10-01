/**
 * Published consumer-price observations — context, never an input.
 *
 * THE DISTINCTION THIS FILE EXISTS TO HOLD
 * ----------------------------------------
 * FinatriX already has an inflation number: `GoalsPack.inflation`, 6% for India
 * and 2.5% elsewhere, used to gross a goal stated in today's money up to future
 * money. That number is a PLANNING ASSUMPTION. It is a long-run choice, it is
 * meant to be boring and slow-moving, and it is the user's to disagree with.
 *
 * The numbers in this file are something else entirely: single monthly
 * observations of what prices actually did, published by a statistics office,
 * in a stated month, for a stated index. India's July print is 4.45%. That is
 * not a forecast and it is not a planning rate — feeding one month's
 * year-on-year reading into a thirty-year projection would be the most
 * confident-looking mistake this product could make, because it dresses a
 * volatile measurement up as an expectation.
 *
 * So the two never meet. The planning assumption stays in the market pack,
 * untouched; these observations render next to it as context — "the most recent
 * published reading was X for month Y" — so a reader can judge whether their
 * planning assumption is sane. `reference.test.ts` asserts that no calculator
 * module imports this file, which is what keeps the separation structural
 * rather than a convention people remember.
 *
 * SERIES IDENTITY MATTERS
 * -----------------------
 * The UK's headline is CPI at 2.9%; the ONS's own lead measure, CPIH, is 3.1%
 * and covers housing differently. Singapore's all-items is 2.2% while MAS Core,
 * which excludes accommodation and private transport, is 2.0%. Swapping one for
 * the other silently is how a product ends up quoting a figure nobody can
 * reproduce, so `measure` names the exact series and is always rendered.
 */

import type { DataQualityState, IsoDate, ReferenceMarket } from './types';

export interface InflationObservation {
  readonly market: ReferenceMarket;
  /** The exact published series. Rendered, never abbreviated away. */
  readonly measure: string;
  /**
   * Year-on-year percent for `observationPeriod`.
   *
   * Named `observedYoY` rather than `rate` or `inflation` on purpose: a field
   * called `inflation` invites being passed to a function whose parameter is
   * called `inflation`, and that function is a thirty-year projection.
   */
  readonly observedYoY: number;
  /** `YYYY-MM`, or `YYYY-Qn` where only a quarter was published. */
  readonly observationPeriod: string;
  readonly publicationDate: IsoDate;
  readonly sourceId: string;
  readonly lastVerified: string;
  readonly reviewDue: string;
  readonly quality: DataQualityState;
  /**
   * Whether this is confirmed to be the newest release.
   *
   * False does not mean wrong — it means a newer print may exist and was not
   * checked, so the UI must not badge it "latest".
   */
  readonly confirmedLatest: boolean;
  readonly notes: string;
  /** A literal, so the type itself records that this is not a planning rate. */
  readonly contextOnly: true;
}

export const INFLATION_OBSERVATIONS: readonly InflationObservation[] = [
  {
    market: 'IN',
    measure: 'All-India CPI (combined)',
    observedYoY: 4.45,
    observationPeriod: '2026-07',
    publicationDate: null,
    sourceId: 'IND-NSO-001',
    lastVerified: '2026-09-12',
    reviewDue: '2026-09-12',
    // The August release fell on or about the research cutoff and was not
    // checked, so July is a provisional historical reading rather than "the
    // latest figure" — a distinction the badge logic depends on.
    quality: 'REVIEW_DUE',
    confirmedLatest: false,
    notes: 'Provisional July reading. A newer release was due around the research cutoff and has not been verified.',
    contextOnly: true,
  },
  {
    market: 'AU',
    measure: 'All groups CPI (monthly)',
    observedYoY: 3.5,
    observationPeriod: '2026-07',
    publicationDate: '2026-08-26',
    sourceId: 'AUS-ABS-001',
    lastVerified: '2026-09-12',
    reviewDue: '2026-09-30',
    quality: 'VERIFIED_CURRENT',
    confirmedLatest: true,
    notes: 'The monthly full CPI, which is a different series from the older monthly indicator and from the quarterly CPI.',
    contextOnly: true,
  },
  {
    market: 'US',
    measure: 'CPI-U, all items, US city average (NSA, year-on-year)',
    observedYoY: 3.4,
    observationPeriod: '2026-08',
    publicationDate: '2026-09-11',
    sourceId: 'US-BLS-001',
    lastVerified: '2026-09-12',
    reviewDue: '2026-10-14',
    quality: 'VERIFIED_CURRENT',
    confirmedLatest: true,
    notes: 'Taken from the dated August bulletin. The CPI landing page still described July at the time of checking.',
    contextOnly: true,
  },
  {
    market: 'GB',
    measure: 'CPI',
    observedYoY: 2.9,
    observationPeriod: '2026-07',
    publicationDate: '2026-08-19',
    sourceId: 'UK-ONS-001',
    lastVerified: '2026-09-12',
    reviewDue: '2026-09-16',
    quality: 'VERIFIED_CURRENT',
    confirmedLatest: true,
    notes: 'The ONS lead measure, CPIH, was 3.1% for the same month and covers owner-occupied housing. The two are not interchangeable.',
    contextOnly: true,
  },
  {
    market: 'SG',
    measure: 'CPI — All Items',
    observedYoY: 2.2,
    observationPeriod: '2026-07',
    publicationDate: '2026-08-24',
    sourceId: 'SG-MTI-001',
    lastVerified: '2026-09-12',
    reviewDue: '2026-09-23',
    quality: 'VERIFIED_CURRENT',
    confirmedLatest: true,
    notes: 'MAS Core inflation was 2.0% for the same month; it excludes accommodation and private transport.',
    contextOnly: true,
  },
  {
    market: 'CN',
    measure: 'National CPI',
    observedYoY: 0.8,
    observationPeriod: '2026-08',
    publicationDate: '2026-09-09',
    sourceId: 'CN-NBS-001',
    lastVerified: '2026-09-12',
    reviewDue: '2026-10-09',
    quality: 'VERIFIED_CURRENT',
    confirmedLatest: true,
    notes: 'Rebased to 2025 from January 2026; levels from the old base cannot be spliced on without linking.',
    contextOnly: true,
  },
  {
    market: 'AE',
    measure: 'National all-items CPI (latest verified quarter)',
    observedYoY: 1.9,
    observationPeriod: '2025-Q4',
    publicationDate: null,
    sourceId: 'UAE-CBUAE-003',
    lastVerified: '2026-09-12',
    reviewDue: '2026-09-12',
    // A historical quarter reached via the central bank quoting the statistics
    // authority. The current monthly series was not obtainable, and a forecast
    // in the same document is not a substitute for an observation.
    quality: 'STALE',
    confirmedLatest: false,
    notes: 'A historical quarterly actual, reached via the Central Bank quoting the statistics authority. The current monthly reading was not verified.',
    contextOnly: true,
  },
];

const BY_MARKET: ReadonlyMap<ReferenceMarket, InflationObservation> = new Map(
  INFLATION_OBSERVATIONS.map((o) => [o.market, o]),
);

export function inflationFor(market: ReferenceMarket): InflationObservation | undefined {
  return BY_MARKET.get(market);
}

/** `"2026-07"` → `"July 2026"`; `"2025-Q4"` → `"Q4 2025"`. Input back if unrecognised. */
export function periodLabel(period: string): string {
  const q = /^(\d{4})-Q([1-4])$/.exec(period);
  if (q) return `Q${q[2]} ${q[1]}`;
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return period;
  return new Date(Number(m[1]), month - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' });
}
