/**
 * The central assumption registry: one record per reference value the product
 * relies on, whatever kind of value it is.
 *
 * COMPOSED, NOT COPIED
 * --------------------
 * The deposit caps, CPI observations and tax schedules already live in typed
 * registries of their own, next to the domain knowledge that explains them.
 * Restating them here as a flat list would create exactly the duplicate source
 * of truth this whole layer exists to remove — two copies of the FSCS limit,
 * drifting apart the first time one is updated.
 *
 * So the domain registries are the source of truth and this file *projects*
 * them into a single uniform shape. Ask "what does FinatriX assume for the UK,
 * and where did each piece come from?" and you get one list. Change a deposit
 * cap and it changes here automatically.
 *
 * THE FOURTH KIND OF RECORD
 * -------------------------
 * Three kinds project cleanly from sources: market configuration, statistical
 * observations and tax schedules. The fourth has no source and never will —
 * planning assumptions. Long-run inflation, expected return, the horizon a goal
 * is measured over: these are choices, and the honest record for a choice names
 * it as a choice and says who owns it.
 *
 * Their *values* deliberately do not live here. FinatriX's long-run inflation
 * assumption is 6% in India and 2.5% elsewhere, and those numbers belong to the
 * market packs where the rest of that market's planning defaults sit. What this
 * registry owns is the classification — that it is an assumption rather than a
 * published rate, that it must be labelled as one, and that no authority
 * endorses it. `valueSource` records where to go for the number.
 *
 * That separation is the single most load-bearing idea in this module. The
 * moment a planning assumption is filed alongside a published statistic, a
 * reader can no longer tell which of the two numbers on their screen somebody
 * measured and which one the product picked.
 */

import { DEPOSIT_PROTECTION } from './deposits';
import { INFLATION_OBSERVATIONS } from './inflation';
import { TAX_SCHEDULES } from './taxReference';
import {
  REFERENCE_MARKETS,
  type DataQualityState,
  type ReferenceAssumption,
  type ReferenceMarket,
  USER_INPUT_REQUIRED,
} from './types';

/**
 * Where the number itself comes from, as distinct from where its metadata lives.
 *
 * `MARKET_PACK` is the interesting one: it means this registry classifies and
 * governs the value but does not hold it, because the value is a product
 * decision that belongs with the rest of that market's defaults.
 */
export type ValueSource = 'REFERENCE_REGISTRY' | 'MARKET_PACK' | 'USER' | 'NONE';

export interface RegisteredAssumption extends ReferenceAssumption {
  readonly valueSource: ValueSource;
}

/** Deposit caps → assumption records. The UAE's is a record of an absence. */
const fromDeposits: readonly RegisteredAssumption[] = DEPOSIT_PROTECTION.map((d) => ({
  id: `${d.market}-DEPOSIT_PROTECTION_LIMIT`,
  market: d.market,
  tools: ['parksmart'],
  variable: 'DEPOSIT_PROTECTION_LIMIT',
  value: d.limit,
  unit: d.currency,
  sourceIds: d.sourceIds,
  effectiveDate: d.effectiveDate,
  lastVerified: d.lastVerified,
  reviewDue: d.reviewDue,
  scope: 'NATIONAL' as const,
  // A statutory cap is not the user's to edit. Someone who believes their cover
  // is higher can say so to their bank; they cannot say so to the law.
  userEditable: false,
  // Shown and compared against, never multiplied into a result.
  calculationCritical: false,
  quality: d.quality,
  changeImpact: d.changeImpact,
  tier: 'REFERENCE' as const,
  applicability: d.applicability,
  reason: d.limit === null ? d.applicability : undefined,
  activationBlockers: d.limit === null ? ['NO_VERIFIED_OPERATIVE_CAP'] : [],
  methodologyId: 'M-PARKSMART' as const,
  valueSource: 'REFERENCE_REGISTRY' as const,
}));

