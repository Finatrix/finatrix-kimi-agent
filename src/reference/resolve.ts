/**
 * The resolver: given a reference and what a caller wants to do with it, decide
 * whether that is allowed and what happens when it is not.
 *
 * WHY THE CALLER STATES ITS INTENT
 * --------------------------------
 * The same value can be perfectly safe and completely unusable depending on the
 * sentence it is about to appear in. The FSCS limit is:
 *
 *   • fine as CONTEXT — "deposits at a UK bank are protected to £120,000";
 *   • fine as a COMPARISON — "the amount you entered is above that limit";
 *   • not fine as a MARKET_SPECIFIC_RESULT if it is out of review — a confident
 *     figure nobody has checked is worse than no figure;
 *   • never a CALCULATION input, because coverage depends on institution and
 *     ownership facts the product does not hold.
 *
 * So `resolveReference` takes the use, not just the value, and returns a
 * failure behaviour proportionate to it. A missing contextual source must not
 * stop Budget Builder from adding up; a stale calculation-critical regulatory
 * value must stop a number being shown at all. Anything in between degrades by
 * exactly one step.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * It will not substitute another market's value. It will not fall back to zero.
 * It will not fill a `REGION_SPECIFIC` rule with a national average. Each of
 * those turns an honest absence into a confident error, which is the specific
 * class of bug this layer was built to make impossible.
 */

import { evaluateFreshness, type FreshnessVerdict } from './freshness';
import { sourcesByIds } from './sources';
import {
  RESOLVABLE_SCOPES,
  type DataQualityState,
  type FailureBehaviour,
  type GeographicScope,
  type ReferenceSource,
} from './types';

/**
 * What the caller intends to do with the value, ordered by how much damage a
 * wrong answer does.
 */
export type ReferenceUse =
  /** Explanatory prose. A wrong value misinforms; it does not misstate a result. */
  | 'CONTEXT'
  /** A stated relationship between the user's number and the reference. */
  | 'COMPARISON'
  /** A figure presented as specific to this market. */
  | 'MARKET_SPECIFIC_RESULT'
  /** An operand in arithmetic whose output the user will act on. */
  | 'CALCULATION';

export interface ResolvableReference {
  readonly quality: DataQualityState;
  readonly reviewDue: string;
  readonly lastVerified: string;
  readonly scope: GeographicScope;
  readonly sourceIds: readonly string[];
  /** Named preconditions that have not been met. Any entry blocks activation. */
  readonly activationBlockers: readonly string[];
  readonly value: unknown;
}

export interface Resolution {
  /** Whether the caller may use the value for the stated purpose. */
  readonly usable: boolean;
  readonly behaviour: FailureBehaviour;
  readonly freshness: FreshnessVerdict;
  /** Resolved source records, for citation. May be empty for a planning assumption. */
  readonly sources: readonly ReferenceSource[];
  /** One sentence explaining the outcome, or null when there is nothing to say. */
  readonly notice: string | null;
}

/** How far each use may degrade before the value is refused outright. */
const DEGRADE: Readonly<Record<ReferenceUse, FailureBehaviour>> = {
  CONTEXT: 'USE_WITH_WARNING',
  COMPARISON: 'REMOVE_REFERENCE_COMPARISON',
  MARKET_SPECIFIC_RESULT: 'DISABLE_MARKET_SPECIFIC_RESULT',
  CALCULATION: 'BLOCK_CALCULATION',
};

/** A value that is absent in every sense that matters to a calculator. */
function isAbsent(value: unknown): boolean {
  return value === null || value === undefined || value === 'USER_INPUT_REQUIRED' || value === 'NOT_VERIFIED';
}

export function resolveReference(
  ref: ResolvableReference,
  use: ReferenceUse,
  now: Date = new Date(),
): Resolution {
  const freshness = evaluateFreshness(ref, now);
  const sources = sourcesByIds(ref.sourceIds);
  const fail = (behaviour: FailureBehaviour, notice: string): Resolution => ({
    usable: false, behaviour, freshness, sources, notice,
  });

  // 1. No value. Never zero, never another market's, never a guess. The only
  //    honest moves are to ask, or to drop the part of the answer it supported.
  if (isAbsent(ref.value)) {
    return fail(
      use === 'CONTEXT' ? 'USE_WITH_WARNING' : 'REQUEST_USER_INPUT',
      'No verified value is available, so this is left blank rather than filled in.',
    );
  }

  // 2. Geography the product does not hold. A national average for a rule that
  //    is set per state, emirate or province is not an approximation — it is a
  //    different rule. Nothing may fall back.
  if (!RESOLVABLE_SCOPES.includes(ref.scope)) {
    return fail(
      use === 'CONTEXT' ? 'USE_WITH_WARNING' : 'REQUEST_USER_INPUT',
      'This rule depends on your region, which FinatriX does not ask for, so it is not applied automatically.',
    );
  }

  // 3. A named precondition has not been met. Distinct from staleness: the value
  //    may be perfectly current and still not cleared for this use.
  if (ref.activationBlockers.length > 0 && use !== 'CONTEXT') {
    return fail(
      DEGRADE[use],
      'This reference has not been cleared for automatic use, so it is shown as context only.',
    );
  }

  // 4. Stale. Contextual uses continue with the vintage visible, because a dated
  //    fact is still a fact; anything that would present it as current does not.
  if (freshness.state === 'STALE') {
    if (use === 'CONTEXT') {
      return {
        usable: true,
        behaviour: 'USE_WITH_WARNING',
        freshness,
        sources,
        notice: freshness.notice,
      };
    }
    return fail(DEGRADE[use], freshness.notice ?? 'This reference is out of date.');
  }

  // 5. Overdue for review but with no evidence of change. Low-risk uses proceed
  //    with the review status visible; a calculation does not, because "probably
  //    still right" is not a basis for a number somebody will act on.
  if (freshness.state === 'REVIEW_DUE') {
    if (use === 'CALCULATION') {
      return fail('BLOCK_CALCULATION', 'This reference is awaiting review, so the estimate that depends on it is paused.');
    }
    return { usable: true, behaviour: 'USE_WITH_WARNING', freshness, sources, notice: freshness.notice };
  }

  return { usable: true, behaviour: 'USE_WITH_WARNING', freshness, sources, notice: null };
}

/**
 * Rank sources for citation: topic competence first, then authority tier.
 *
 * The pack's hand-off is explicit that a mechanical tier sort is wrong — it
 * would rank an unrelated piece of legislation above the statistics office that
 * actually published the survey being cited. So the caller names the topic, and
 * anything on-topic outranks everything off-topic regardless of tier.
 */
export function preferSourceFor(
  topic: ReferenceSource['topic'],
  sources: readonly ReferenceSource[],
): readonly ReferenceSource[] {
  return [...sources].sort((a, b) => {
    const onTopic = Number(b.topic === topic) - Number(a.topic === topic);
    return onTopic !== 0 ? onTopic : a.tier - b.tier;
  });
}
