/**
 * How current a reference actually is, evaluated now rather than when it was
 * written down.
 *
 * WHY A STORED STATUS IS NOT ENOUGH
 * ---------------------------------
 * Every record in this layer carries a `quality` decided on the day it was
 * researched. On that day the deposit caps were `VERIFIED_CURRENT`, and that
 * was true. A year later the same field still says `VERIFIED_CURRENT`, and the
 * product would still be showing a confident green badge over a figure nobody
 * has looked at since — which is precisely the failure a freshness system
 * exists to prevent. A status frozen at write time ages into a lie.
 *
 * So the stored state is an input, not an answer. `evaluateFreshness` combines
 * it with the record's own review date and the current date, and the answer can
 * only ever get *more* cautious:
 *
 *   VERIFIED_CURRENT + review date passed   → REVIEW_DUE
 *   REVIEW_DUE       + long overdue         → STALE
 *   STALE                                   → STALE, always
 *
 * It never promotes. Nothing here can decide that a value has become current
 * again; only a human re-checking the source can do that, and doing so updates
 * the record.
 *
 * WHAT DOES NOT GO STALE
 * ----------------------
 * `USER_SUPPLIED` and `ILLUSTRATIVE` are exempt, and the exemption is the point.
 * A figure the user typed cannot expire because no publisher owns it — telling
 * someone their own salary entry "may be out of date" is the product asserting
 * authority it does not have. A planning assumption is a choice, and a choice is
 * reviewed when circumstances change, which is not a date on a calendar.
 * `VERIFIED_STATIC` is exempt because arithmetic does not have a review cycle.
 */

import { ymdLocal } from '../lib/date';
import type { DataQualityState } from './types';

/**
 * How far past its review date a reference has to be before "nobody has checked
 * this lately" becomes "this probably no longer describes the world".
 *
 * A quarter. Long enough that a review slipping by a few weeks does not paint
 * warnings over a correct figure; short enough that a value cannot silently
 * survive a full budget cycle, a tax-year transition or two quarterly
 * regulatory reviews without anyone noticing.
 */
export const STALE_AFTER_DAYS = 90;

export interface FreshnessVerdict {
  /** The state as of `now`, never better than the stored one. */
  readonly state: DataQualityState;
  /** True when the stored state was escalated by the passage of time. */
  readonly escalated: boolean;
  /** Days past the review date. Zero or negative when not yet due. */
  readonly daysOverdue: number;
  /** Whether the UI should draw attention to the reference's currency. */
  readonly showsWarning: boolean;
  /** One sentence for a reader, or null when there is nothing to say. */
  readonly notice: string | null;
}

/** States whose currency is not the publisher's problem, so time cannot touch them. */
const TIMELESS: readonly DataQualityState[] = ['USER_SUPPLIED', 'ILLUSTRATIVE', 'VERIFIED_STATIC'];

/** Parse `YYYY-MM-DD` to a local midnight. Null on anything malformed. */
function parseDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
}

const DAY_MS = 86_400_000;

/**
 * Whole days between two local calendar dates.
 *
 * Built on local midnights rather than timestamps so a user east of UTC does not
 * see a value flip to overdue a day early — the same reason `ymdLocal` exists.
 */
function daysBetween(from: Date, to: Date): number {
  // Compare civil days; a daylight-saving transition makes local days 23/25h.
  const civil = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((civil(to) - civil(from)) / DAY_MS);
}

export interface FreshnessInput {
  readonly quality: DataQualityState;
  readonly reviewDue: string;
  readonly lastVerified: string;
}

/**
 * The state of a reference right now.
 *
 * `now` is injectable because a freshness system that cannot be tested at a
 * chosen date is a freshness system nobody can trust — and because pinning the
 * clock is how this repository keeps date-dependent suites from rotting.
 */
export function evaluateFreshness(input: FreshnessInput, now: Date = new Date()): FreshnessVerdict {
  const { quality, reviewDue } = input;

  if (TIMELESS.includes(quality)) {
    return { state: quality, escalated: false, daysOverdue: 0, showsWarning: false, notice: null };
  }

  // States that are already as cautious as this function can make them. Passing
  // them through the date arithmetic could only ever produce the same answer.
  if (quality === 'STALE' || quality === 'NO_AUTHORITATIVE_DEFAULT' || quality === 'REGION_SPECIFIC') {
    return {
      state: quality,
      escalated: false,
      daysOverdue: 0,
      showsWarning: quality === 'STALE',
      notice: quality === 'STALE' ? 'This reference may no longer describe current conditions.' : null,
    };
  }

  const due = parseDay(reviewDue);
  // A malformed review date is not licence to treat the value as fresh. Flag it
  // for review rather than silently trusting a record we cannot date.
  if (!due) {
    return {
      state: 'REVIEW_DUE',
      escalated: true,
      daysOverdue: 0,
      showsWarning: true,
      notice: 'This reference has no usable review date, so it is being treated as due for review.',
    };
  }

  const today = parseDay(ymdLocal(now)) ?? now;
  const daysOverdue = daysBetween(due, today);

  if (daysOverdue > STALE_AFTER_DAYS) {
    return {
      state: 'STALE',
      escalated: true,
      daysOverdue,
      showsWarning: true,
      notice: 'This reference is well past its review date and may no longer be current.',
    };
  }

  if (daysOverdue > 0) {
    return {
      state: 'REVIEW_DUE',
      escalated: quality !== 'REVIEW_DUE',
      daysOverdue,
      showsWarning: true,
      notice: 'This reference is due for review. It is shown as last checked.',
    };
  }

  return { state: quality, escalated: false, daysOverdue, showsWarning: quality === 'REVIEW_DUE', notice: quality === 'REVIEW_DUE' ? 'This reference is being reviewed.' : null };
}

/** `"2026-09-12"` → `"12 September 2026"`. Input back if malformed. */
export function verifiedLabel(iso: string): string {
  const d = parseDay(iso);
  if (!d) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
