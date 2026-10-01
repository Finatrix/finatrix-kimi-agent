/**
 * Which references need a human to look at them, and how urgently.
 *
 * WHY MAINTENANCE IS PART OF THE ARCHITECTURE
 * -------------------------------------------
 * Every value in this layer has an owner somewhere outside this repository who
 * can change it without telling anyone: a tax office, a central bank, a scheme
 * operator, a statistics office. The half-life of a correct answer here is
 * measured in months, and the failure mode is silent — nothing breaks, nothing
 * throws, the number simply stops being true.
 *
 * The only defence is a review cycle, and the only review cycle that survives
 * contact with a real backlog is one that surfaces itself. So the report is a
 * function over the same records the product renders, it runs in development
 * whenever the tools load, and it is the thing a developer sees rather than a
 * document they would have to remember to open.
 *
 * DELIBERATELY NOT AN ADMIN PRODUCT
 * ---------------------------------
 * There is no dashboard, no database table and no scheduled job. This project
 * has no admin surface, and building one to hold nine overdue dates would be
 * more code to maintain than the data it watches. A sorted list, a console
 * group in development and a test are the whole mechanism.
 */

import { ASSUMPTIONS } from './assumptions';
import { DEPOSIT_PROTECTION } from './deposits';
import { evaluateFreshness } from './freshness';
import { INFLATION_OBSERVATIONS } from './inflation';
import { SOURCES } from './sources';
import type { ChangeImpact, DataQualityState, ReferenceMarket } from './types';

export interface ReviewItem {
  readonly id: string;
  readonly market: ReferenceMarket;
  readonly kind: 'source' | 'deposit' | 'inflation' | 'assumption';
  readonly reviewDue: string;
  readonly daysOverdue: number;
  readonly state: DataQualityState;
  readonly impact: ChangeImpact;
}

export interface ReviewReport {
  readonly generatedFor: Date;
  /** Past the review date but within the stale window. */
  readonly due: readonly ReviewItem[];
  /** Far enough past it that the value is treated as no longer current. */
  readonly overdue: readonly ReviewItem[];
  readonly total: number;
}

/**
 * Everything needing review as of `now`, worst first.
 *
 * Planning assumptions are excluded: they have no publisher, so there is nobody
 * whose change we could be missing. Including them would fill the report with
 * rows no amount of research could ever clear.
 */
export function reviewReport(now: Date = new Date()): ReviewReport {
  const items: ReviewItem[] = [];
  const seen = new Set<string>();

  const consider = (
    id: string,
    market: ReferenceMarket,
    kind: ReviewItem['kind'],
    quality: DataQualityState,
    reviewDue: string,
    lastVerified: string,
    impact: ChangeImpact,
  ) => {
    const verdict = evaluateFreshness({ quality, reviewDue, lastVerified }, now);
    if (verdict.state !== 'REVIEW_DUE' && verdict.state !== 'STALE') return;
    // One row per reference, not per registry that mentions it. The assumption
    // registry PROJECTS the deposit and inflation records rather than copying
    // them, so the same id legitimately arrives twice — and a maintenance list
    // that double-counts is a list people stop believing the totals of.
    if (seen.has(id)) return;
    seen.add(id);
    items.push({ id, market, kind, reviewDue, daysOverdue: verdict.daysOverdue, state: verdict.state, impact });
  };

  for (const s of SOURCES) {
    consider(s.id, s.market, 'source', 'VERIFIED_CURRENT', s.reviewDue, s.lastVerified, s.changeImpact);
  }
  for (const d of DEPOSIT_PROTECTION) {
    consider(`${d.market}-DEPOSIT_PROTECTION_LIMIT`, d.market, 'deposit', d.quality, d.reviewDue, d.lastVerified, d.changeImpact);
  }
  for (const o of INFLATION_OBSERVATIONS) {
    consider(`${o.market}-CPI_OBSERVATION`, o.market, 'inflation', o.quality, o.reviewDue, o.lastVerified, 'MEDIUM');
  }
  for (const a of ASSUMPTIONS) {
    if (a.tier === 'ASSUMED') continue;
    consider(a.id, a.market, 'assumption', a.quality, a.reviewDue, a.lastVerified, a.changeImpact);
  }

  const IMPACT_ORDER: Readonly<Record<ChangeImpact, number>> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  items.sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] || b.daysOverdue - a.daysOverdue);

  return {
    generatedFor: now,
    due: items.filter((i) => i.state === 'REVIEW_DUE'),
    overdue: items.filter((i) => i.state === 'STALE'),
    total: items.length,
  };
}

/**
 * One grouped console warning in development when references are overdue.
 *
 * Runs once per session, only when `import.meta.env.DEV` is true, and prints
 * nothing at all when everything is current — a maintenance signal that fires
 * on a clean tree is one people learn to scroll past. Wrapped so that a console
 * that refuses to group (some CI and test environments) cannot take a page down
 * over a diagnostic.
 */
export function warnIfOverdue(now: Date = new Date()): void {
  const report = reviewReport(now);
  if (report.total === 0) return;
  try {
    const worst = [...report.overdue, ...report.due].slice(0, 8);
    console.warn(
      `[finatrix-reference] ${report.overdue.length} reference(s) past their stale threshold, ${report.due.length} due for review.`,
      worst.map((i) => `${i.id} (${i.impact}, ${i.daysOverdue}d)`).join(', '),
    );
  } catch {
    /* a diagnostic must never be the thing that breaks a page */
  }
}