/** CPI prints → assumption records. Context for a planning rate, never the rate. */
const fromInflation: readonly RegisteredAssumption[] = INFLATION_OBSERVATIONS.map((o) => ({
  id: `${o.market}-CPI_OBSERVATION`,
  market: o.market,
  tools: ['goals', 'lifemap'],
  variable: 'CPI_OBSERVATION',
  value: o.observedYoY,
  unit: 'percent_year_on_year',
  sourceIds: [o.sourceId],
  // A price index describes a month; it does not "take effect" on a date.
  effectiveDate: null,
  lastVerified: o.lastVerified,
  reviewDue: o.reviewDue,
  scope: 'NATIONAL' as const,
  userEditable: false,
  calculationCritical: false,
  quality: o.quality,
  changeImpact: 'MEDIUM' as const,
  tier: 'REFERENCE' as const,
  applicability: `${o.measure}, ${o.observationPeriod}. A single month’s year-on-year reading. It describes what prices did, not what they will do, and must never be used as a long-run planning rate.`,
  activationBlockers: ['NEVER_A_PROJECTION_INPUT'],
  methodologyId: 'M-REFERENCE' as const,
  valueSource: 'REFERENCE_REGISTRY' as const,
}));

/** Tax schedules → assumption records. Explanatory; never an automatic estimate. */
const fromTax: readonly RegisteredAssumption[] = TAX_SCHEDULES.map((s) => ({
  id: `${s.id}-SCHEDULE`,
  market: s.market,
  tools: ['parksmart'],
  variable: 'ORDINARY_INCOME_SCHEDULE',
  value: s.period,
  unit: 'decimal_fraction_bands',
  sourceIds: s.sourceIds,
  effectiveDate: s.effectiveDate,
  lastVerified: s.lastVerified,
  reviewDue: '2026-12-12',
  scope: s.scope,
  userEditable: false,
  calculationCritical: false,
  quality: 'VERIFIED_CURRENT' as const,
  changeImpact: 'HIGH' as const,
  tier: 'REFERENCE' as const,
  applicability: s.applicability,
  activationBlockers: ['TOTAL_TAX_AUTOMATION_NOT_APPROVED'],
  methodologyId: 'M-TAX' as const,
  valueSource: 'REFERENCE_REGISTRY' as const,
}));

/**
 * The planning assumptions, declared once and applied to every market.
 *
 * Each is a product decision with no publisher. `value` is either the
 * `USER_INPUT_REQUIRED` sentinel — for things only the person can answer — or
 * null with `valueSource: 'MARKET_PACK'`, meaning "the number is a default in
 * that market's pack and this record governs how it must be presented".
 */
interface PlanningAssumptionSpec {
  readonly variable: string;
  readonly tools: readonly string[];
  readonly unit: string;
  readonly value: RegisteredAssumption['value'];
  readonly valueSource: ValueSource;
  readonly userEditable: boolean;
  readonly quality: DataQualityState;
  readonly applicability: string;
  readonly reason?: string;
}

