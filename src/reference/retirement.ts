/**
 * Retirement systems — what may be modelled, and what must be asked.
 *
 * THE RULE
 * --------
 * FinatriX models money the user tells it about. It does not model entitlement.
 *
 * That line is not timidity. Every system below turns on facts the product does
 * not and should not hold: an earnings history going back decades, a residence
 * test, a means test, a membership cohort defined by the year someone joined a
 * scheme, a citizenship or visa status, an employer's particular plan rules. A
 * projection that guesses at any of them produces a retirement income figure
 * with a plausible number of digits and no relationship to what the person will
 * actually receive — and people make irreversible decisions on those figures.
 *
 * So: account balances, contributions and dated cash flows the user enters are
 * ordinary arithmetic and LifeMap already handles them. State pensions,
 * superannuation guarantee entitlements, CPF routing and gratuity formulas are
 * not modelled at all, and the product asks for the official personal forecast
 * instead. `modelling` on each record is the machine-readable version of that
 * decision; `mustAsk` is what the UI should be asking for.
 *
 * FOUR DISTINCT DATES
 * -------------------
 * Almost every retirement mistake in software is a conflation of these:
 *   • the date someone WANTS to stop working
 *   • the date their savings become ACCESSIBLE (preservation age, CPF rules)
 *   • the date a statutory benefit becomes PAYABLE (state pension age)
 *   • the date they actually CLAIM it
 * They are four different numbers and a scenario needs all four separately.
 */

import type { ReferenceMarket } from './types';

export interface RetirementSystem {
  readonly market: ReferenceMarket;
  /** The schemes a reader there would name, so the copy uses their words. */
  readonly schemes: readonly string[];
  /** What the product may compute without asking anything further. */
  readonly modelling: string;
  /** What the user has to supply before a retirement scenario means anything. */
  readonly mustAsk: readonly string[];
  /** Named things that are deliberately out of scope, and why. */
  readonly notModelled: string;
  readonly sourceIds: readonly string[];
  /**
   * True where the rules additionally depend on geography or legal cohort the
   * product cannot infer — not merely on complexity.
   */
  readonly regionOrCohortDependent: boolean;
}

