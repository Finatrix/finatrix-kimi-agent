/**
 * The vocabulary of FinatriX's reference-data layer.
 *
 * WHY THIS LAYER EXISTS
 * ---------------------
 * A personal-finance result is built from four different kinds of thing, and
 * until now the product stored them all the same way — as constants sitting
 * next to the arithmetic that consumed them:
 *
 *   FORMULA        assets − liabilities; FV = P(1+i)^n + C·[((1+i)^n−1)/i]
 *                  Stable mathematics. Does not have a date, a country or a
 *                  source. Changing one changes every historical result.
 *
 *   MARKET CONFIG  the FSCS limit, a tax band, a contribution cap.
 *                  Dated legal facts owned by an authority. They change on
 *                  somebody else's schedule, without warning, and a stale one
 *                  is not a stale opinion — it is a false statement of law.
 *
 *   STATISTICAL    CPI for July, median household wealth in 2020–22.
 *   REFERENCE      Observations of a population at a moment. They never become
 *                  current again; a new review date does not refresh a 2018
 *                  balance sheet.
 *
 *   USER ASSUMPTION  expected return, long-run inflation, retirement age.
 *                  A planning choice. It has no publisher and cannot be
 *                  "out of date" — only unreviewed by the person who chose it.
 *
 * Collapsing these into one bag is what lets a product quietly tell someone
 * their deposits are protected to a figure that stopped being true last
 * December, or feed one month's CPI print into a thirty-year projection as
 * though it were a forecast. Keeping them apart is the whole point of this
 * module: every record below carries the metadata its *kind* requires, and the
 * resolver refuses to hand a caller a value whose kind does not support the use
 * it is being put to.
 *
 * WHY THESE EXACT ENUM NAMES
 * --------------------------
 * They are the research pack's, verbatim. The pack ships 272 assumption records
 * already carrying `data_quality_state`, `geographic_scope` and `change_impact`
 * strings; inventing a parallel FinatriX taxonomy would mean a translation table
 * that has to be maintained forever and a class of bug — a mistranslated status
 * — that simply cannot exist if the strings match. Where the brief named a
 * status the pack does not define (`RESEARCH_REQUIRED`), it is expressed as
 * `NO_AUTHORITATIVE_DEFAULT` plus a stated reason rather than as a ninth state,
 * because the two would behave identically and a distinction that changes no
 * behaviour is a distinction users pay for in confusion.
 *
 * Pure types and data. No React, no storage, no I/O.
 */

/**
 * Markets the *research* covers.
 *
 * Deliberately wider than `MarketId` in `tools/lib/markets`, which lists the
 * markets the *product* has complete instrument sets, tax shapes and peer
 * benchmarks for. Having researched Singapore's deposit-insurance limit is not
 * the same as being able to rank Singaporean cash options, and conflating the
 * two is how a product ends up with seven flags and four countries' worth of
 * data behind them.
 *
 * So: reference data may exist for a market the tools do not offer. The reverse
 * must never be true — `reference.test.ts` asserts every `MarketId` appears
 * here.
 */
export type ReferenceMarket = 'IN' | 'AU' | 'US' | 'GB' | 'AE' | 'SG' | 'CN';

export const REFERENCE_MARKETS: readonly ReferenceMarket[] = ['IN', 'AU', 'US', 'GB', 'AE', 'SG', 'CN'];

export function isReferenceMarket(v: unknown): v is ReferenceMarket {
  return typeof v === 'string' && (REFERENCE_MARKETS as readonly string[]).includes(v);
}

/** Country names as a reader in that market would write them. */
export const MARKET_NAMES: Readonly<Record<ReferenceMarket, string>> = {
  IN: 'India',
  AU: 'Australia',
  US: 'United States',
  GB: 'United Kingdom',
  AE: 'United Arab Emirates',
  SG: 'Singapore',
  // Not "China". The deposit-insurance regulation, the tax law and the pension
  // reform recorded here are Mainland instruments and none of them reach Hong
  // Kong, Macau or Taiwan. A label that implied otherwise would be the single
  // most consequential inaccuracy in this file.
  CN: 'Mainland China',
};

