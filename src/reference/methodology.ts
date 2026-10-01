/**
 * The methodology registry: which document explains each tool, at which
 * version, and which disclosure a given kind of result needs.
 *
 * WHAT THIS ADDS TO `TOOL_GUIDES`
 * -------------------------------
 * `shared/toolGuides.ts` already describes, per tool, what the method is and
 * what it does not do. That copy is written against the code and stays the
 * single place either is stated — this file does not duplicate a word of it.
 *
 * What was missing is the part a reader needs in order to *audit* an answer
 * rather than read about it: a stable identifier for the methodology so a saved
 * result can name the document that produced it, a version so a changed method
 * is visible as a change, and the reference-driven limitations — the ones that
 * come from what the data will and will not support in this market, rather than
 * from how the arithmetic works.
 *
 * VERSIONING, AND WHY MAJOR IS EXPENSIVE
 * --------------------------------------
 * MAJOR means the meaning of a result changed: a different formula, a different
 * convention, a different definition of an input. Every saved result computed
 * under the old major is no longer comparable with a new one, and the product
 * owes the user a visible account of that rather than a silent recalculation.
 * MINOR adds explanatory capability without changing any number. PATCH fixes
 * copy or metadata.
 *
 * Everything here is `1.0.0` because nothing in this change altered a formula.
 * That is the claim `parity` suites in `src/test/parity` independently check,
 * and the two must agree: a bumped MAJOR with green parity tests means somebody
 * mislabelled a change, and a changed formula under an unbumped version means
 * saved results are quietly incomparable.
 */

import { canRankPercentile } from './peerDatasets';
import { canProjectStatutoryBenefit } from './retirement';
import { taxPolicyFor } from './taxReference';
import type { MethodologyId, ReferenceMarket } from './types';

export interface MethodologyRecord {
  readonly id: MethodologyId;
  readonly title: string;
  /** Semver. MAJOR changes mean saved results are not comparable across it. */
  readonly version: string;
  readonly reviewed: string;
  /**
   * What this method is, in one line — the sentence a reader sees above the
   * detail when they ask how something was calculated.
   */
  readonly summary: string;
}

export const METHODOLOGIES: Readonly<Record<MethodologyId, MethodologyRecord>> = {
  'M-BUDGET': {
    id: 'M-BUDGET', title: 'Budget Builder', version: '1.0.0', reviewed: '2026-09-12',
    summary: 'Category amounts are added and compared with the income you entered. Percentage allocations multiply that income by the share you chose.',
  },
  'M-EXPENSE': {
    id: 'M-EXPENSE', title: 'Expense Tracker', version: '1.0.0', reviewed: '2026-09-12',
    summary: 'Eligible signed transactions are totalled by category and period. Averages cover only the periods actually included.',
  },
  'M-INVESTMATCH': {
    id: 'M-INVESTMATCH', title: 'InvestMatch', version: '1.0.0', reviewed: '2026-09-12',
    summary: 'Your answers about horizon, liquidity and tolerance for loss select one of a small set of illustrative asset-category mixes. It is an explanation of a trade-off, not a portfolio.',
  },
  'M-PARKSMART': {
    id: 'M-PARKSMART', title: 'ParkSmart', version: '1.0.0', reviewed: '2026-09-12',
    summary: 'Each cash option is described by access, principal risk, market risk and tax treatment, then ranked on its post-tax return at the marginal rate you entered.',
  },
  'M-PEER': {
    id: 'M-PEER', title: 'PeerCompare', version: '1.0.0', reviewed: '2026-09-12',
    summary: 'Your figure is compared with a labelled benchmark for a stated population and period. It is a comparison against a reference group, not a percentile of the country.',
  },
  'M-MATH': {
    id: 'M-MATH', title: 'Compounding and reverse-goal mathematics', version: '1.0.0', reviewed: '2026-09-12',
    summary: 'Future value combines an opening balance with recurring contributions at the rate and timing stated. Reversing it gives the contribution that reaches a target.',
  },
  'M-LIFEMAP': {
    id: 'M-LIFEMAP', title: 'LifeMap', version: '1.0.0', reviewed: '2026-09-12',
    summary: 'Balances and cash flows are rolled forward year by year using the assumptions shown. What you entered, what was assumed and what was computed are labelled separately.',
  },
  'M-NETWORTH': {
    id: 'M-NETWORTH', title: 'Net Worth', version: '1.0.0', reviewed: '2026-09-12',
    summary: 'Assets minus liabilities at one valuation date, with liquid and restricted holdings kept visibly apart.',
  },
  'M-TAX': {
    id: 'M-TAX', title: 'Tax reference', version: '1.0.0', reviewed: '2026-09-12',
    summary: 'Published rate schedules are shown with their period and their exclusions named. FinatriX does not compute a tax liability.',
  },
  'M-RETIREMENT': {
    id: 'M-RETIREMENT', title: 'Retirement reference', version: '1.0.0', reviewed: '2026-09-12',
    summary: 'Balances and contributions you enter are projected. Statutory entitlements are not modelled; the official personal forecast is.',
  },
  'M-REFERENCE': {
    id: 'M-REFERENCE', title: 'Reference data', version: '1.0.0', reviewed: '2026-09-12',
    summary: 'Published values carry their source, the date they took effect and the date they were last checked.',
  },
  'M-GOVERNANCE': {
    id: 'M-GOVERNANCE', title: 'Assumptions and governance', version: '1.0.0', reviewed: '2026-09-12',
    summary: 'Formulas, market rules, published statistics and planning assumptions are held separately, and every result says which of them it used.',
  },
};

