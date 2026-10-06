import { describe, expect, it } from 'vitest';
import { dateOnLine, maskedLines, parseLooseList, rowsFromLayout } from '../tools/lib/import/looseList';
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
  it('still reads a real statement as a statement', async () => {
    const doc = await readRecognisedText('14/08/2026  UPI/SWIGGY      450.00     12,340.50', now);
    expect(doc.rows).toHaveLength(1);
    expect(doc.rows[0]).toMatchObject({ date: '2026-08-14', amount: 450, balance: 12340.5 });
  });
  it('falls back to the payment-list reader when no row starts with a date', async () => {
    expect((await readRecognisedText(PHONEPE, now)).rows).toHaveLength(4);
  });
});

/** What the recogniser actually returned for two dark-mode card-app screenshots. */
const AMEX_ONE = `8:12 = al! = KB)
American Express® Platinum Edge Cre...
cml H ++++31003 2 Q
WOOLWORTHS $0.19
3304 MELBOURNE ,
4 Oct
WOOLWORTHS
3304 MELBOURNE $6.00
2 Oct
ANTHROPIC SAN FRANCISCO $11.00
Plan It® Instalments
Pay off purchases over 3, 6 or 12 i)
months. Fixed monthly fee and T&Cs
apply.
Create a Plan
1 Oct
ANTHROPIC SAN FRANCISCO $11.00
7 @) J, dX
Home Membership Offers Account`;

const AMEX_TWO = `8:13 am wil > &
American Spee Se eeu Edge Cre... Ol
5 Oct

GUZMAN Y GOMEZ FRANCH 3 $3.70
SURRY HILLS .
KLINGAI.COM SINGAPORE $16.12`;

describe('a card app with date headings and wrapped names', () => {
  it('dates each row from the heading above it and joins a name split over two lines', () => {
    expect(parseLooseList(AMEX_ONE, now).rows.map((r) => [r.date, r.description, r.amount])).toEqual([
      [null, 'WOOLWORTHS 3304 MELBOURNE', 0.19],
      ['2026-10-04', 'WOOLWORTHS 3304 MELBOURNE', 6],
      ['2026-10-02', 'ANTHROPIC SAN FRANCISCO', 11],
      ['2026-10-01', 'ANTHROPIC SAN FRANCISCO', 11],
    ]);
  });

  it('does not glue a promotion or the previous row onto a name', () => {
    expect(parseLooseList(AMEX_TWO, now).rows.map((r) => [r.date, r.description, r.amount])).toEqual([
      ['2026-10-05', 'GUZMAN Y GOMEZ FRANCH 3 SURRY HILLS', 3.7],
      ['2026-10-05', 'KLINGAI.COM SINGAPORE', 16.12],
    ]);
  });
});

describe('the assisted layout route', () => {
  it('hides every digit in what is sent', () => {
    const sent = maskedLines(AMEX_ONE);
    expect(sent.join('\n')).not.toMatch(/\d/);
    expect(sent[3]).toBe('WOOLWORTHS $#.##');
    expect(sent[5]).toBe('# Oct');
  });

  it('reads figures from the chosen lines, never from the reader', () => {
    const doc = rowsFromLayout(AMEX_ONE, [
      { amount: 3, name: [3, 4], date: null, direction: 'debit' },
      { amount: 7, name: [6, 7], date: 5, direction: null },
    ], now);
    expect(doc.rows.map((r) => [r.date, r.description, r.amount, r.direction])).toEqual([
      [null, 'WOOLWORTHS 3304 MELBOURNE', 0.19, 'debit'],
      ['2026-10-04', 'WOOLWORTHS 3304 MELBOURNE', 6, null],
    ]);
  });

  it('drops anything that does not point at a real amount line, and never repeats one', () => {
    const doc = rowsFromLayout(AMEX_ONE, [
      { amount: 10, name: [10], date: null, direction: null },
      { amount: 999, name: [], date: null, direction: null },
      { amount: 9, name: [9, 14], date: 8, direction: 'credit' },
      { amount: 9, name: [9], date: 8, direction: null },
    ], now);
    expect(doc.rows).toHaveLength(1);
    expect(doc.rows[0]).toMatchObject({ description: 'ANTHROPIC SAN FRANCISCO', amount: 11, date: '2026-10-02', direction: 'credit' });
  });
});

describe('readRecognisedText with a layout reader', () => {
  it('sends only digit-masked lines and uses the answer when it finds as many rows', async () => {
    const seen: string[] = [];
    const doc = await readRecognisedText(AMEX_TWO, now, async (lines) => {
      seen.push(...lines);
      return [
        { amount: 4, name: [4, 5], date: 2, direction: 'debit' },
        { amount: 6, name: [6], date: 2, direction: 'debit' },
      ];
    });
    expect(seen.join('\n')).not.toMatch(/\d/);
    expect(doc.rows.map((r) => [r.date, r.description, r.amount, r.direction])).toEqual([
      ['2026-10-05', 'GUZMAN Y GOMEZ FRANCH 3 SURRY HILLS', 3.7, 'debit'],
      ['2026-10-05', 'KLINGAI.COM SINGAPORE', 16.12, 'debit'],
    ]);
  });

  it('keeps the on-device reading when the reader is unavailable, fails or finds less', async () => {
    expect((await readRecognisedText(AMEX_ONE, now, async () => null)).rows).toHaveLength(4);
    expect((await readRecognisedText(AMEX_ONE, now, async () => { throw new Error('offline'); })).rows).toHaveLength(4);
    expect((await readRecognisedText(AMEX_ONE, now, async () => [{ amount: 3, name: [3], date: null, direction: null }])).rows).toHaveLength(4);
  });
});

describe('the same text after the import sanitiser', () => {
  it('still yields every row', async () => {
    const { sanitizeText } = await import('../lib/sanitize');
    expect((await readRecognisedText(sanitizeText(AMEX_ONE), now)).rows).toHaveLength(4);
    expect((await readRecognisedText(sanitizeText(AMEX_TWO), now)).rows).toHaveLength(2);
    expect((await readRecognisedText(sanitizeText(PHONEPE), now)).rows).toHaveLength(4);
  });
});