/**
 * Flags, for the seven markets this layer covers.
 *
 * Here rather than read off the market packs because three of these markets
 * have no pack — that is the whole reason this layer is wider than the picker.
 * Purely decorative: every flag is `aria-hidden` at the point of use, since a
 * screen reader announcing "flag of Singapore" before the country's name is
 * noise, and the name is always rendered beside it.
 */
export const MARKET_FLAGS: Readonly<Record<ReferenceMarket, string>> = {
  IN: '🇮🇳', AU: '🇦🇺', US: '🇺🇸', GB: '🇬🇧', AE: '🇦🇪', SG: '🇸🇬', CN: '🇨🇳',
};

/**
 * How much confidence a stored reference value carries, and therefore what the
 * product is allowed to do with it.
 *
 * Freshness, applicability and activation are three different questions.
 * `VERIFIED_CURRENT` answers only the first: it says the claim was checked
 * against its source for the stated period. It does not say the rule applies to
 * this user, and it does not authorise an automatic calculation.
 */
export type DataQualityState =
  /** Checked against its source for a stated period and population. */
  | 'VERIFIED_CURRENT'
  /** A stable mathematical or definitional reference. Does not go stale. */
  | 'VERIFIED_STATIC'
  /** The scheduled review date has passed. No evidence of change — yet. */
  | 'REVIEW_DUE'
  /** Newer information exists, or there is credible reason to doubt currency. */
  | 'STALE'
  /** The user typed it. Valid to check, never to "verify" against an authority. */
  | 'USER_SUPPLIED'
  /** An example or scenario. Not an expectation, forecast or official rule. */
  | 'ILLUSTRATIVE'
  /**
   * There is no defensible default. Covers both "no such universal value
   * exists" and "research has not established one yet" — `reason` on the record
   * says which. Never coerce to zero.
   */
  | 'NO_AUTHORITATIVE_DEFAULT'
  /** Needs geography FinatriX does not hold. No national fallback permitted. */
  | 'REGION_SPECIFIC';

export const DATA_QUALITY_STATES: readonly DataQualityState[] = [
  'VERIFIED_CURRENT', 'VERIFIED_STATIC', 'REVIEW_DUE', 'STALE',
  'USER_SUPPLIED', 'ILLUSTRATIVE', 'NO_AUTHORITATIVE_DEFAULT', 'REGION_SPECIFIC',
];

/**
 * How specific a rule's geography is.
 *
 * The three that matter most in practice are the ones the product cannot
 * satisfy: US state income tax, UAE emirate/sector pension cohorts and Mainland
 * Chinese provincial social-insurance bases. FinatriX asks for a country. It
 * does not ask which state, emirate or city someone lives in, and inventing a
 * national average for a rule that has none is worse than showing nothing.
 */
export type GeographicScope =
  | 'NATIONAL'
  | 'STATE_SPECIFIC'
  | 'PROVINCE_SPECIFIC'
  | 'CITY_SPECIFIC'
  | 'EMIRATE_SPECIFIC'
  | 'REGION_SPECIFIC'
  | 'USER_SPECIFIC';

export const GEOGRAPHIC_SCOPES: readonly GeographicScope[] = [
  'NATIONAL', 'STATE_SPECIFIC', 'PROVINCE_SPECIFIC', 'CITY_SPECIFIC',
  'EMIRATE_SPECIFIC', 'REGION_SPECIFIC', 'USER_SPECIFIC',
];

/** Scopes FinatriX can satisfy from the information it actually collects. */
export const RESOLVABLE_SCOPES: readonly GeographicScope[] = ['NATIONAL'];

/**
 * What it costs to be wrong about this value.
 *
 * Drives the failure behaviour, not the display. A stale CPI print makes a
 * sentence slightly out of date; a stale deposit cap makes a false promise
 * about someone's savings being safe.
 */
