import { describe, it, expect, beforeEach } from 'vitest';
import {
  defaultFyStart, fyAllMonths, fyEndMonthOf, fyLabel, fyMonthsThrough, fyRangeLabel,
  fyStartMonthOf, loadFyChoice, loadFyStart, saveFyStart,
} from '../tools/lib/fiscalYear';

/**
 * The financial year is a fact about where the user lives, and every Wallet
 * figure is scoped by it — an answer that is wrong by three months silently
 * changes every balance on the panel. These are the cases that actually differ
 * between jurisdictions, plus the two that a general implementation usually
 * gets wrong: a January-start year (no special case allowed) and a month that
 * falls before the start month (belongs to the year that began last calendar
 * year).
 */
describe('fiscal year boundaries', () => {
  it('India (April start)', () => {
    expect(fyStartMonthOf('2026-08', 4)).toBe('2026-04');
    expect(fyStartMonthOf('2026-04', 4)).toBe('2026-04'); // the first month itself
    expect(fyStartMonthOf('2026-03', 4)).toBe('2025-04'); // before the start → previous year
    expect(fyEndMonthOf('2026-08', 4)).toBe('2027-03');
    expect(fyLabel('2026-08', 4)).toBe('FY 2026–27');
  });

  it('Australia (July start)', () => {
    expect(fyStartMonthOf('2026-08', 7)).toBe('2026-07');
    expect(fyStartMonthOf('2026-06', 7)).toBe('2025-07');
    expect(fyEndMonthOf('2026-08', 7)).toBe('2027-06');
    expect(fyLabel('2026-08', 7)).toBe('FY 2026–27');
  });

  it('a January start is the calendar year, with no special case', () => {
    expect(fyStartMonthOf('2026-08', 1)).toBe('2026-01');
    expect(fyStartMonthOf('2026-01', 1)).toBe('2026-01');
    expect(fyEndMonthOf('2026-08', 1)).toBe('2026-12');
    // Named as a plain year: "FY 2026–27" would be wrong for a calendar year.
    expect(fyLabel('2026-08', 1)).toBe('2026');
  });

  it('a December-start year straddles the new year correctly', () => {
    expect(fyStartMonthOf('2026-01', 12)).toBe('2025-12');
    expect(fyEndMonthOf('2026-01', 12)).toBe('2026-11');
  });
});

describe('the months a year covers', () => {
  it('runs from the year start up to and including the month asked for', () => {
    // "Up to and including" is the whole point: counting months that have not
    // happened would report a surplus made of budgets nobody could spend yet.
    expect(fyMonthsThrough('2026-07', 4)).toEqual([
      '2026-04', '2026-05', '2026-06', '2026-07',
    ]);
  });

  it('is a single month when the year has only just started', () => {
    expect(fyMonthsThrough('2026-04', 4)).toEqual(['2026-04']);
  });

  it('reaches back across the calendar boundary', () => {
    expect(fyMonthsThrough('2026-02', 4)).toEqual([
      '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09',
      '2025-10', '2025-11', '2025-12', '2026-01', '2026-02',
    ]);
  });

  it('lists exactly twelve months for the whole year', () => {
    const all = fyAllMonths('2026-09', 4);
    expect(all).toHaveLength(12);
    expect(all[0]).toBe('2026-04');
    expect(all[11]).toBe('2027-03');
  });

  it('never loops forever on a malformed month', () => {
    expect(fyMonthsThrough('not-a-month', 4)).toEqual([]);
    expect(fyAllMonths('2026-13', 4)).toEqual([]);
  });
});

describe('defaults and persistence', () => {
  beforeEach(() => localStorage.clear());

  it('derives a sensible default from the display currency', () => {
    expect(defaultFyStart('INR')).toBe(4);
    expect(defaultFyStart('AUD')).toBe(7);
    expect(defaultFyStart('USD')).toBe(1);
    // An unknown currency is January rather than an error.
    expect(defaultFyStart('XYZ')).toBe(1);
  });

  it('reports no choice until the user makes one', () => {
    expect(loadFyChoice()).toBeNull();
    // …but the effective month is still meaningful.
    expect(loadFyStart('AUD')).toBe(7);
  });

  it('lets an explicit choice beat the currency default', () => {
    saveFyStart(1);
    expect(loadFyChoice()).toBe(1);
    expect(loadFyStart('INR')).toBe(1);
  });

  it('refuses a stored value outside 1–12 rather than trusting it', () => {
    localStorage.setItem('fx_fy_start', '99');
    expect(loadFyChoice()).toBeNull();
    expect(loadFyStart('INR')).toBe(4);
  });
});

describe('how the year reads on screen', () => {
  it('names the span the label stands for', () => {
    expect(fyRangeLabel('2026-08', 4)).toBe('April 2026 – March 2027');
  });
});
