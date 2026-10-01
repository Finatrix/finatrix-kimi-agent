/**
 * Tax reference data — and the policy that keeps it out of the calculators.
 *
 * READ THIS BEFORE ADDING A TAX FEATURE
 * -------------------------------------
 * FinatriX is not, and is not becoming, tax-preparation software. What is
 * recorded here is a set of *ordinary-income rate schedules* — the marginal
 * bands, for a stated period, for a stated filing basis — plus, for every
 * market and every income category, an explicit statement of what the product
 * is allowed to do with them.
 *
 * The answer is almost always "explain, never compute". The reason is not
 * caution for its own sake; it is that a rate schedule is a small fraction of a
 * tax bill. Standard deductions, rebates with eligibility tests and marginal
 * relief, surcharges and cess, social charges that are not income tax at all,
 * state and local taxes, special rates for gains and dividends, residency,
 * filing status, and part-year positions all sit between "taxable income" and
 * "tax owed". A product that multiplies a salary by a band and shows the answer
 * has not estimated someone's tax; it has produced a number that is wrong in a
 * direction they cannot see.
 *
 * So `automaticCalculationApproved` is `false` on every record in this file, and
 * `taxPolicyFor` is the function that says so out loud. Where a tool needs a
 * tax input — ParkSmart's marginal-rate control — it asks the user, and this
 * registry supplies the *context* that helps them answer: which schedule
 * applies, for which period, and what it deliberately leaves out.
 *
 * TWO TRAPS WORTH NAMING
 * ----------------------
 * India: AY 2026–27 and TY 2026–27 describe different income periods. The
 * schedule below is the TY 2026–27 new-regime component under the 2025 Act;
 * `period` and `effectiveDate` are both carried so the two can never be
 * conflated by a suffix match.
 *
 * The United Kingdom and the United States are `REGION_SPECIFIC` at national
 * level: Scotland has its own earned-income schedule, and US federal tax says
 * nothing about state or municipal liability. FinatriX collects a country, not
 * a region, so neither can be applied automatically — which is exactly why both
 * are here as reference and neither is wired to anything.
 */

import type { ChangeImpact, GeographicScope, IsoDate, ReferenceMarket } from './types';

/** One marginal band. `upperExclusive: null` means the top band, not "unbounded validity". */
export interface TaxBand {
  readonly lowerInclusive: number;
  readonly upperExclusive: number | null;
  readonly marginalRate: number;
}

export interface TaxSchedule {
  readonly id: string;
  readonly market: ReferenceMarket;
  readonly scope: GeographicScope;
  /** Human-readable period label — "TY2026-27", "2026 (single filer)". */
  readonly period: string;
  readonly effectiveDate: IsoDate;
  readonly effectiveToExclusive: IsoDate;
  readonly currency: string;
  /** What the bands are applied TO. Never "salary". */
  readonly incomeBasis: string;
  readonly bands: readonly TaxBand[];
  readonly sourceIds: readonly string[];
  readonly lastVerified: string;
  readonly applicability: string;
  /** Named exclusions. Rendered alongside any figure derived from this schedule. */
  readonly excluded: string;
  /** Invariant: always false in this version. See the file header. */
  readonly automaticCalculationApproved: false;
}

