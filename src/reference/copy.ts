/**
 * The words used to disclose a reference, and the words that are not used.
 *
 * WHY THE PHRASING IS CENTRALISED
 * -------------------------------
 * Disclosure copy written per screen drifts, and it drifts in one direction:
 * towards confidence. "Sources: RBI" becomes "Verified by the RBI" becomes
 * "RBI-verified rates" over three unrelated pull requests, and nobody set out
 * to overstate anything. Holding the phrases in one place means the claim a
 * label makes is a decision taken once, reviewable in one diff.
 *
 * THE BANNED LIST IS THE USEFUL HALF
 * ----------------------------------
 * `AVOIDED_CLAIMS` pairs each phrase a financial product should not use with
 * the thing to say instead. It is not decoration: `reference.test.ts` scans
 * every user-facing string this layer produces for the banned forms, so
 * "guaranteed" or "risk-free" cannot reach a screen through this module without
 * a test going red. The substitutions are longer and less satisfying than the
 * phrases they replace, which is the point — "risk-free" is shorter than
 * "protected against the bank failing, still exposed to inflation" because it
 * leaves things out.
 *
 * DISCLOSURE IS LAYERED, NOT STACKED
 * ----------------------------------
 * Five levels exist so that a screen can use the one it needs. Rendering all
 * five on every result produces a page a reader scrolls past, which is worse
 * than one accurate sentence they actually read. The rule is: the most specific
 * applicable level, next to the thing it qualifies.
 */

/** Short labels for the metadata that accompanies a reference value. */
export const SOURCE_LABELS = {
  source: (authority: string, title: string) => `Source: ${authority} — ${title}.`,
  lastReviewed: (date: string) => `Last reviewed ${date}.`,
  effectiveFrom: (date: string) => `Applies from ${date}.`,
  assumption: (value: string) => `Assumption: ${value}. Actual outcomes will differ.`,
  userSelected: (value: string) => `You chose ${value} for this scenario.`,
  referenceValue: (place: string, period: string) => `Reference value for ${place}, ${period}.`,
  projection: 'Projected from the inputs and assumptions shown.',
  estimated: (excluded: string) => `Estimated result. ${excluded} are not included.`,
  regionalRule: 'This rule depends on your region and circumstances.',
  dataUnavailable: 'A comparable verified value is not available.',
  beingReviewed: 'We are reviewing this reference. Estimates that depend on it are paused.',
  noDefault: 'There is no reliable default for everyone. Enter your own figure.',
} as const;

/** LifeMap's three-way labelling, in the words the user reads. */
export const TIER_LABELS = {
  KNOWN: 'Entered from your information',
  REFERENCE: 'A published figure, with its source and date',
  ASSUMED: 'A planning choice you can change',
  PROJECTED: 'Calculated from the inputs and assumptions shown',
} as const;

export type DisclaimerLevel =
  | 'FOOTER'
  | 'RESULT'
  | 'INVESTMENT'
  | 'PROJECTION'
  | 'TAX_COUNTRY';

export const DISCLAIMERS: Readonly<Record<DisclaimerLevel, string>> = {
  FOOTER: 'For financial education. This tool does not provide personal financial advice.',
  RESULT: 'This result uses the inputs and assumptions shown. Check them before relying on the estimate.',
  INVESTMENT:
    'Illustrative asset categories, not a recommendation. Investments can lose value, and diversification does not prevent every loss.',
  PROJECTION:
    'This is a scenario, not a forecast. Returns, costs, income and future rules may all differ from the assumptions shown.',
  TAX_COUNTRY:
    'A limited estimate for the market and period stated. Eligibility, other taxes and deductions may change your actual position.',
};

export interface AvoidedClaim {
  /** Lower-case, matched as a substring against user-facing copy. */
  readonly avoid: string;
  readonly instead: string;
  readonly why: string;
}

export const AVOIDED_CLAIMS: readonly AvoidedClaim[] = [
  {
    avoid: 'guaranteed',
    instead: 'Subject to the conditions of the scheme or instrument stated.',
    why: 'Deposit protection is conditional compensation, not a guarantee that a balance cannot be lost.',
  },
  {
    avoid: 'risk-free',
    instead: 'Name the protection, then name the risks that remain — inflation, liquidity, currency.',
    why: 'No cash holding is free of risk. Credit protection does not address purchasing power.',
  },
  {
    avoid: 'you will have',
    instead: 'Under these assumptions, the projected amount is …',
    why: 'A deterministic projection states a consequence of assumptions, never an outcome.',
  },
  {
    avoid: 'the best ',
    instead: 'These options differ in access, risk and tax treatment.',
    why: 'Best for whom, on what criterion? A ranking on one dimension is not a verdict.',
  },
  {
    avoid: 'you should invest',
    instead: 'This example illustrates …',
    why: 'A recommendation to a specific person is advice, which this product does not give.',
  },
  {
    avoid: 'your ideal portfolio',
    instead: 'One illustrative mix of asset categories is …',
    why: 'Nothing here is optimised for anyone, and no questionnaire could be.',
  },
  {
    avoid: 'expected return of',
    instead: 'The return assumption entered is …',
    why: 'It is an assumption the user can change, not an expectation the product holds.',
  },
  {
    avoid: 'tax-free in this country',
    instead: 'This income category may be exempt under the conditions stated.',
    why: 'Exemptions are category- and status-specific, and residency elsewhere can override them.',
  },
  {
    avoid: 'current peers',
    instead: 'The reference group surveyed in [period].',
    why: 'Survey data describes the period it was collected in, which is never now.',
  },
  {
    avoid: 'you are failing',
    instead: 'The amount entered differs from this dated reference.',
    why: 'A comparison with a survey group is not a judgement about a person.',
  },
];

/**
 * Find banned phrasing in a piece of copy.
 *
 * Deliberately a plain case-insensitive substring scan. A cleverer matcher
 * would produce false negatives, and the whole value of the check is that it
 * cannot be talked out of a match.
 */
export function findAvoidedClaims(text: string): readonly AvoidedClaim[] {
  const haystack = text.toLowerCase();
  return AVOIDED_CLAIMS.filter((c) => haystack.includes(c.avoid));
}