export type ChangeImpact = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * What the product does when a reference cannot be used as intended.
 *
 * Chosen per use, not per value — the same deposit cap is `USE_WITH_WARNING`
 * when it is illustrating what protection means and `REQUEST_USER_INPUT` when
 * somebody is about to be told a specific balance is covered.
 *
 * The ordering is deliberate: each step surrenders more functionality, and the
 * resolver never escalates further than the caller's stated risk requires. A
 * missing contextual source must not be allowed to stop Budget Builder adding
 * up.
 */
export type FailureBehaviour =
  /** Show it, say why it is uncertain. The default for contextual data. */
  | 'USE_WITH_WARNING'
  /** Ask the user for the figure. For values only they can know. */
  | 'REQUEST_USER_INPUT'
  /** Drop to the market-neutral version of the calculation. */
  | 'FALL_BACK_TO_GENERIC_METHOD'
  /** Show the result, minus the comparison the reference would have provided. */
  | 'REMOVE_REFERENCE_COMPARISON'
  /** Suppress the market-specific part; the generic result stands. */
  | 'DISABLE_MARKET_SPECIFIC_RESULT'
  /** Refuse to produce a number at all. Reserved for calculation-critical law. */
  | 'BLOCK_CALCULATION';

/**
 * Where a number in a projection came from — LifeMap's central distinction.
 *
 * A scenario that shows "₹4,20,000" without saying whether that is a balance
 * the user typed, a planning choice they made or an output of the model is
 * asking the reader to trust all three equally. They should not.
 */
export type ValueTier =
  /** KNOWN — entered or observed, as at a date. Not independently audited. */
  | 'KNOWN'
  /** REFERENCE — a published external value with its own provenance. */
  | 'REFERENCE'
  /** ASSUMED — an explicit, editable planning choice. */
  | 'ASSUMED'
  /** PROJECTED — computed from known plus assumed. */
  | 'PROJECTED';

/**
 * Sentinel for "a value is required here and only the user can supply it".
 *
 * A string, never a number, and never `0`. The single most dangerous thing this
 * layer could do is let a missing regulatory value arrive at a calculator as
 * zero — "your deposit protection is ₹0" is a confident, false, alarming claim
 * assembled entirely out of an absence.
 */
export const USER_INPUT_REQUIRED = 'USER_INPUT_REQUIRED' as const;
export type UserInputRequired = typeof USER_INPUT_REQUIRED;

/** The pack's marker for a field research could not establish. Distinct from null. */
export const NOT_VERIFIED = 'NOT_VERIFIED' as const;

/** `YYYY-MM-DD`, or null meaning genuinely unknown — never "no limit". */
export type IsoDate = string | null;

/** How often a reference is expected to change, and therefore to be re-checked. */
export type ReviewCadence =
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUAL'
  | 'ANNUAL_AND_EVENT'
  | 'ANNUAL_AND_QUARTERLY'
  | 'TAX_YEAR_AND_BUDGET'
  | 'QUARTERLY_AND_REGULATORY_EVENT'
  | 'RELEASE_EVENT'
  | 'TRIENNIAL_RELEASE'
  | 'FIVE_YEAR_RELEASE'
  | 'METHODOLOGY_ONLY'
  | 'NONE';

export const REVIEW_CADENCES: readonly ReviewCadence[] = [
  'MONTHLY', 'QUARTERLY', 'ANNUAL', 'ANNUAL_AND_EVENT', 'ANNUAL_AND_QUARTERLY',
  'TAX_YEAR_AND_BUDGET', 'QUARTERLY_AND_REGULATORY_EVENT', 'RELEASE_EVENT',
  'TRIENNIAL_RELEASE', 'FIVE_YEAR_RELEASE', 'METHODOLOGY_ONLY', 'NONE',
];

/**
 * A source's authority on its own topic.
 *
 * Read as "what kind of body is this", not "how good is it". A statistics
 * office is tier 4 and is nonetheless the only acceptable authority on a
 * household survey; legislation is tier 1 and says nothing whatever about CPI.
 * The pack's hand-off is explicit about this and so is `preferSourceFor`:
 * competence on the topic outranks the tier number.
 */