/** Which methodology explains which tool. One-to-one, deliberately. */
export const TOOL_METHODOLOGY: Readonly<Record<string, MethodologyId>> = {
  budget: 'M-BUDGET',
  expenses: 'M-EXPENSE',
  investmatch: 'M-INVESTMATCH',
  parksmart: 'M-PARKSMART',
  peercompare: 'M-PEER',
  goals: 'M-MATH',
  lifemap: 'M-LIFEMAP',
  networth: 'M-NETWORTH',
};

export function methodologyForTool(toolId: string): MethodologyRecord | undefined {
  const id = TOOL_METHODOLOGY[toolId];
  return id ? METHODOLOGIES[id] : undefined;
}

/**
 * The limitations that come from the reference data rather than the arithmetic.
 *
 * Kept apart from `TOOL_GUIDES.limits` — which says what the *method* does not
 * do — because these say what the *evidence* does not support in this
 * particular market, and they change when the data changes rather than when the
 * code does. A reader deserves both, and conflating them would mean a market
 * with better data still reading a warning that no longer applies to it.
 *
 * Returns an empty array where there is genuinely nothing to add. A tool that
 * needs no market data earns a shorter disclosure, not a padded one.
 */
export function referenceLimitsFor(toolId: string, market: ReferenceMarket): readonly string[] {
  const limits: string[] = [];

  if (toolId === 'parksmart') {
    const payroll = taxPolicyFor(market, 'PAYROLL_AND_SOCIAL');
    limits.push(
      'The marginal rate is the one you entered. FinatriX does not work out your tax position, and the ranking excludes credits, surcharges and any special rates that apply to particular kinds of income.',
    );
    if (payroll.regionSpecific) {
      limits.push('Social and payroll contributions in this market are set regionally, so none of them is reflected here.');
    }
    limits.push(
      'Deposit protection is a compensation limit with conditions attached — the institution, the account type and how it is owned all matter. It is shown so a balance can be checked against it, not presented as cover that is certain to apply.',
    );
  }

  if (toolId === 'peercompare' && !canRankPercentile(market)) {
    limits.push(
      'This compares you with a labelled benchmark for a stated group and period. It is not a national percentile, and no published survey in this layer has been cleared to produce one.',
    );
  }

  if (toolId === 'lifemap') {
    if (!canProjectStatutoryBenefit(market)) {
      limits.push(
        'State and employer pension entitlements are not modelled. Enter the figure from your own official forecast, with the date and price basis it was quoted in.',
      );
    }
    limits.push(
      'Every growth and inflation figure in the scenario is an assumption, shown so you can change it. None of them is a forecast, and a deterministic projection says nothing about how likely an outcome is.',
    );
  }

  if (toolId === 'goals') {
    limits.push(
      'The inflation rate used is a long-run planning assumption chosen by FinatriX, not the latest published figure. One month’s reading is far too volatile to plan a decade against.',
    );
  }

  if (toolId === 'investmatch') {
    limits.push(
      'The mixes shown are illustrative asset categories, not investable portfolios and not a recommendation. Funds, home-market bias, currency hedging and duration are all deliberately unspecified.',
    );
  }

  return limits;
}
