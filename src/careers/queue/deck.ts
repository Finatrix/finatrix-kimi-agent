/**
 * Match Queue — the deck.
 *
 * One job is reviewed at a time, in ranked order, and each gets exactly one of
 * three verdicts. The whole module is pure: given the same jobs and the same
 * decisions it returns the same deck, which is what makes the review order
 * testable without a browser, a network or a resume.
 *
 * The three verdicts are NOT interchangeable, and the difference is the point:
 *
 *   declined — wrong role, wrong company, wrong money. Never show it again.
 *   skipped  — "not now". Returns at the END of the current deck, so an
 *              undecided job is never silently lost.
 *   applied  — went out. Also never shown again; a real `applications` row is
 *              the durable record, this is just deck bookkeeping.
 *
 * Skip-means-later is what keeps the queue honest. A queue that discards
 * anything you don't act on immediately trains people to apply out of loss
 * aversion, which is precisely the volume-over-fit behaviour that makes
 * automated applications worthless to everyone involved.
 */

import type { ScoredJob } from '../search/pipeline';

export type QueueVerdict = 'declined' | 'skipped' | 'applied';

/** Verdicts that remove a job from the deck permanently. */
const TERMINAL: ReadonlySet<QueueVerdict> = new Set<QueueVerdict>(['declined', 'applied']);

export function isTerminal(verdict: QueueVerdict): boolean {
  return TERMINAL.has(verdict);
}

export interface Deck {
  /** Jobs still awaiting a verdict, in review order. */
  cards: ScoredJob[];
  /** Jobs given a terminal verdict in this deck's source set. */
  decided: number;
  /** Jobs hidden because they scored below the threshold. */
  belowThreshold: number;
  /** Cards deferred by a skip, already counted inside `cards`. */
  deferred: number;
}

/**
 * Build the review order.
 *
 * `jobs` arrives already ranked by the search pipeline, so ordering here is
 * only ever a *stable partition*: undecided first, skipped after. Re-sorting by
 * score would fight the pipeline's ranking, which already blends relevance,
 * resume match and company-intelligence boosts.
 *
 * A job with no key yet (its content hash is still resolving) is treated as
 * undecided rather than dropped — the alternative is cards vanishing from the
 * deck for a few hundred milliseconds after every search.
 */
export function buildDeck(
  jobs: readonly ScoredJob[],
  keys: ReadonlyMap<ScoredJob, string>,
  decisions: ReadonlyMap<string, QueueVerdict>,
  threshold: number,
): Deck {
  const pending: ScoredJob[] = [];
  const deferred: ScoredJob[] = [];
  let decided = 0;
  let belowThreshold = 0;

  for (const job of jobs) {
    // No resume selected → `match` is null and every job is reviewable. A hard
    // threshold on an unscored deck would empty the queue and blame the user.
    const score = job.match?.overall ?? null;
    if (score != null && score < threshold) {
      belowThreshold++;
      continue;
    }
    const key = keys.get(job);
    const verdict = key ? decisions.get(key) : undefined;
    if (verdict && isTerminal(verdict)) {
      decided++;
      continue;
    }
    if (verdict === 'skipped') deferred.push(job);
    else pending.push(job);
  }

  return {
    cards: [...pending, ...deferred],
    decided,
    belowThreshold,
    deferred: deferred.length,
  };
}

/**
 * Terms the job asks for that the resume does not evidence.
 *
 * Surfaced as prominently as the matches on every card. A queue that only ever
 * argues *for* the job in front of you is an advertisement, and people stop
 * reading advertisements — the gaps are what make the score believable and the
 * review worth a person's attention.
 */
export function gapsOf(job: ScoredJob, limit = 6): string[] {
  return (job.match?.missingTerms ?? []).slice(0, limit);
}

/** Resume skills evidenced in this posting. */
export function strengthsOf(job: ScoredJob, limit = 6): string[] {
  return (job.match?.matchedSkills ?? []).slice(0, limit);
}

/**
 * Review progress across the whole session, for the progress bar.
 * `reviewed` counts terminal verdicts only — skipping is not progress.
 */
export function progressOf(deck: Deck): { reviewed: number; total: number; pct: number } {
  const total = deck.decided + deck.cards.length;
  const pct = total === 0 ? 0 : Math.round((deck.decided / total) * 100);
  return { reviewed: deck.decided, total, pct };
}