const PLANNING: readonly PlanningAssumptionSpec[] = [
  {
    variable: 'LONG_RUN_INFLATION',
    tools: ['goals', 'lifemap'],
    unit: 'decimal_fraction',
    value: null,
    valueSource: 'MARKET_PACK',
    userEditable: false,
    quality: 'ILLUSTRATIVE',
    applicability:
      'A long-run planning rate chosen by FinatriX, shown so a goal stated in today’s money can be grown into the money it will actually cost. It is not a forecast, no authority endorses it, and it is deliberately not the latest CPI print — one month’s reading is far too volatile to plan decades against.',
  },
  {
    variable: 'EXPECTED_RETURN',
    tools: ['goals', 'lifemap', 'investmatch'],
    unit: 'decimal_fraction',
    value: USER_INPUT_REQUIRED,
    valueSource: 'MARKET_PACK',
    userEditable: true,
    quality: 'ILLUSTRATIVE',
    applicability:
      'The growth rate a scenario is run at. Every growth path in the product is a hypothetical the reader can change; no historical average determines a future return, and nothing here should be read as one being expected.',
  },
  {
    variable: 'RETIREMENT_AGE',
    tools: ['lifemap'],
    unit: 'years',
    value: USER_INPUT_REQUIRED,
    valueSource: 'USER',
    userEditable: true,
    quality: 'NO_AUTHORITATIVE_DEFAULT',
    reason:
      'There is no defensible default. The age someone wants to stop working, the age their savings become accessible, the age a statutory benefit becomes payable and the age they claim it are four different dates, and only the person knows the first.',
    applicability: 'Must be entered. FinatriX does not infer it from a country or an age.',
  },
  {
    variable: 'LIFE_EXPECTANCY',
    tools: ['lifemap'],
    unit: 'years',
    value: USER_INPUT_REQUIRED,
    valueSource: 'USER',
    userEditable: true,
    quality: 'NO_AUTHORITATIVE_DEFAULT',
    reason:
      'A population average is not a personal lifespan, and life expectancy at birth is not remaining life expectancy at someone’s current age. A scenario should stop at a horizon the reader chose, not at an inferred date of death.',
    applicability: 'Offered as a chosen planning horizon with a longevity stress scenario, never as a demographic default.',
  },
  {
    variable: 'STATUTORY_PENSION_BENEFIT',
    tools: ['lifemap'],
    unit: 'currency_per_period',
    value: USER_INPUT_REQUIRED,
    valueSource: 'USER',
    userEditable: true,
    quality: 'NO_AUTHORITATIVE_DEFAULT',
    reason:
      'Entitlement depends on an earnings or contribution history, residence and means tests, a claiming decision and future law. None of it can be inferred from a country code.',
    applicability: 'Take the figure from an official personal forecast and enter it, noting the price basis it is quoted in.',
  },
];

const fromPlanning: readonly RegisteredAssumption[] = REFERENCE_MARKETS.flatMap((market) =>
  PLANNING.map<RegisteredAssumption>((p) => ({
    id: `${market}-${p.variable}`,
    market,
    tools: p.tools,
    variable: p.variable,
    value: p.value,
    unit: p.unit,
    // The defining property of a planning assumption: no source, because none
    // exists. An empty list here is a statement, not an omission.
    sourceIds: [],
    effectiveDate: null,
    lastVerified: '2026-09-12',
    // A choice has no publisher and therefore no publication schedule. It is
    // reviewed when the person's circumstances change, which is not a date.
    reviewDue: '2027-09-12',
    scope: 'USER_SPECIFIC',
    userEditable: p.userEditable,
    calculationCritical: false,
    quality: p.quality,
    changeImpact: 'MEDIUM',
    tier: 'ASSUMED',
    applicability: p.applicability,
    reason: p.reason,
    activationBlockers: p.quality === 'NO_AUTHORITATIVE_DEFAULT' ? ['USER_MUST_SUPPLY'] : [],
    methodologyId: 'M-GOVERNANCE',
    valueSource: p.valueSource,
  })),
);

export const ASSUMPTIONS: readonly RegisteredAssumption[] = [
  ...fromDeposits,
  ...fromInflation,
  ...fromTax,
  ...fromPlanning,
];

const BY_ID: ReadonlyMap<string, RegisteredAssumption> = new Map(ASSUMPTIONS.map((a) => [a.id, a]));

export function assumptionById(id: string): RegisteredAssumption | undefined {
  return BY_ID.get(id);
}

export function assumptionsForMarket(market: ReferenceMarket): readonly RegisteredAssumption[] {
  return ASSUMPTIONS.filter((a) => a.market === market);
}

/** Every assumption a given tool may read in a given market. */
export function assumptionsForTool(market: ReferenceMarket, toolId: string): readonly RegisteredAssumption[] {
  return ASSUMPTIONS.filter((a) => a.market === market && a.tools.includes(toolId));
}

export function assumptionFor(market: ReferenceMarket, variable: string): RegisteredAssumption | undefined {
  return ASSUMPTIONS.find((a) => a.market === market && a.variable === variable);
}