export const TAX_SCHEDULES: readonly TaxSchedule[] = [
  {
    id: 'IN-TY2026-27-NATIONAL',
    market: 'IN',
    scope: 'NATIONAL',
    period: 'TY 2026–27 (new regime)',
    effectiveDate: '2026-04-01',
    effectiveToExclusive: '2027-04-01',
    currency: 'INR',
    incomeBasis: 'Taxable income after applicable deductions',
    bands: [
      { lowerInclusive: 0, upperExclusive: 400000, marginalRate: 0 },
      { lowerInclusive: 400000, upperExclusive: 800000, marginalRate: 0.05 },
      { lowerInclusive: 800000, upperExclusive: 1200000, marginalRate: 0.1 },
      { lowerInclusive: 1200000, upperExclusive: 1600000, marginalRate: 0.15 },
      { lowerInclusive: 1600000, upperExclusive: 2000000, marginalRate: 0.2 },
      { lowerInclusive: 2000000, upperExclusive: 2400000, marginalRate: 0.25 },
      { lowerInclusive: 2400000, upperExclusive: null, marginalRate: 0.3 },
    ],
    sourceIds: ['IND-ITD-003', 'IND-ITD-004'],
    lastVerified: '2026-09-12',
    applicability: 'The new-regime ordinary-income component only. AY 2026–27 covers income earned in FY 2025–26 and is a different period. The ₹12 lakh figure people quote is a rebate with eligibility conditions and marginal relief, not a zero-rate band.',
    excluded: 'Standard deduction, rebates, surcharge, cess, marginal relief, special-rate income and capital gains.',
    automaticCalculationApproved: false,
  },
  {
    id: 'AU-2026-27-NATIONAL',
    market: 'AU',
    scope: 'NATIONAL',
    period: '2026–27 (resident, full year)',
    effectiveDate: '2026-07-01',
    effectiveToExclusive: '2027-07-01',
    currency: 'AUD',
    incomeBasis: 'Taxable income after applicable deductions',
    bands: [
      { lowerInclusive: 0, upperExclusive: 18200, marginalRate: 0 },
      { lowerInclusive: 18200, upperExclusive: 45000, marginalRate: 0.15 },
      { lowerInclusive: 45000, upperExclusive: 135000, marginalRate: 0.3 },
      { lowerInclusive: 135000, upperExclusive: 190000, marginalRate: 0.37 },
      { lowerInclusive: 190000, upperExclusive: null, marginalRate: 0.45 },
    ],
    sourceIds: ['AUS-ATO-001', 'AUS-TREASURY-001'],
    lastVerified: '2026-09-12',
    applicability: 'Adult resident, full year. The lowest band drops again to 14% in 2027–28 under the same Act — a future-effective version that must not be applied early.',
    excluded: 'Medicare levy and surcharge, HELP repayments, offsets, and part-year or non-resident rules.',
    automaticCalculationApproved: false,
  },
  {
    id: 'US-2026-single-NATIONAL',
    market: 'US',
    scope: 'NATIONAL',
    period: '2026 (federal, single filer)',
    effectiveDate: '2026-01-01',
    effectiveToExclusive: '2027-01-01',
    currency: 'USD',
    incomeBasis: 'Federal taxable income after applicable deductions',
    bands: [
      { lowerInclusive: 0, upperExclusive: 12400, marginalRate: 0.1 },
      { lowerInclusive: 12400, upperExclusive: 50400, marginalRate: 0.12 },
      { lowerInclusive: 50400, upperExclusive: 105700, marginalRate: 0.22 },
      { lowerInclusive: 105700, upperExclusive: 201775, marginalRate: 0.24 },
      { lowerInclusive: 201775, upperExclusive: 256225, marginalRate: 0.32 },
      { lowerInclusive: 256225, upperExclusive: 640600, marginalRate: 0.35 },
      { lowerInclusive: 640600, upperExclusive: null, marginalRate: 0.37 },
    ],
    sourceIds: ['US-IRS-001', 'US-IRS-002'],
    lastVerified: '2026-09-12',
    applicability: 'Federal only, single filer. Federal income tax is not total US tax.',
    excluded: 'State and local income taxes, payroll taxes, credits, itemised deductions, and preferential rates on gains and qualified dividends.',
    automaticCalculationApproved: false,
  },
  {
    id: 'US-2026-married-joint-NATIONAL',
    market: 'US',
    scope: 'NATIONAL',
    period: '2026 (federal, married filing jointly)',
    effectiveDate: '2026-01-01',
    effectiveToExclusive: '2027-01-01',
    currency: 'USD',
    incomeBasis: 'Federal taxable income after applicable deductions',
    bands: [
      { lowerInclusive: 0, upperExclusive: 24800, marginalRate: 0.1 },
      { lowerInclusive: 24800, upperExclusive: 100800, marginalRate: 0.12 },
      { lowerInclusive: 100800, upperExclusive: 211400, marginalRate: 0.22 },
      { lowerInclusive: 211400, upperExclusive: 403550, marginalRate: 0.24 },
      { lowerInclusive: 403550, upperExclusive: 512450, marginalRate: 0.32 },
      { lowerInclusive: 512450, upperExclusive: 768700, marginalRate: 0.35 },
      { lowerInclusive: 768700, upperExclusive: null, marginalRate: 0.37 },
    ],
    sourceIds: ['US-IRS-001', 'US-IRS-002'],
    lastVerified: '2026-09-12',
    applicability: 'Federal, married filing jointly. Being married does not imply filing jointly.',
    excluded: 'State and local income taxes, payroll taxes, credits, itemised deductions, and preferential rates on gains and qualified dividends.',
    automaticCalculationApproved: false,
  },
  {
    id: 'GB-2026-27-England-Wales-NI',
    market: 'GB',
    scope: 'REGION_SPECIFIC',
    period: '2026–27 (England, Wales and Northern Ireland)',
    effectiveDate: '2026-04-06',
    effectiveToExclusive: '2027-04-06',
    currency: 'GBP',
    incomeBasis: 'Income above the Personal Allowance the taxpayer is actually entitled to',
    bands: [
      { lowerInclusive: 0, upperExclusive: 37700, marginalRate: 0.2 },
      { lowerInclusive: 37700, upperExclusive: 125140, marginalRate: 0.4 },
      { lowerInclusive: 125140, upperExclusive: null, marginalRate: 0.45 },
    ],
    sourceIds: ['UK-HMRC-001', 'UK-HMRC-002'],
    lastVerified: '2026-09-12',
    applicability: 'Does not apply to Scottish earned income, which has its own schedule. The Personal Allowance tapers above an adjusted-net-income threshold and cannot be deducted unconditionally.',
    excluded: 'National Insurance, the savings and dividend allowances and their own rates, and Capital Gains Tax.',
    automaticCalculationApproved: false,
  },
  {
    id: 'GB-2026-27-Scotland',
    market: 'GB',
    scope: 'REGION_SPECIFIC',
    period: '2026–27 (Scotland, earned income)',
    effectiveDate: '2026-04-06',
    effectiveToExclusive: '2027-04-06',
    currency: 'GBP',
    incomeBasis: 'Scottish earned income above the Personal Allowance',
    bands: [
      { lowerInclusive: 0, upperExclusive: 3967, marginalRate: 0.19 },
      { lowerInclusive: 3967, upperExclusive: 16956, marginalRate: 0.2 },
      { lowerInclusive: 16956, upperExclusive: 31092, marginalRate: 0.21 },
      { lowerInclusive: 31092, upperExclusive: 62430, marginalRate: 0.42 },
      { lowerInclusive: 62430, upperExclusive: 125140, marginalRate: 0.45 },
      { lowerInclusive: 125140, upperExclusive: null, marginalRate: 0.48 },
    ],
    sourceIds: ['UK-HMRC-001', 'UK-HMRC-003'],
    lastVerified: '2026-09-12',
    applicability: 'Scottish earned income only. Savings and dividend income follow the UK-wide treatment regardless of where the taxpayer lives.',
    excluded: 'National Insurance, savings and dividend rates, and Capital Gains Tax.',
    automaticCalculationApproved: false,
  },
  {
    id: 'SG-YA2026-NATIONAL',
    market: 'SG',
    scope: 'NATIONAL',
    period: 'YA 2026 (resident)',
    effectiveDate: null,
    effectiveToExclusive: null,
    currency: 'SGD',
    incomeBasis: 'Resident chargeable income',
    bands: [
      { lowerInclusive: 0, upperExclusive: 20000, marginalRate: 0 },
      { lowerInclusive: 20000, upperExclusive: 30000, marginalRate: 0.02 },
      { lowerInclusive: 30000, upperExclusive: 40000, marginalRate: 0.035 },
      { lowerInclusive: 40000, upperExclusive: 80000, marginalRate: 0.07 },
      { lowerInclusive: 80000, upperExclusive: 120000, marginalRate: 0.115 },
      { lowerInclusive: 120000, upperExclusive: 160000, marginalRate: 0.15 },
      { lowerInclusive: 160000, upperExclusive: 200000, marginalRate: 0.18 },
      { lowerInclusive: 200000, upperExclusive: 240000, marginalRate: 0.19 },
      { lowerInclusive: 240000, upperExclusive: 280000, marginalRate: 0.195 },
      { lowerInclusive: 280000, upperExclusive: 320000, marginalRate: 0.2 },
      { lowerInclusive: 320000, upperExclusive: 500000, marginalRate: 0.22 },
      { lowerInclusive: 500000, upperExclusive: 1000000, marginalRate: 0.23 },
      { lowerInclusive: 1000000, upperExclusive: null, marginalRate: 0.24 },
    ],
    sourceIds: ['SG-IRAS-001'],
    lastVerified: '2026-09-12',
    applicability: 'Resident rates, structure in force from YA 2024. A Year of Assessment follows the year the income was earned — YA 2026 assesses 2025 income. One-off rebates are announced per year and are not inherited.',
    excluded: 'Reliefs, one-off rebates, non-resident treatment and CPF contributions, which are not a tax.',
    automaticCalculationApproved: false,
  },
  {
    id: 'CN-resident-comprehensive-NATIONAL',
    market: 'CN',
    scope: 'NATIONAL',
    period: 'Resident annual comprehensive income (current)',
    effectiveDate: null,
    effectiveToExclusive: null,
    currency: 'CNY',
    incomeBasis: 'Annual comprehensive taxable income after the basic expense deduction and eligible deductions',
    bands: [
      { lowerInclusive: 0, upperExclusive: 36000, marginalRate: 0.03 },
      { lowerInclusive: 36000, upperExclusive: 144000, marginalRate: 0.1 },
      { lowerInclusive: 144000, upperExclusive: 300000, marginalRate: 0.2 },
      { lowerInclusive: 300000, upperExclusive: 420000, marginalRate: 0.25 },
      { lowerInclusive: 420000, upperExclusive: 660000, marginalRate: 0.3 },
      { lowerInclusive: 660000, upperExclusive: 960000, marginalRate: 0.35 },
      { lowerInclusive: 960000, upperExclusive: null, marginalRate: 0.45 },
    ],
    sourceIds: ['CN-STA-001', 'CN-STA-002'],
    lastVerified: '2026-09-12',
    applicability: 'Mainland China, residents, annual comprehensive income after the CNY 60,000 basic expense deduction. Monthly withholding, business income and investment income each work differently. Commencement of the current table was not independently date-validated.',
    excluded: 'Social insurance and housing provident fund, which vary by locality, and all non-comprehensive income categories.',
    automaticCalculationApproved: false,
  },
];

