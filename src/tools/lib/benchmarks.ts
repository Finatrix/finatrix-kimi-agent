/**
 * Published benchmarks, with their provenance attached.
 *
 * Why this module exists
 * ──────────────────────
 * PeerCompare used to ship a 7 × 3 grid of income, savings, investment,
 * savings-rate, expense and net-worth "averages" — 126 numbers — written by
 * hand into a source file, under a footer reading "Benchmarks modelled on RBI,
 * PLFS & survey data". Nothing substantiated that footer. It attributed
 * invented constants to India's central bank and its national statistics
 * office, on an indexable page, in direct breach of the site's own first
 * editorial rule: *we never present an estimate as a measurement*.
 *
 * Researching the claim produced a more useful answer than a better table:
 * **most of those numbers cannot be sourced, because nobody publishes them.**
 * MoSPI does not release earnings disaggregated by age; no official Indian
 * series reports household savings, investment corpus or net worth by age
 * bracket and city tier at all. The grid was not a bad estimate of a real
 * quantity — it was a shape with no measurement behind it.
 *
 * So the rule here is: every figure that reaches a user is one of three things,
 * and the UI says which:
 *
 *   • `measured`  — a published figure, with publisher, period and URL;
 *   • `derived`   — arithmetic over the user's own inputs and a `measured`
 *                   figure, with the derivation stated;
 *   • `guideline` — a widely-used planning rule of thumb, named as one, never
 *                   dressed up as a peer average.
 *
 * Nothing else is allowed to become a benchmark.
 */

/** Where a figure came from, specific enough that a reader can go and check. */
export interface DataSource {
  /** Short label used in the UI. */
  label: string;
  /** Full title of the publication. */
  title: string;
  publisher: string;
  /** The period the data describes, not the period it was published in. */
  period: string;
  /** When the publication was released. */
  released: string;
  url: string;
}

export const SOURCES = {
  plfs2025: {
    label: 'PLFS 2025',
    title: 'Periodic Labour Force Survey (PLFS) Annual Report, 2025',
    publisher: 'National Statistics Office, Ministry of Statistics and Programme Implementation',
    period: 'January – December 2025',
    released: '27 March 2026',
    url: 'https://www.mospi.gov.in/publication/periodic-labour-force-survey',
  },
  rbiAnnual2025: {
    label: 'RBI Annual Report 2024-25',
    title: 'Reserve Bank of India Annual Report 2024-25',
    publisher: 'Reserve Bank of India',
    period: 'Financial year 2024-25',
    released: 'May 2026',
    url: 'https://www.rbi.org.in/Scripts/AnnualReportMainDisplay.aspx',
  },
} as const satisfies Record<string, DataSource>;

/** How much confidence a number is entitled to. Rendered next to it. */
export type Provenance = 'measured' | 'derived' | 'guideline';

export interface Benchmark {
  /** What the number is. */
  label: string;
  value: number;
  provenance: Provenance;
  /** Present iff `provenance === 'measured'`. */
  source?: DataSource;
  /** One line the UI shows verbatim: where it comes from, or how it is worked out. */
  basis: string;
}

// ─────────────────────────── measured ───────────────────────────

/**
 * Average monthly earnings of regular wage/salaried employees, PLFS 2025.
 *
 * Published separately for men and women; MoSPI does not publish a combined
 * all-persons figure in the release, and it does not publish earnings by age at
 * all. Both published values are shown to the user, so the midpoint below is
 * arithmetic they can redo from figures printed on the same page rather than a
 * number they have to take on trust.
 */
export const PLFS_REGULAR_WAGE_MONTHLY = {
  male: 24217,
  female: 18353,
  /** Prior year, for the growth line. */
  malePrev: 22891,
  femalePrev: 17126,
} as const;

/** Unweighted midpoint of the two published figures. Stated, never hidden. */
export const PLFS_REGULAR_WAGE_MIDPOINT = Math.round(
  (PLFS_REGULAR_WAGE_MONTHLY.male + PLFS_REGULAR_WAGE_MONTHLY.female) / 2,
);

