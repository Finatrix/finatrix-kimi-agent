/**
 * Rules of thumb, classified by what kind of thing they actually are.
 *
 * WHY CLASSIFY THEM AT ALL
 * ------------------------
 * "50/30/20", "three to six months of expenses", "the 4% rule" and "100 minus
 * your age" all arrive in a reader's head wearing the same clothes: a confident
 * number, repeated often enough to feel like a law. They are not the same kind
 * of claim, and the difference decides how a product is allowed to use them.
 *
 * A FORMAL_RULE is enforceable law — a statutory deposit cap. GOVERNMENT_GUIDANCE
 * is a regulator's published educational position; real provenance, no legal
 * force, and usually written for one country. REGULATORY_GUIDANCE defines a
 * *measure* without endorsing a threshold: the CFPB explains what a
 * debt-to-income ratio is and pointedly does not bless 36% or 43%. An
 * EDUCATIONAL_HEURISTIC has a traceable origin and no authority behind it.
 * INDUSTRY_CONVENTION is a single influential piece of analysis that hardened
 * into folklore. UNSUPPORTED is a number with no defensible basis at all.
 *
 * The last category is the one worth having. "100 minus your age in equities"
 * is repeated everywhere and has no support: age alone ignores capacity to bear
 * loss, horizon, pension wealth and liquidity, and implementing it would be
 * dressing a guess as advice. Recording it as unsupported is how a product
 * remembers *not* to build something.
 *
 * FinatriX uses exactly two of these today, both as optional starting points a
 * user can overwrite: the 50/30/20 split in Budget Builder and a months-of-
 * expenses reserve. Everything else is here so the answer to "why doesn't
 * FinatriX have a financial health score out of 100?" is written down.
 */

import type { ReferenceMarket } from './types';

export type HeuristicClass =
  | 'FORMAL_RULE'
  | 'GOVERNMENT_GUIDANCE'
  | 'REGULATORY_GUIDANCE'
  | 'EDUCATIONAL_HEURISTIC'
  | 'INDUSTRY_CONVENTION'
  | 'UNSUPPORTED';

export interface Heuristic {
  readonly id: string;
  readonly name: string;
  readonly classification: HeuristicClass;
  readonly origin: string;
  /** The number, where one is defensible. `null` where none is. */
  readonly referenceValue: number | readonly number[] | null;
  readonly limitations: string;
  readonly sourceIds: readonly string[];
  /** Whether FinatriX currently offers it, and how. */
  readonly usedInProduct: 'OPTIONAL_STARTING_POINT' | 'CONTEXT_ONLY' | 'NOT_USED';
  /** Where the guidance was published, when that materially limits it. */
  readonly originMarket: ReferenceMarket | null;
}

