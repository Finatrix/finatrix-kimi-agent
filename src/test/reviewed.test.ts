/**
 * The site-wide "assumptions reviewed" date has to keep describing the packs.
 *
 * `ASSUMPTIONS_REVIEWED` is a constant rather than a computation so the landing
 * footer does not drag four market packs into the critical path for seven
 * characters (see the note in `shared/reviewed.ts`). The cost of that choice is
 * that it can go stale silently, and a stale date here is not a cosmetic bug —
 * it is the site claiming its numbers were checked more recently than they were,
 * in the one place it makes that claim to every visitor.
 *
 * So: this asserts the constant equals the oldest `asOf` across every pack.
 * Reviewing a market and forgetting the footer fails the build.
 */

import { describe, it, expect } from 'vitest';
import { ASSUMPTIONS_REVIEWED, reviewedLabel } from '../shared/reviewed';
import { MARKET_LIST } from '../tools/lib/markets';

describe('assumptions review date', () => {
  const dates = MARKET_LIST.map((m) => m.asOf);

  it('reads every market pack', () => {
    // A regex or import that quietly found nothing would make the assertion
    // below pass against an empty list.
    expect(dates.length).toBe(4);
  });

  it('every pack states a YYYY-MM review month', () => {
    for (const m of MARKET_LIST) {
      expect(m.asOf, `${m.id} has a malformed asOf`).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    }
  });

  it('is the OLDEST pack date, so it is true of everything a visitor can read', () => {
    // Lexicographic works on zero-padded YYYY-MM and needs no date parsing.
    const oldest = [...dates].sort()[0];
    expect(ASSUMPTIONS_REVIEWED).toBe(oldest);
  });

  it('never claims a review that has not happened', () => {
    const newest = [...dates].sort().at(-1)!;
    expect(ASSUMPTIONS_REVIEWED <= newest).toBe(true);
  });

  it('formats as a month and year a reader can act on', () => {
    expect(reviewedLabel('2026-06')).toBe('June 2026');
    expect(reviewedLabel('2025-01')).toBe('January 2025');
  });

  it('passes a malformed value through rather than inventing a date', () => {
    expect(reviewedLabel('')).toBe('');
    expect(reviewedLabel('soon')).toBe('soon');
    expect(reviewedLabel('2026')).toBe('2026');
  });
});
