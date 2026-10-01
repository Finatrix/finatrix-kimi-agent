/**
 * FinatriX's reference-data layer.
 *
 *   formula  ≠  market rule  ≠  published statistic  ≠  planning assumption
 *
 * Four different kinds of number, held apart, each carrying the metadata its
 * kind requires, so that any market-sensitive result can say which market it
 * used, which assumptions went into it, where they came from, when they were
 * last checked, whether the user chose them, and what they do not cover.
 *
 * WHERE TO START
 * --------------
 *   types.ts        the vocabulary, and why these exact enum names
 *   sources.ts      105 dated, clickable references with stable ids
 *   assumptions.ts  every reference value projected into one uniform shape
 *   resolve.ts      may this value be used for this purpose, and if not, what
 *   freshness.ts    how current it is now, not when it was written down
 *   gates.ts        what is deliberately switched off, and what would switch it on
 *   validate.ts     the structural errors that cannot be allowed to ship
 *
 * WHAT DOES NOT BELONG HERE
 * -------------------------
 * Arithmetic. This module is imported by tools; it imports nothing from them.
 * The one-way dependency is what lets a calculator cite a source without a
 * source ever being able to change a calculation — and it is checked, because
 * the moment reference data can reach into a formula the separation this layer
 * exists to enforce has already been lost.
 */

export * from './types';
export { SOURCES, sourceById, sourcesByIds } from './sources';
export {
  DEPOSIT_PROTECTION,
  depositProtectionFor,
  compareToCap,
  type DepositProtection,
  type CapComparison,
} from './deposits';
export {
  INFLATION_OBSERVATIONS,
  inflationFor,
  periodLabel,
  type InflationObservation,
} from './inflation';
export {
  TAX_SCHEDULES,
  taxSchedulesFor,
  taxPolicyFor,
  TAX_CHANGE_IMPACT,
  type TaxBand,
  type TaxCategory,
  type TaxPolicy,
  type TaxPolicyResult,
  type TaxSchedule,
} from './taxReference';
export {
  RETIREMENT_SYSTEMS,
  retirementFor,
  canProjectStatutoryBenefit,
  type RetirementSystem,
} from './retirement';
export {
  PEER_DATASETS,
  peerDatasetsFor,
  canRankPercentile,
  type PeerDataset,
} from './peerDatasets';
export { HEURISTICS, heuristicById, UNSUPPORTED_HEURISTICS, type Heuristic } from './heuristics';
export {
  ASSUMPTIONS,
  assumptionById,
  assumptionFor,
  assumptionsForMarket,
  assumptionsForTool,
  type RegisteredAssumption,
  type ValueSource,
} from './assumptions';
export {
  METHODOLOGIES,
  TOOL_METHODOLOGY,
  methodologyForTool,
  referenceLimitsFor,
  type MethodologyRecord,
} from './methodology';
export {
  evaluateFreshness,
  verifiedLabel,
  STALE_AFTER_DAYS,
  type FreshnessVerdict,
} from './freshness';
export {
  resolveReference,
  preferSourceFor,
  type ReferenceUse,
  type Resolution,
  type ResolvableReference,
} from './resolve';
export {
  OPEN_GATES,
  CONFLICTS,
  gatesForMarket,
  conflictsForMarket,
  type OpenGate,
  type ReferenceConflict,
} from './gates';
export {
  SOURCE_LABELS,
  TIER_LABELS,
  DISCLAIMERS,
  AVOIDED_CLAIMS,
  findAvoidedClaims,
  type AvoidedClaim,
  type DisclaimerLevel,
} from './copy';
export { validateReference, referenceErrors, type ValidationIssue } from './validate';
export { reviewReport, warnIfOverdue, type ReviewItem, type ReviewReport } from './review';
export { referenceDisclosureFor, type DisclosureItem, type ReferenceDisclosure } from './disclosure';