export const INCOME_BENCHMARK: Benchmark = {
  label: 'Average monthly earnings, regular wage/salaried workers',
  value: PLFS_REGULAR_WAGE_MIDPOINT,
  provenance: 'measured',
  source: SOURCES.plfs2025,
  basis:
    `Midpoint of the published all-India averages for men (₹${PLFS_REGULAR_WAGE_MONTHLY.male.toLocaleString('en-IN')}) ` +
    `and women (₹${PLFS_REGULAR_WAGE_MONTHLY.female.toLocaleString('en-IN')}). ` +
    'National, not city- or age-adjusted: MoSPI publishes neither breakdown.',
};

/**
 * Net household financial savings as a share of gross national disposable
 * income, RBI Annual Report 2024-25 (7.0%, up from 5.8% the year before).
 *
 * This is a national-accounts aggregate, not the mean of household savings
 * rates, and it is net of the increase in household liabilities. It is the
 * closest official figure to "what share of income Indian households actually
 * keep", and the UI says exactly that rather than implying it is a survey of
 * personal savings rates.
 */
export const RBI_NET_HH_FINANCIAL_SAVINGS_PCT = 7.0;
export const RBI_GROSS_HH_FINANCIAL_SAVINGS_PCT = 11.8;

export const SAVINGS_RATE_BENCHMARK: Benchmark = {
  label: 'Net household financial savings',
  value: RBI_NET_HH_FINANCIAL_SAVINGS_PCT,
  provenance: 'measured',
  source: SOURCES.rbiAnnual2025,
  basis:
    `${RBI_NET_HH_FINANCIAL_SAVINGS_PCT}% of gross national disposable income in FY 2024-25 ` +
    `(gross financial savings were ${RBI_GROSS_HH_FINANCIAL_SAVINGS_PCT}%). ` +
    'A national-accounts aggregate net of new household borrowing — not a survey of individual savings rates.',
};

// ────────────────────────── guidelines ──────────────────────────

/**
 * Planning rules of thumb. These are conventions, not measurements, and the UI
 * labels them as such. They are here rather than inline so that the one place
 * a reader looks for "where did this number come from" answers for all of them.
 */
export const GUIDELINES = {
  /** Months of expenses to hold liquid. The common 3–6 range, upper bound. */
  emergencyMonths: 6,
  /** Lower bound of the same range, below which the UI warns. */
  emergencyMonthsMin: 3,
  /**
   * Debt-service ratio ceiling: total EMIs as a share of gross monthly income.
   * 36% is the conventional lending guideline; above 43% most Indian lenders
   * decline further unsecured credit.
   */
  debtServiceComfortable: 36,
  debtServiceStretched: 43,
} as const;

export const EMERGENCY_FUND_BENCHMARK: Benchmark = {
  label: 'Emergency fund',
  value: GUIDELINES.emergencyMonths,
  provenance: 'guideline',
  basis:
    `${GUIDELINES.emergencyMonthsMin}–${GUIDELINES.emergencyMonths} months of expenses held liquid. ` +
    'A widely used planning convention, not a measurement of what anyone actually holds.',
};

export const DEBT_SERVICE_BENCHMARK: Benchmark = {
  label: 'Debt-service ratio',
  value: GUIDELINES.debtServiceComfortable,
  provenance: 'guideline',
  basis:
    `Total EMIs as a share of gross monthly income. Lenders generally treat up to ` +
    `${GUIDELINES.debtServiceComfortable}% as comfortable and decline further unsecured credit ` +
    `beyond about ${GUIDELINES.debtServiceStretched}%.`,
};

/** Every source cited anywhere, for the tool's methodology footer. */
export const CITED_SOURCES: readonly DataSource[] = [SOURCES.plfs2025, SOURCES.rbiAnnual2025];