/**
 * What FinatriX may do with a given tax question in a given market.
 *
 * `EXPLAIN` is the ceiling for almost everything. `USER_INPUT` means the only
 * correct source is the person — their actual take-home pay, their actual
 * marginal rate. `BLOCKED` means the product should not even offer a field.
 */
export type TaxPolicy = 'USER_INPUT' | 'EXPLAIN' | 'BLOCKED';

export type TaxCategory =
  | 'NET_INCOME'
  | 'ORDINARY_INCOME_COMPONENT'
  | 'TOTAL_PERSONAL_TAX'
  | 'PAYROLL_AND_SOCIAL'
  | 'PENSION_RELIEF'
  | 'SAVINGS_INTEREST'
  | 'DIVIDENDS_AND_INVESTMENT'
  | 'CAPITAL_GAINS'
  | 'DEDUCTIONS_AND_ALLOWANCES';

/**
 * The policy table, collapsed from the pack's 63 market × category rows.
 *
 * It collapses cleanly because the pack's classification is identical in every
 * market for every category but two, and those two are recorded as exceptions
 * below. Writing it out seven times would have been 63 rows that all say the
 * same thing and one day disagree by accident.
 */
const BASE_POLICY: Readonly<Record<TaxCategory, TaxPolicy>> = {
  // The only figure a budget should ever be built on: what actually arrives.
  NET_INCOME: 'USER_INPUT',
  ORDINARY_INCOME_COMPONENT: 'EXPLAIN',
  TOTAL_PERSONAL_TAX: 'BLOCKED',
  PAYROLL_AND_SOCIAL: 'BLOCKED',
  PENSION_RELIEF: 'EXPLAIN',
  SAVINGS_INTEREST: 'EXPLAIN',
  DIVIDENDS_AND_INVESTMENT: 'BLOCKED',
  CAPITAL_GAINS: 'BLOCKED',
  DEDUCTIONS_AND_ALLOWANCES: 'EXPLAIN',
};

