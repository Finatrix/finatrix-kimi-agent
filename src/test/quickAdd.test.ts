import { describe, it, expect } from 'vitest';
import { parseQuickAdd } from '../tools/lib/quickAdd';

/** A Thursday, so weekday tests are unambiguous. */
const NOW = new Date(2026, 7, 13, 15, 0, 0); // 13 Aug 2026 is a Thursday
const KEYS = new Set([
  'eating_out', 'groceries', 'transport', 'rent', 'utilities', 'medical',
  'shopping', 'subscriptions', 'entertainment', 'travel', 'phone',
]);

const parse = (s: string, keys = KEYS) => parseQuickAdd(s, NOW, keys);

describe('quick add — amounts', () => {
  it('takes the first number as the amount', () => {
    const r = parse('340 lunch');
    expect(r.ok).toBe(true);
    expect(r.amount).toBe(340);
  });

  it('strips currency symbols and thousands separators', () => {
    expect(parse('₹1,250 rent').amount).toBe(1250);
    expect(parse('$45 coffee').amount).toBe(45);
  });

  it('understands a k suffix', () => {
    expect(parse('12k rent').amount).toBe(12000);
    expect(parse('1.5k shopping').amount).toBe(1500);
  });

  it('accepts arithmetic, matching the amount field', () => {
    expect(parse('120/4 dinner').amount).toBe(30);
  });

  it('keeps a negative amount, which is how a refund is recorded', () => {
    expect(parse('-250 refund').amount).toBe(-250);
  });

  it('is not ok without an amount, and keeps the text for the note', () => {
    const r = parse('lunch with the team');
    expect(r.ok).toBe(false);
    expect(r.note).toBe('lunch with the team');
  });

  it('parses any string without throwing', () => {
    for (const s of ['', '   ', '???', '340', 'yesterday', '#tag', '---', '1e9999']) {
      expect(() => parse(s)).not.toThrow();
    }
  });
});

describe('quick add — dates', () => {
  it('defaults to today', () => {
    expect(parse('340 lunch').date).toBe('2026-08-13');
  });

  it('understands yesterday', () => {
    expect(parse('340 lunch yesterday').date).toBe('2026-08-12');
  });

  it('understands "N days ago" and "N weeks ago"', () => {
    expect(parse('340 lunch 3 days ago').date).toBe('2026-08-10');
    expect(parse('340 lunch 2 weeks ago').date).toBe('2026-07-30');
  });

  it('resolves a weekday to its most recent occurrence', () => {
    // Monday before Thursday 13 Aug 2026 is the 10th.
    expect(parse('340 lunch monday').date).toBe('2026-08-10');
    // The current weekday means today, not a week ago.
    expect(parse('340 lunch thursday').date).toBe('2026-08-13');
  });

  it('accepts "last friday" as the weekday, consuming the qualifier', () => {
    const r = parse('340 dinner last friday');
    expect(r.date).toBe('2026-08-07');
    expect(r.note).not.toMatch(/last|friday/i);
  });

  it('accepts an explicit ISO date', () => {
    expect(parse('340 lunch 2026-07-04').date).toBe('2026-07-04');
  });

  /**
   * The date is a calendar day, not an instant. Built from local fields, it
   * must be the day the user means regardless of timezone — the failure this
   * codebase has hit before (see lib/date.ts).
   */
  it('produces a local calendar day, never a UTC shift', () => {
    const lateEvening = new Date(2026, 7, 13, 23, 50, 0);
    expect(parseQuickAdd('340 lunch', lateEvening, KEYS).date).toBe('2026-08-13');
  });
});

describe('quick add — category, payment and tags', () => {
  it('infers a category from a keyword', () => {
    expect(parse('340 lunch').category).toBe('eating_out');
    expect(parse('900 groceries').category).toBe('groceries');
    expect(parse('180 uber home').category).toBe('transport');
  });

  it('keeps the keyword in the note — it describes the spend too', () => {
    expect(parse('340 lunch').note).toBe('lunch');
  });

  it('never guesses a category the user does not have', () => {
    // Same input, empty category set: no guess rather than a dead key.
    expect(parseQuickAdd('340 lunch', NOW, new Set()).category).toBeUndefined();
    expect(parseQuickAdd('340 lunch', NOW, new Set(['rent'])).category).toBeUndefined();
  });

  it('recognises payment methods, including Indian UPI apps', () => {
    expect(parse('340 lunch upi').paymentMethod).toBe('UPI');
    expect(parse('340 lunch gpay').paymentMethod).toBe('UPI');
    expect(parse('340 lunch phonepe').paymentMethod).toBe('UPI');
    expect(parse('340 lunch cash').paymentMethod).toBe('Cash');
    expect(parse('340 lunch credit').paymentMethod).toBe('Credit card');
  });

  it('leaves an ambiguous payment word alone rather than guessing', () => {
    // "card" could be credit or debit; guessing would put a wrong method on
    // the record with no signal that it was a guess.
    expect(parse('340 lunch card').paymentMethod).toBeUndefined();
  });

  it('collects #hashtags as tags and keeps them out of the note', () => {
    const r = parse('340 lunch #work #reimbursable');
    expect(r.tags).toEqual(['work', 'reimbursable']);
    expect(r.note).toBe('lunch');
  });

  it('parses a full line end to end', () => {
    const r = parse('₹1,250 dinner with team yesterday upi #work');
    expect(r).toMatchObject({
      ok: true,
      amount: 1250,
      category: 'eating_out',
      date: '2026-08-12',
      paymentMethod: 'UPI',
      tags: ['work'],
    });
    expect(r.note).toBe('dinner with team');
  });

  it('never silently drops words it did not understand', () => {
    const r = parse('340 mystery artisanal thing');
    expect(r.note).toBe('mystery artisanal thing');
  });
});
