/**
 * Calendar keys, read in the viewer's own timezone.
 *
 * FinatriX stores dates as bare calendar strings — `2026-08-05`, `2026-08` —
 * because that is what they are. A transaction happened on a day; a budget
 * covers a month. Neither is an instant, and treating either as one is how a
 * date silently moves.
 *
 * The move is not hypothetical. `new Date(...).toISOString().slice(0, 10)` is
 * the obvious way to write these and it is wrong everywhere east of UTC: it
 * converts to UTC first, and local midnight in IST — FinatriX's primary market —
 * is still the previous day there. The Careers calendar shipped that form and
 * keyed every cell one day behind the number printed inside it.
 *
 * These two helpers read the local fields directly, so the key always names the
 * day the user is looking at. This file existed as thirteen separate copies of
 * the same two expressions before it was a file; a rule this easy to get subtly
 * wrong should be written down once.
 */

/** Local `YYYY-MM-DD` — the calendar day this Date falls on where the user is. */
export function ymdLocal(d: Date): string {
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

/** Local `YYYY-MM` — the calendar month this Date falls in where the user is. */
export function ymLocal(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