/**
 * Markets where payroll and social contributions are not merely complex but
 * *regionally determined*, so there is no national answer to fall back on:
 * US state and municipal rules, UAE citizen/expatriate and emirate cohorts,
 * Mainland Chinese provincial and municipal contribution bases.
 */
const REGIONAL_PAYROLL: readonly ReferenceMarket[] = ['US', 'AE', 'CN'];

export interface TaxPolicyResult {
  readonly policy: TaxPolicy;
  readonly why: string;
  /** True when the obstacle is missing geography rather than missing rules. */
  readonly regionSpecific: boolean;
}

export function taxPolicyFor(market: ReferenceMarket, category: TaxCategory): TaxPolicyResult {
  if (category === 'PAYROLL_AND_SOCIAL' && REGIONAL_PAYROLL.includes(market)) {
    return {
      policy: 'BLOCKED',
      why: 'Contribution rates and wage bases are set regionally, and FinatriX does not hold a region. There is no national figure to fall back on.',
      regionSpecific: true,
    };
  }
  const policy = BASE_POLICY[category];
  const why =
    policy === 'USER_INPUT'
      ? 'Only the amount that actually reaches your account is reliable here.'
      : policy === 'EXPLAIN'
        ? 'The published schedule can be shown with its period and exclusions named. It is one component of a tax position, not the position.'
        : 'Deductions, credits, special rates, residency and other charges can move this far enough that a computed figure would mislead.';
  return { policy, why, regionSpecific: false };
}

const SCHEDULES_BY_MARKET = TAX_SCHEDULES.reduce<Map<ReferenceMarket, TaxSchedule[]>>((acc, s) => {
  const list = acc.get(s.market) ?? [];
  list.push(s);
  acc.set(s.market, list);
  return acc;
}, new Map());

/** Every schedule recorded for a market, in declaration order. Empty for the UAE. */
export function taxSchedulesFor(market: ReferenceMarket): readonly TaxSchedule[] {
  return SCHEDULES_BY_MARKET.get(market) ?? [];
}

/**
 * The market's tax change-impact rating.
 *
 * Uniformly HIGH: a wrong band or a missed allowance misstates take-home income,
 * which is the input every other tool depends on.
 */
export const TAX_CHANGE_IMPACT: ChangeImpact = 'HIGH';
