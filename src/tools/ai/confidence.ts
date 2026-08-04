/**
 * How much data an answer is standing on.
 *
 * The one design decision in this file: confidence is **measured, not claimed**.
 * A model asked to rate its own certainty will produce a plausible-sounding
 * number that tracks its tone rather than the evidence, and "High confidence"
 * on top of six weeks of data is worse than no badge at all — it converts a
 * guess into something the user will act on.
 *
 * So it is computed here, from the same snapshot the answer was grounded in,
 * before the model is even called. It describes the *evidence*, which is a
 * property of the data rather than of the question, and is therefore something
 * we can state without ever being wrong about it.
 */

import type { FinanceSnapshot } from './context';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface Confidence {
  level: ConfidenceLevel;
  /** Short label for the badge. */
  label: string;
  /** Why it is that level, in the user's terms. */
  basis: string;
}

/** Below this, month-over-month comparison has nothing to compare. */
const MIN_MONTHS_FOR_TREND = 2;
/** At or above this, seasonal and recurring patterns start to be visible. */
const MONTHS_FOR_HIGH = 6;

/**
 * Rate the evidence behind an answer about `snapshot`.
 *
 * The measure is how many months actually contain transactions — not how many
 * months the account has existed, and not how many rows are in the store. Ten
 * transactions in one month still cannot support "your dining is trending up".
 */
export function assessConfidence(snapshot: FinanceSnapshot): Confidence {
  const monthsWithData = snapshot.monthlyHistory.filter((m) => m.txCount > 0).length;
  const currentMonthHasData = snapshot.monthlyHistory
    .some((m) => m.month === snapshot.month && m.txCount > 0);

  if (monthsWithData === 0) {
    return {
      level: 'low',
      label: 'Low confidence',
      basis: 'No transactions have been logged yet.',
    };
  }

  if (!currentMonthHasData) {
    return {
      level: 'low',
      label: 'Low confidence',
      basis: `Nothing is logged for ${snapshot.monthName}, so this rests on earlier months only.`,
    };
  }

  if (monthsWithData < MIN_MONTHS_FOR_TREND) {
    return {
      level: 'low',
      label: 'Low confidence',
      basis: 'Based on one month of data — too little to show a trend.',
    };
  }

  if (monthsWithData < MONTHS_FOR_HIGH) {
    return {
      level: 'medium',
      label: 'Medium confidence',
      basis: `Based on ${monthsWithData} months of your data.`,
    };
  }

  return {
    level: 'high',
    label: 'High confidence',
    basis: `Based on ${monthsWithData} months of your data.`,
  };
}

/**
 * The sentence handed to the model alongside the data.
 *
 * The badge tells the user how solid the ground is; this tells the assistant to
 * write as if it knows. Without it, a model with eleven months of history
 * hedges exactly as much as one with two, and the badge and the prose disagree.
 *
 * Scoped to "data" answers, and explicitly so. An empty account produces the
 * strongest hedging language in this file, and left unscoped it would leak into
 * a "general" answer — turning "how does compounding work" into a paragraph
 * about how little the user has logged, which is both irrelevant and untrue of
 * an answer that never touched their records.
 */
export function confidenceInstruction(c: Confidence): string {
  return `EVIDENCE (applies to "data" answers only — it rates the user's records, not your general knowledge) — ${basisInstruction(c)}`;
}

function basisInstruction(c: Confidence): string {
  switch (c.level) {
    case 'low':
      return `${c.basis} Say plainly what is missing, and label anything forward-looking as an estimate. Do not present a trend, a comparison or a forecast as established fact.`;
    case 'medium':
      return `${c.basis} That supports comparison between months, but not seasonal claims. Label forecasts as estimates.`;
    case 'high':
      return `${c.basis} That is enough to describe trends and compare months directly. Still label anything forward-looking as an estimate.`;
  }
}
