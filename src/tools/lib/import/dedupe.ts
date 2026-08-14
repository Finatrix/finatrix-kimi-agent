/**
 * Finding transactions the user already has.
 *
 * Re-importing is the normal case, not the exceptional one. People upload last
 * month's statement, then upload a quarter that contains it; they log a big
 * purchase by hand the day it happens and import the statement three weeks
 * later. Both produce a ledger that double-counts, and a double-counted month is
 * exactly the kind of silent wrongness this product cannot afford.
 *
 * The match is deliberately deterministic and deliberately *not* a decision. A
 * flagged row is untick-by-default and clearly labelled, and the user can
 * override either way — because a genuine second ₹250 coffee on the same day at
 * the same shop is a real transaction, and no rule can tell it apart from a
 * duplicate. Removing rows automatically would eventually delete one of those.
 *
 * Nothing here consults a model. "Same amount, same day, same payee" is
 * arithmetic and string comparison; sending it to an LLM would make it slower,
 * costlier and less predictable.
 */

import { dedupeKey } from './merchant';
import type { DraftRow } from './types';
import type { ExpenseItem } from '../expense';

/** Amounts equal to the paisa/cent. */
const EPSILON = 0.005;

/** How far apart two dates may be and still be the same transaction. */
const DAY_WINDOW = 1;

interface Candidate {
  id: string;
  /** Absolute amount — direction is compared separately via the signed value. */
  amount: number;
  /** Days since the epoch, so a window comparison is integer subtraction. */
  day: number;
  key: string;
}

/** Local calendar day → day number. Parsed from parts; never through UTC. */
function dayNumber(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/**
 * Do two payee keys refer to the same place?
 *
 * Exact match, or one contained in the other — "swiggy" vs "swiggyinstamart"
 * is the same merchant as far as a duplicate check is concerned. Containment
 * requires four characters so that two-letter fragments cannot match everything.
 */
function sameMerchant(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.includes(a)) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  return false;
}

function candidateOf(id: string, amount: number, date: string, key: string): Candidate | null {
  const day = dayNumber(date);
  if (day === null || !Number.isFinite(amount)) return null;
  return { id, amount: Math.abs(amount), day, key };
}

function findMatch(target: Candidate, pool: readonly Candidate[]): string | null {
  for (const c of pool) {
    if (Math.abs(c.amount - target.amount) >= EPSILON) continue;
    if (Math.abs(c.day - target.day) > DAY_WINDOW) continue;
    if (!sameMerchant(c.key, target.key)) continue;
    return c.id;
  }
  return null;
}

/**
 * Flag drafts that match an existing transaction, or an earlier draft in the
 * same batch.
 *
 * Both checks matter and they answer different questions: `duplicateOf` means
 * "you already have this", `duplicateInBatch` means "this file lists it twice"
 * — which happens whenever a statement repeats a row across a page break, or
 * when a quarter and a month are imported together.
 *
 * Returns new draft objects; the input is untouched.
 */
export function markDuplicates(
  drafts: readonly DraftRow[],
  existing: readonly ExpenseItem[],
): DraftRow[] {
  const existingPool: Candidate[] = [];
  for (const item of existing) {
    const key = dedupeKey(item.merchant ?? '', item.note ?? '');
    const candidate = candidateOf(item.id, item.amount, item.date, key);
    if (candidate) existingPool.push(candidate);
  }

  const seen: Candidate[] = [];
  return drafts.map((draft) => {
    const key = dedupeKey(draft.merchant, draft.source.description);
    const candidate = candidateOf(draft.id, draft.amount, draft.date, key);
    if (!candidate) return { ...draft, duplicateOf: null, duplicateInBatch: null };

    const duplicateOf = findMatch(candidate, existingPool);
    const duplicateInBatch = findMatch(candidate, seen);
    seen.push(candidate);

    const isDuplicate = Boolean(duplicateOf || duplicateInBatch);
    return {
      ...draft,
      duplicateOf,
      duplicateInBatch,
      // A suspected duplicate starts unticked. The user opts it back in, which
      // is the safe direction to be wrong in.
      include: isDuplicate ? false : draft.include,
    };
  });
}
