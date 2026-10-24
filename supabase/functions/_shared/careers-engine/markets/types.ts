/**
 * Market definitions for FinatriX Careers: one per country the engine understands.
 *
 * A market is data. Every function that reads it lives in `index.ts`, so adding a market or a city
 * is a data change, not a code change.
 *
 * Rule: nothing in a market definition is a rate, a threshold from law, or any other figure that
 * ages. Super, KiwiSaver, pension and PF wording is recognised so a salary can be LABELLED as
 * including or excluding a contribution; no contribution is ever computed. A tripwire test keeps
 * percentages and rate constants out of this folder.
 */

export type CareersMarket = 'us' | 'gb' | 'in' | 'au' | 'nz';

export type MarketCurrency = 'USD' | 'GBP' | 'INR' | 'AUD' | 'NZD';

/** Work-rights language found in a posting, strictest first in `STRICTNESS` (index.ts). */
export type RightsRequirement =
  | 'citizen_only'
  | 'citizen_or_pr'
  | 'clearance_required'
  | 'work_rights_required'
  | 'no_sponsorship'
  | 'sponsorship_available'
  | 'unspecified';

export interface RightsPattern {
  re: RegExp;
  kind: RightsRequirement;
  /** Clearance level id from the market's `clearanceLevels`, when the pattern names one. */
  clearance?: string;
}

export type ContributionKind = 'super' | 'kiwisaver' | 'pension' | 'pf';
export type ContributionTreatment = 'included' | 'excluded' | 'unknown';

export interface MarketDef {
  id: CareersMarket;
  /** ISO 3166-1 alpha-2, upper case: the value stored in `career_postings.country`. */
  iso: 'US' | 'GB' | 'IN' | 'AU' | 'NZ';
  /** Display name. */
  name: string;
  currency: MarketCurrency;

  // ── Locations ──
  /** Country names and demonyms that put a posting in this market. Lowercase phrases; hard evidence. */
  countryNames: string[];
  /** Case-sensitive standalone tokens for the country ("US", "UK", "NZ"); hard evidence. */
  countryTokens: string[];
  /** Full region names → region code. Lowercase; hard evidence. Ambiguous names belong in `cities` + `weakCities`. */
  regions: Record<string, string>;
  /** Region codes unique to this market, matched case-sensitively as standalone tokens ("NSW"); hard evidence. */
  strongRegionCodes: string[];
  /** Region codes that also mean something elsewhere ("WA"), matched as standalone tokens; weak evidence. */
  weakRegionCodes: string[];
  /** Region codes recognised only after a comma or dash ("Austin, TX"); hard evidence here, foreign evidence elsewhere. */
  postfixRegionCodes: string[];
  /** Major cities and business districts → region code. Lowercase. */
  cities: Record<string, string>;
  /** Keys of `cities` whose names also exist overseas or are ordinary words: never proof on their own. */
  weakCities: string[];
  /** Region words that, with "remote", place a posting in this market ("Remote - ANZ"). Lowercase. */
  remoteRegions: string[];

  // ── Salary ──
  salary: {
    /** A bare "$" means this market's currency. */
    bareDollar: boolean;
    /** Smallest unlabelled figure read as annual; anything smaller with no period stays unparsed. */
    inferYearFrom: number;
    /** Unlabelled figures below this read as hourly; null never infers hourly. */
    inferHourBelow: number | null;
    /** Contribution wording that labels a figure, never a rate. Rules run in order; the first match wins. */
    contribution: { kind: ContributionKind; rules: Array<{ re: RegExp; treatment: 'included' | 'excluded' }> } | null;
  };

  // ── Work rights (detect and show; never a visa-rule engine) ──
  rights: RightsPattern[];
  /** Clearance level ids, lowest first, with display names. */
  clearanceLevels: Array<{ id: string; label: string }>;
  /** Market wording for each requirement, shown on job cards. */
  rightsLabels: Record<RightsRequirement, string>;
  /** What permanent status is called here ("Green card holder", "Settled status (ILR)"), for the profile picker. */
  permanentLabel: string;

  // ── Agencies ──
  /** Recruitment agencies common in this market (lowercase); generic agency words are shared. */
  agencies: string[];
}
