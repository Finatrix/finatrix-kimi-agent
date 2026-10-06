import { describe, expect, it } from 'vitest';
import { dateOnLine, parseLooseList } from '../tools/lib/import/looseList';
import { readRecognisedText } from '../tools/lib/import/extract';

const now = new Date(2026, 9, 6, 22, 0, 0);

/** The shape PhonePe's history takes once recognised: label, payee + amount, when. */
const PHONEPE = `10:17
History
Paid to
SWIGGY ₹450
2 days ago Debited from 1234
Received from
RAHUL KUMAR ₹1,200
03 Oct 2026 Credited to 1234
Paid to ₹99
Jio Prepaid
Yesterday Debited from 1234
Mobile recharged
AIRTEL ₹299.00
28 Sep`;

describe('parseLooseList', () => {
  const doc = parseLooseList(PHONEPE, now);

  it('reads every line that ends in an amount, with its payee', () => {
    expect(doc.rows.map((r) => [r.description, r.amount])).toEqual([
      ['SWIGGY', 450], ['RAHUL KUMAR', 1200], ['Jio Prepaid', 99], ['AIRTEL', 299],
    ]);
  });

  it('takes the direction from the label, so money received is not a spend', () => {
    expect(doc.rows.map((r) => r.direction)).toEqual(['debit', 'credit', 'debit', null]);
  });

  it('keeps a printed date and leaves a relative one blank for the person to fill in', () => {
    expect(doc.rows.map((r) => r.date)).toEqual([null, '2026-10-03', null, '2026-09-28']);
  });

  it('marks everything as recognised text so the review sheet holds it back', () => {
    expect(doc.source).toBe('ocr');
    expect(doc.currency).toBe('INR');
  });

  it('never treats a bare number as money', () => {
    expect(parseLooseList('Order 48213\nRoom 204\nCall 9876543210', now).rows).toEqual([]);
  });

  it('reads a signed amount and a payee on the line above it', () => {
    const rows = parseLooseList('Blue Bottle Coffee\n- $6.50\nSalary\n+ $2,400.00', now).rows;
    expect(rows.map((r) => [r.description, r.amount, r.direction])).toEqual([
      ['Blue Bottle Coffee', 6.5, 'debit'], ['Salary', 2400, 'credit'],
    ]);
  });
});

describe('dateOnLine', () => {
  it('reads a date with no year as its latest occurrence, never the future', () => {
    expect(dateOnLine('28 Sep', now)).toBe('2026-09-28');
    expect(dateOnLine('Dec 25', now)).toBe('2025-12-25');
  });
  it('declines relative dates', () => {
    expect(dateOnLine('2 days ago', now)).toBeNull();
    expect(dateOnLine('Yesterday', now)).toBeNull();
  });
  it('uses a date printed beside a relative word', () => {
    expect(dateOnLine('Today, 3 Oct', now)).toBe('2026-10-03');
  });
});

describe('readRecognisedText', () => {
  it('still reads a real statement as a statement', () => {
    const doc = readRecognisedText('14/08/2026  UPI/SWIGGY      450.00     12,340.50', now);
    expect(doc.rows).toHaveLength(1);
    expect(doc.rows[0]).toMatchObject({ date: '2026-08-14', amount: 450, balance: 12340.5 });
  });
  it('falls back to the payment-list reader when no row starts with a date', () => {
    expect(readRecognisedText(PHONEPE, now).rows).toHaveLength(4);
  });
});