export const RETIREMENT_SYSTEMS: readonly RetirementSystem[] = [
  {
    market: 'IN',
    schemes: ['EPF', 'EPS', 'NPS'],
    modelling: 'Balances and contributions you enter, rolled forward with the return you choose.',
    mustAsk: ['Current EPF/NPS balance from your latest statement', 'Your own contribution, as it appears on your payslip', 'The date you expect to be able to access it'],
    notModelled:
      'EPS is a pension entitlement with membership and service conditions, not a balance — it cannot be added to an EPF pot. Wage ceilings, higher-wage arrangements and international-worker exceptions change the contribution base, and the NPS exit framework differs between the All Citizen model and government cohorts.',
    sourceIds: ['IND-EPFO-001', 'IND-EPFO-002', 'IND-PFRDA-001', 'IND-PFRDA-002'],
    regionOrCohortDependent: false,
  },
  {
    market: 'AU',
    schemes: ['Superannuation', 'Age Pension'],
    modelling: 'Super balances and contributions you enter, held separately from liquid savings because they are not reachable cash.',
    mustAsk: ['Super balance from your latest statement', 'Whether your stated salary includes or excludes super', 'Your preservation age and intended access date'],
    notModelled:
      'The Age Pension is means- and residence-tested; age alone establishes nothing. Concessional and non-concessional caps have eligibility conditions, and the current-period cap figures were an open evidence gap in the research. Preservation age, conditions of release, retirement phase and Age Pension age are four separate concepts.',
    sourceIds: ['AUS-ATO-002', 'AUS-ATO-003', 'AUS-CSC-001', 'AUS-ASIC-001', 'AUS-SA-001'],
    regionOrCohortDependent: false,
  },
  {
    market: 'US',
    schemes: ['401(k)', 'IRA', 'Social Security'],
    modelling: 'Account balances and contributions you enter. 401(k) and IRA are tax wrappers, so what they hold still needs its own return assumption.',
    mustAsk: ['Balances from your latest statements', 'Your Social Security estimate from ssa.gov, and the price basis it is quoted in', 'The age you intend to claim'],
    notModelled:
      'Social Security depends on an earnings history, a birth-cohort full retirement age and a claiming decision. Contribution limits exclude catch-ups, employer amounts and plan-specific restrictions, and Traditional versus Roth treatment cannot be inferred from a country.',
    sourceIds: ['US-IRS-003', 'US-SSA-001', 'US-SSA-002'],
    regionOrCohortDependent: false,
  },
  {
    market: 'GB',
    schemes: ['Workplace pension', 'State Pension'],
    modelling: 'Pension pot values and contributions you enter, with employer and employee amounts kept apart.',
    mustAsk: ['Pot value from your latest statement', 'Employer and employee contribution rates, and what earnings they apply to', 'Your State Pension forecast from gov.uk'],
    notModelled:
      'State Pension age moves by date of birth and is not a retirement age. Automatic-enrolment minimums apply to qualifying earnings for eligible workers, and an employer scheme may define contributions quite differently. Defined-benefit promises are future income, not an account balance.',
    sourceIds: ['UK-DWP-001', 'UK-DWP-002'],
    regionOrCohortDependent: false,
  },
  {
    market: 'AE',
    schemes: ['End-of-service gratuity', 'GPSSA (citizens)', 'Alternative savings schemes'],
    modelling: 'Savings and any gratuity figure you enter yourself.',
    mustAsk: ['Your nationality and employment sector', 'Your basic wage, which is not your total package', 'Any gratuity or scheme statement you hold'],
    notModelled:
      'Citizens under a pension authority, GCC nationals under extension arrangements and expatriates are three different positions, and GPSSA’s 1999 and 2023 cohorts cannot share one contribution rate. Gratuity runs on basic wage and eligible service, and DIFC, ADGM and government arrangements do not follow the federal private-sector formula.',
    sourceIds: ['UAE-GOV-001', 'UAE-GPSSA-001'],
    regionOrCohortDependent: true,
  },
  {
    market: 'SG',
    schemes: ['CPF (OA, MediSave, RA, CPF LIFE)'],
    modelling: 'CPF balances you enter, held as restricted rather than liquid savings.',
    mustAsk: ['Balances per account from your CPF statement', 'Your citizenship or PR status and how long you have held it', 'Your age band'],
    notModelled:
      'Contribution and allocation rates turn on age, citizenship or PR year, wage level and wage type, and allocation ratios are not the same thing as contribution rates. The Special Account closes at 55 under the current structure. Announced 2027 changes are a separate future version. There is no single CPF percentage that is right for everyone.',
    sourceIds: ['SG-CPF-001', 'SG-CPF-002', 'SG-CPF-003', 'SG-CPF-004', 'SG-CPF-005', 'SG-CPF-006'],
    regionOrCohortDependent: true,
  },
  {
    market: 'CN',
    schemes: ['Basic pension insurance', 'Individual pension', 'Housing provident fund'],
    modelling: 'Balances and contributions you enter.',
    mustAsk: ['Your province and city', 'Your employment category', 'Contribution base and rate from your payslip'],
    notModelled:
      'Contribution bases and rates are set locally and vary widely; no nationwide employee or employer rate exists to fall back on. The phased retirement-age reform that began in 2025 depends on date of birth, sex and employment category, and the eventual ages do not apply to everyone yet.',
    sourceIds: ['CN-NPC-001', 'CN-MOHRSS-001', 'CN-MOHRSS-002', 'CN-MOHRSS-003'],
    regionOrCohortDependent: true,
  },
];

const BY_MARKET: ReadonlyMap<ReferenceMarket, RetirementSystem> = new Map(
  RETIREMENT_SYSTEMS.map((r) => [r.market, r]),
);

export function retirementFor(market: ReferenceMarket): RetirementSystem | undefined {
  return BY_MARKET.get(market);
}

/**
 * Whether FinatriX may compute a statutory retirement benefit for a market.
 *
 * Always false, in every market, in this version. It is a function rather than a
 * constant so the call site reads as a policy question with an answer, and so
 * that enabling one market later is a change to this function and its test
 * rather than a search for every place the assumption was inlined.
 */
export function canProjectStatutoryBenefit(_market: ReferenceMarket): false {
  void _market;
  return false;
}