export type SourceTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** What a source record has to carry to be checkable by a reader. */
export interface ReferenceSource {
  /** Stable across URL changes. Append a new id rather than recycling one. */
  readonly id: string;
  readonly market: ReferenceMarket;
  readonly topic: SourceTopic;
  /** The body that published it, as it names itself. */
  readonly authority: string;
  readonly title: string;
  readonly url: string;
  /** When the rule it states took effect. Null = not established. */
  readonly effectiveDate: IsoDate;
  /** When the document was published. Null = not established. */
  readonly publicationDate: IsoDate;
  /** When a human last checked the extracted claim against this page. */
  readonly lastVerified: string;
  readonly reviewDue: string;
  readonly cadence: ReviewCadence;
  readonly tier: SourceTier;
  /** Language of the source document, BCP-47. */
  readonly language: string;
  readonly scope: GeographicScope;
  /** What was actually checked — never "everything on the page". */
  readonly verificationScope: string;
  readonly changeImpact: ChangeImpact;
  readonly notes?: string;
}

export type SourceTopic =
  | 'deposit'
  | 'tax'
  | 'retirement'
  | 'inflation'
  | 'peer'
  | 'cash'
  | 'investment'
  | 'heuristic';

/**
 * A reference value plus everything needed to explain and police it.
 *
 * `value` is deliberately a union including the `USER_INPUT_REQUIRED` sentinel
 * and `null`: the type system, not a convention, is what stops a caller doing
 * arithmetic on an absence.
 */
export interface ReferenceAssumption {
  readonly id: string;
  readonly market: ReferenceMarket;
  /** Which tools may read it. Empty means "any, as context". */
  readonly tools: readonly string[];
  /** The thing being described, in SCREAMING_SNAKE. */
  readonly variable: string;
  readonly value: number | string | UserInputRequired | null;
  /** ISO currency, `percent_year_on_year`, `decimal_fraction`, `months`… */
  readonly unit: string;
  readonly sourceIds: readonly string[];
  readonly effectiveDate: IsoDate;
  readonly lastVerified: string;
  readonly reviewDue: string;
  readonly scope: GeographicScope;
  /** Whether the user may override it. Statutory values: never. */
  readonly userEditable: boolean;
  /**
   * True when a wrong value changes a number rather than a sentence.
   *
   * Nothing in this registry is currently `true`. That is the finding, not an
   * oversight: every value here is contextual or explanatory, and none of them
   * is wired into a parity-pinned formula. The flag exists so that the day one
   * is, the stale/blocked handling already knows to treat it differently.
   */
  readonly calculationCritical: boolean;
  readonly quality: DataQualityState;
  readonly changeImpact: ChangeImpact;
  readonly tier: ValueTier;
  /** Who and what this actually applies to. The most-read field in the record. */
  readonly applicability: string;
  /** Present when quality is NO_AUTHORITATIVE_DEFAULT: why there is no value. */
  readonly reason?: string;
  /** Named things that must be true before automatic use is permitted. */
  readonly activationBlockers: readonly string[];
  readonly methodologyId: MethodologyId;
}

/**
 * Methodology identifiers, carried over from the pack so a saved result can
 * name the document that explains it.
 */
export type MethodologyId =
  | 'M-BUDGET'
  | 'M-EXPENSE'
  | 'M-INVESTMATCH'
  | 'M-PARKSMART'
  | 'M-PEER'
  | 'M-MATH'
  | 'M-LIFEMAP'
  | 'M-NETWORTH'
  | 'M-TAX'
  | 'M-RETIREMENT'
  | 'M-REFERENCE'
  | 'M-GOVERNANCE';

/** Version of this layer's schema and content. Bumped by hand, asserted in tests. */
export const REFERENCE_VERSION = '1.0.0';

/**
 * The date the imported pack states as its own research cutoff.
 *
 * Every `lastVerified` in this layer is the pack's, not FinatriX's, and saying
 * so matters: FinatriX did not re-check 105 government pages, it imported a
 * dated extraction and is honest about which date that is.
 */
export const REFERENCE_AS_OF = '2026-09-12';
