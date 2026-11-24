import { describe, expect, it } from 'vitest';
import { parseReceipt, receiptStatement } from '../tools/lib/import/receipt';

const NOW = new Date(2026, 10, 24, 12, 0, 0);

const SUPERMARKET = `
TAX INVOICE
SRI LAKSHMI SUPERMARKET
12, 4th Cross, Jayanagar, Bengaluru 560011
Ph: 080-2654 1122
GSTIN: 29ABCDE1234F1Z5
Bill No: 4417   Date: 14/08/26  Time: 18:22
Item              Qty   Rate    Amt
Toor Dal 1kg       1   165.00  165.00
Amul Butter 500g   2   285.00  570.00
Sub Total                      735.00
CGST 2.5%                       18.38
SGST 2.5%                       18.38
Round Off                        0.24
Total Qty: 3
Grand Total                   772.00
Cash Tendered                 1000.00
Change                         228.00
You Saved Rs. 35.00
Thank you, visit again
`;

describe('parseReceipt', () => {
  it('reads the shop, the day-first date and the grand total, not the subtotal or the cash given', () => {
    expect(parseReceipt(SUPERMARKET, NOW)).toEqual({
      amount: 772,
      merchant: 'SRI LAKSHMI SUPERMARKET',
      date: '2026-08-14',
    });
  });

  it('takes a total whose figure the reader put on the next line', () => {
    const text = 'Cafe Coffee Day\n14-Aug-2026\nLatte 180.00\nNet Amount Payable\n₹ 1,189.50\n';
    expect(parseReceipt(text, NOW)).toEqual({ amount: 1189.5, merchant: 'Cafe Coffee Day', date: '2026-08-14' });
  });

  it('reads Rs. and /- amounts and a written month', () => {
    const text = 'Hotel Saravana Bhavan\nDate 3 Nov 2026\nTOTAL Rs.640/-\n';
    expect(parseReceipt(text, NOW)).toEqual({ amount: 640, merchant: 'Hotel Saravana Bhavan', date: '2026-11-03' });
  });

  it('leaves the amount empty when no line says what was paid, instead of guessing', () => {
    const text = 'Some Shop\nMilk 56.00\nBread 45.00\nGSTIN 29ABCDE1234F1Z5\n';
    expect(parseReceipt(text, NOW).amount).toBeNull();
  });

  it('drops a date after today as a misread', () => {
    expect(parseReceipt('Shop Name\n01/12/2026\nTotal 10.00', NOW).date).toBeNull();
  });

  it('prefers a grand total over a plain total line', () => {
    const text = 'Big Bazaar\nTotal 500.00\nGrand Total 525.00\n';
    expect(parseReceipt(text, NOW).amount).toBe(525);
  });

  it('finds nothing in text that is not a bill', () => {
    expect(parseReceipt('', NOW)).toEqual({ amount: null, merchant: null, date: null });
  });
});

describe('receiptStatement', () => {
  it('is one money-out row read by recognition, so review holds it', () => {
    const doc = receiptStatement(SUPERMARKET, NOW);
    expect(doc.source).toBe('ocr');
    expect(doc.rows).toHaveLength(1);
    expect(doc.rows[0]).toMatchObject({
      amount: 772, direction: 'debit', date: '2026-08-14', description: 'SRI LAKSHMI SUPERMARKET',
    });
  });

  it('offers no row without a total', () => {
    expect(receiptStatement('Some Shop\nMilk 56.00', NOW).rows).toHaveLength(0);
  });
});