export const HEURISTICS: readonly Heuristic[] = [
  {
    id: 'H-50-30-20',
    name: '50 / 30 / 20',
    classification: 'EDUCATIONAL_HEURISTIC',
    origin: 'Warren and Tyagi, All Your Worth; adapted by the CFPB as teaching material.',
    referenceValue: [0.5, 0.3, 0.2],
    limitations:
      'A framework for net income, not gross. Which spending counts as a need is a judgement that differs by household, and local housing costs, care responsibilities, income volatility and compulsory retirement contributions can make it arithmetically impossible.',
    sourceIds: ['US-CFPB-001', 'GLOBAL-BOOK-001'],
    usedInProduct: 'OPTIONAL_STARTING_POINT',
    originMarket: 'US',
  },
  {
    id: 'H-EMERGENCY-RESERVE',
    name: 'Months of expenses held accessible',
    classification: 'GOVERNMENT_GUIDANCE',
    origin: 'ASIC Moneysmart guidance on an accessible reserve.',
    referenceValue: 3,
    limitations:
      'Published guidance for one country, not a global minimum. The familiar three-to-six-month range is a convention rather than a verified rule anywhere; job security, dependants, insurance cover and the presence or absence of a state safety net all move it.',
    sourceIds: ['AUS-ASIC-002'],
    usedInProduct: 'OPTIONAL_STARTING_POINT',
    originMarket: 'AU',
  },
  {
    id: 'H-SAVINGS-RATE',
    name: 'A responsible savings percentage',
    classification: 'EDUCATIONAL_HEURISTIC',
    origin: 'Budgeting convention, with no single authority behind it.',
    referenceValue: null,
    limitations: 'There is no universal responsible savings rate. Goals, obligations and income stability decide it.',
    sourceIds: ['US-CFPB-001'],
    usedInProduct: 'NOT_USED',
    originMarket: null,
  },
  {
    id: 'H-DTI',
    name: 'Debt-to-income ratio',
    classification: 'REGULATORY_GUIDANCE',
    origin: 'The CFPB defines the ratio. It does not endorse an approval threshold.',
    referenceValue: null,
    limitations:
      'Monthly debt payments divided by gross monthly income. Lenders and products apply their own limits; neither 36% nor 43% is adopted here as a pass mark.',
    sourceIds: ['US-CFPB-002'],
    usedInProduct: 'CONTEXT_ONLY',
    originMarket: 'US',
  },
  {
    id: 'H-WITHDRAWAL-RULE',
    name: 'The safe withdrawal rate',
    classification: 'INDUSTRY_CONVENTION',
    origin: 'Bengen’s 1994 analysis of historical US market returns.',
    referenceValue: null,
    limitations:
      'A historical study of one country’s markets over one period. It is not a guarantee, not a universal safe rate, and not transferable as a default. Any use needs a user-chosen scenario and an explicit sequence-of-returns warning.',
    sourceIds: ['GLOBAL-FPA-001'],
    usedInProduct: 'NOT_USED',
    originMarket: 'US',
  },
  {
    id: 'H-HOUSING-SHARE',
    name: 'A maximum share of income on housing',
    classification: 'UNSUPPORTED',
    origin: 'No single threshold is approved by any authority consulted.',
    referenceValue: null,
    limitations:
      'Rent and mortgage burden are defined differently everywhere, and the number people quote varies by city and by decade. Use the user’s own budget; do not score them pass or fail against a figure with no basis.',
    sourceIds: [],
    usedInProduct: 'NOT_USED',
    originMarket: null,
  },
  {
    id: 'H-AGE-EQUITY',
    name: '100 minus your age in equities',
    classification: 'UNSUPPORTED',
    origin: 'Folklore. No regulator or study consulted supports an age-only allocation.',
    referenceValue: null,
    limitations:
      'Age is one input among several and the weakest of them. It says nothing about capacity to bear a loss, the horizon of the specific goal, pension wealth already accumulated, or how much liquidity the person needs. Implementing it would be presenting a guess as personal advice.',
    sourceIds: ['US-SEC-001'],
    usedInProduct: 'NOT_USED',
    originMarket: null,
  },
  {
    id: 'H-DEPOSIT-CAP',
    name: 'The statutory deposit protection cap',
    classification: 'FORMAL_RULE',
    origin: 'The applicable statutory protection scheme in each market.',
    referenceValue: null,
    limitations:
      'Law, but only within its own conditions of institution, account type and ownership — and it is a limit on compensation, never a savings target.',
    sourceIds: ['IND-DICGC-001', 'AUS-APRA-001', 'US-FDIC-001', 'UK-FSCS-001', 'SG-SDIC-001', 'CN-MOJ-001'],
    usedInProduct: 'CONTEXT_ONLY',
    originMarket: null,
  },
];

const BY_ID: ReadonlyMap<string, Heuristic> = new Map(HEURISTICS.map((h) => [h.id, h]));

export function heuristicById(id: string): Heuristic | undefined {
  return BY_ID.get(id);
}

/**
 * Heuristics the product must not implement as advice.
 *
 * Exported so the guard reads as an allowlist violation rather than a comment
 * somebody has to remember. `reference.test.ts` asserts none of them is wired
 * into a tool.
 */
export const UNSUPPORTED_HEURISTICS: readonly Heuristic[] = HEURISTICS.filter(
  (h) => h.classification === 'UNSUPPORTED',
);
