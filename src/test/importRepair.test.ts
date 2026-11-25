/**
 * Regression tests for the statement-import repair (Nov 2026).
 *
 * Each block pins a defect that reached users through a path the earlier suites
 * did not exercise: whole files through `extractStatement` rather than hand-built
 * rows, at sizes and in shapes real bank exports actually have.
 */
import { describe, it, expect } from 'vitest';
import { extractStatement, ImportError } from '../tools/lib/import/extract';
import { MAX_STATEMENT_ROWS, inferColumns, parseCsvStatement } from '../tools/lib/import/csv';
import { parseTextStatement } from '../tools/lib/import/statement';
import { balanceKindOf, isNewestFirst, reconcile, resolveDirections } from '../tools/lib/import/reconcile';
import { markDuplicates } from '../tools/lib/import/dedupe';
import { flipDirection } from '../tools/lib/import/draft';
import { parseBalance } from '../tools/lib/import/fields';
import type { DraftRow, StatementDoc, StatementRow } from '../tools/lib/import/types';
import type { ExpenseItem } from '../tools/lib/expense';

const NOW = new Date(2026, 10, 12);

/**
 * A text file as a browser would hand it over.
 *
 * jsdom's `File` has no `text()`, which is why nothing delimited was ever read
 * through `extractStatement` in a test — and how a cut that only happens there
 * went unnoticed. The method is supplied here rather than stubbed out in the
 * code under test.
 */
function csvFile(text: string, name = 'statement.csv', type = 'text/csv'): File {
  const file = new File([text], name, { type });
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', { value: async () => text });
  }
  return file;
}

const read = (file: File) => extractStatement(file, { now: NOW });

/** `dd/mm/yyyy` for the i-th day after 1 Sep 2025. */
function dayLabel(offset: number): string {
  const d = new Date(2025, 8, 1 + offset);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** A long, internally consistent statement: every row a debit, balance stepping down. */
function longStatement(rows: number, opening = 50_000_000): string {
  const lines = ['Date,Description,Debit,Credit,Balance'];
  let balance = opening;
  for (let i = 0; i < rows; i++) {
    const amount = 100 + ((i * 37) % 4000) + (i % 100) / 100;
    balance -= amount;
    lines.push(`${dayLabel(Math.floor(i / 12))},MERCHANT ${1000 + i},${amount.toFixed(2)},,${balance.toFixed(2)}`);
  }
  return lines.join('\n');
}

describe('a long statement is read whole, or refused — never cut short', () => {
  it('reads every row of a file far past the old 200,000-character cut', async () => {
    const text = longStatement(5000);
    // The file the defect was found with: well over the old limit.
    expect(text.length).toBeGreaterThan(200_000);

    const { doc, reconciliation } = await read(csvFile(text));

    expect(doc.rows).toHaveLength(5000);
    // The last line used to be the one the cut landed in.
    const last = doc.rows[doc.rows.length - 1];
    expect(last.description).toBe('MERCHANT 5999');
    expect(last.direction).toBe('debit');
    expect(last.amount).toBeCloseTo(100 + ((4999 * 37) % 4000) + 0.99, 2);
    expect(reconciliation.ok).toBe(true);
  });

  it('refuses a statement over the row ceiling by name instead of reading part of it', async () => {
    const lines = ['Date,Description,Amount'];
    for (let i = 0; i < MAX_STATEMENT_ROWS + 200; i++) lines.push(`01/11/2026,SHOP ${i},10.00`);

    await expect(read(csvFile(lines.join('\n')))).rejects.toMatchObject({
      name: 'ImportError',
      message: expect.stringMatching(/more than 20,000 rows/),
    });
  });
});

describe('an overdrawn balance keeps its sign', () => {
  it('reads -150.00, 150.00 Dr and (150.00) as the same overdrawn figure', () => {
    expect(parseBalance('-150.00')).toBe(-150);
    expect(parseBalance('150.00 Dr')).toBe(-150);
    expect(parseBalance('(150.00)')).toBe(-150);
    expect(parseBalance('150.00 Cr')).toBe(150);
    expect(parseBalance('9,550.00')).toBe(9550);
    expect(parseBalance('0.00 Dr')).toBe(0);
    expect(parseBalance('')).toBeNull();
  });

  it('keeps spending as spending while the account is below zero', async () => {
    const { doc, reconciliation } = await read(csvFile([
      'Date,Description,Debit,Credit,Balance',
      '01/11/2026,SWIGGY,100.00,,50.00',
      '02/11/2026,UBER,200.00,,-150.00',
      '03/11/2026,ZOMATO,300.00,,-450.00',
      '04/11/2026,SALARY NOV,,1000.00,550.00',
    ].join('\n')));

    // ZOMATO took the balance from -150 to -450. Read unsigned (150 → 450) that
    // step was "proved" to be money coming in.
    expect(doc.rows.map((r) => r.direction)).toEqual(['debit', 'debit', 'debit', 'credit']);
    expect(doc.rows.map((r) => r.balance)).toEqual([50, -150, -450, 550]);
    expect(reconciliation.ok).toBe(true);
    expect(reconciliation.breaks).toBe(0);
  });

  it('does the same for the Dr/Cr balance markers Indian statements print', async () => {
    const { doc, reconciliation } = await read(csvFile([
      'Date,Description,Debit,Credit,Balance',
      '01/11/2026,SWIGGY,100.00,,50.00 Cr',
      '02/11/2026,UBER,200.00,,150.00 Dr',
      '03/11/2026,ZOMATO,300.00,,450.00 Dr',
      '04/11/2026,SALARY NOV,,1000.00,550.00 Cr',
    ].join('\n')));

    expect(doc.rows.map((r) => r.direction)).toEqual(['debit', 'debit', 'debit', 'credit']);
    expect(reconciliation.ok).toBe(true);
  });

  it('keeps the sign in a PDF text layer too', () => {
    const doc = parseTextStatement([
      '01/11/2026 SWIGGY ORDER 100.00 50.00',
      '02/11/2026 UBER TRIP 200.00 -150.00',
      '03/11/2026 ZOMATO ORDER 300.00 -450.00',
    ].join('\n'), NOW);

    expect(doc.rows.map((r) => r.balance)).toEqual([50, -150, -450]);
    const { rows } = resolveDirections(doc);
    expect(rows.map((r) => r.direction)).toEqual(['debit', 'debit', 'debit']);
  });
});

describe('a balance that counts money owed', () => {
  const CARD = [
    'Date,Description,Debit,Credit,Balance',
    '01/11/2026,SWIGGY,100.00,,1100.00',
    '02/11/2026,UBER,200.00,,1300.00',
    '03/11/2026,AMAZON,400.00,,1700.00',
    '04/11/2026,REFUND AMAZON,,500.00,1200.00',
  ].join('\n');

  it('does not turn every card purchase into money coming in', async () => {
    const { doc, reconciliation, directionsProved } = await read(csvFile(CARD));

    // The bank's own Debit and Credit columns say which is which, and a balance
    // that rises with each debit is an amount owed. Read as a bank balance, the
    // purchases became credits, the refund became spending, and it "reconciled".
    expect(doc.balanceKind).toBe('owed');
    expect(doc.rows.map((r) => r.direction)).toEqual(['debit', 'debit', 'debit', 'credit']);
    expect(directionsProved).toBe(3);
    expect(reconciliation.checked).toBe(true);
    expect(reconciliation.ok).toBe(true);
    expect(reconciliation.breaks).toBe(0);
  });

  it('still catches a missing row on an owed balance', async () => {
    const withGap = CARD.split('\n').filter((line) => !line.includes('UBER')).join('\n');
    const { reconciliation } = await read(csvFile(withGap));
    expect(reconciliation.checked).toBe(true);
    expect(reconciliation.ok).toBe(false);
    expect(reconciliation.breaks).toBeGreaterThan(0);
  });

  it('leaves an ordinary bank statement as money held', async () => {
    const { doc } = await read(csvFile([
      'Date,Description,Debit,Credit,Balance',
      '01/11/2026,SWIGGY,100.00,,900.00',
      '02/11/2026,UBER,200.00,,700.00',
      '03/11/2026,SALARY NOV,,5000.00,5700.00',
    ].join('\n')));
    expect(doc.balanceKind).toBe('funds');
    expect(doc.rows.map((r) => r.direction)).toEqual(['debit', 'debit', 'credit']);
  });

  const row = (over: Partial<StatementRow>): StatementRow => ({
    line: 1, date: '2026-11-01', postedDate: null, description: 'POS SHOP', amount: 100,
    direction: null, balance: null, reference: null, currency: null, ...over,
  });
  const docOf = (rows: StatementRow[], openingBalance: number | null = null): StatementDoc => ({
    source: 'pdf-text', rows, currency: null, openingBalance, closingBalance: null,
    skipped: 0, dateOrder: 'dmy', dateOrderAssumed: false,
  });

  it('is not flipped by one stray marker among rows the balance can prove', () => {
    // A scanned statement where one Dr/Cr marker was attached to the wrong
    // amount. The other rows have no stated direction and step a bank balance
    // down; one contradiction must not turn the whole statement round.
    const doc = docOf([
      row({ amount: 100, balance: 900 }),
      row({ amount: 200, balance: 700, direction: 'credit', directionStated: true }),
      row({ amount: 300, balance: 400 }),
      row({ amount: 50, balance: 350 }),
    ], 1000);

    expect(balanceKindOf(doc)).toBe('funds');
    expect(resolveDirections(doc).rows.map((r) => r.direction)).toEqual(['debit', 'debit', 'debit', 'debit']);
  });

  it('gives a bare minus sign no say in what the balance counts', () => {
    // Some exports print spending as negative, others as positive. A sign that
    // disagrees with the balance step is a convention, not evidence.
    const doc = docOf([
      row({ amount: 100, balance: 1100, direction: 'debit' }),
      row({ amount: 200, balance: 1300, direction: 'debit' }),
      row({ amount: 300, balance: 1600, direction: 'debit' }),
    ], 1000);

    expect(balanceKindOf(doc)).toBe('funds');
    // And the balance, which cannot be misread, settles each row.
    expect(resolveDirections(doc).rows.map((r) => r.direction)).toEqual(['credit', 'credit', 'credit']);
  });
});

describe('a statement listed newest-first', () => {
  // Opening 10,000. In date order: -450, -100, -100, +5,000, -200.
  const NEWEST_FIRST = [
    'Date,Description,Debit,Credit,Balance',
    '05/11/2026,UBER,200.00,,14150.00',
    '04/11/2026,SALARY NOV,,5000.00,14350.00',
    '03/11/2026,CHAI POINT,100.00,,9350.00',
    '02/11/2026,CHAI POINT,100.00,,9450.00',
    '01/11/2026,SWIGGY,450.00,,9550.00',
  ].join('\n');

  it('walks the balances from the bottom up, so it reconciles', async () => {
    const { doc, reconciliation, directionsProved } = await read(csvFile(NEWEST_FIRST));

    expect(doc.newestFirst).toBe(true);
    expect(doc.balanceKind).toBe('funds');
    // File order is preserved for the review sheet.
    expect(doc.rows.map((r) => r.description)).toEqual(['UBER', 'SALARY NOV', 'CHAI POINT', 'CHAI POINT', 'SWIGGY']);
    expect(doc.rows.map((r) => r.direction)).toEqual(['debit', 'credit', 'debit', 'debit', 'debit']);
    // Every row but the oldest has a row before it to step from.
    expect(directionsProved).toBe(4);
    expect(reconciliation.ok).toBe(true);
    expect(reconciliation.breaks).toBe(0);
  });

  it('does not "prove" a repeated amount to be the opposite direction', () => {
    // Single unsigned amount column: nothing but the balance says which way
    // each row went. Walked top-down, the second 100 sat on a balance 100
    // HIGHER than the line above it and was read as money coming in.
    const doc = parseCsvStatement([
      'Date,Description,Amount,Balance',
      '03/11/2026,CHAI POINT,100.00,9350.00',
      '02/11/2026,CHAI POINT,100.00,9450.00',
      '01/11/2026,SWIGGY,450.00,9550.00',
    ].join('\n'), NOW);

    expect(isNewestFirst(doc)).toBe(true);
    const { rows } = resolveDirections(doc);
    expect(rows[0].direction).toBe('debit');
    expect(rows[1].direction).toBe('debit');
  });

  it('reads an oldest-first statement exactly as before', async () => {
    const oldestFirst = [NEWEST_FIRST.split('\n')[0], ...NEWEST_FIRST.split('\n').slice(1).reverse()].join('\n');
    const { doc, reconciliation } = await read(csvFile(oldestFirst));
    expect(doc.newestFirst).toBe(false);
    expect(doc.rows.map((r) => r.direction)).toEqual(['debit', 'debit', 'debit', 'credit', 'debit']);
    expect(reconciliation.ok).toBe(true);
  });

  it('reconcile honours the order it is told about', () => {
    const doc = parseCsvStatement(NEWEST_FIRST, NOW);
    const settled = resolveDirections(doc);
    const asListed = reconcile({ ...doc, rows: settled.rows, newestFirst: false }, settled.rows);
    const inOrder = reconcile({ ...doc, rows: settled.rows, newestFirst: true }, settled.rows);
    expect(asListed.ok).toBe(false);
    expect(inOrder.ok).toBe(true);
  });
});

describe('what a file is, when its name does not say', () => {
  const BODY = 'Date,Description,Amount\n03/11/2026,SWIGGY BANGALORE,450.00';

  it('reads a CSV that arrives with a type and no extension', async () => {
    const { doc } = await read(csvFile(BODY, 'statement', 'text/csv'));
    expect(doc.rows).toHaveLength(1);
    expect(doc.rows[0].amount).toBe(450);
  });

  it('reads one named by a content id, as a phone share sheet produces', async () => {
    const { doc } = await read(csvFile(BODY, 'document:1000012345', 'text/comma-separated-values'));
    expect(doc.rows).toHaveLength(1);
  });

  it('still refuses a file that is neither named nor typed as a statement', async () => {
    await expect(read(csvFile(BODY, 'notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')))
      .rejects.toMatchObject({ kind: 'unsupported' });
    await expect(read(csvFile(BODY, 'statement', ''))).rejects.toMatchObject({ kind: 'unsupported' });
  });
});

describe('a file named .xls', () => {
  it('reads a tab-separated export wearing the .xls name', async () => {
    const { doc } = await read(csvFile(
      'Txn Date\tDescription\tDebit\tCredit\tBalance\n03/11/2026\tUPI SWIGGY\t450.00\t\t9550.00\n05/11/2026\tUPI UBER\t220.50\t\t9329.50',
      'sbi-statement.xls',
      'application/vnd.ms-excel',
    ));
    expect(doc.rows).toHaveLength(2);
    expect(doc.rows[1].amount).toBe(220.5);
    expect(doc.rows[1].balance).toBe(9329.5);
  });

  it('reads a web-page table wearing the .xls name', async () => {
    const html = `<html><head><script>window.evil = 1</script></head><body>
      <table><tr><td>Statement of account</td></tr></table>
      <table>
        <tr><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr>
        <tr><td>03/11/2026</td><td>UPI   SWIGGY</td><td>450.00</td><td></td><td>9,550.00</td></tr>
        <tr><td>05/11/2026</td><td>NEFT SALARY</td><td></td><td>50,000.00</td><td>59,550.00</td></tr>
      </table></body></html>`;
    const { doc } = await read(csvFile(html, 'statement.xls', 'application/vnd.ms-excel'));

    expect(doc.rows).toHaveLength(2);
    expect(doc.rows[0].description).toBe('UPI SWIGGY');
    expect(doc.rows[0].direction).toBe('debit');
    expect(doc.rows[1].direction).toBe('credit');
    expect(doc.rows[1].balance).toBe(59550);
    // The page was parsed for its text and nothing in it ran.
    expect((window as unknown as { evil?: number }).evil).toBeUndefined();
  });

  it('still declines the binary Excel 97 format, by name', async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    const file = new File([ole as BlobPart], 'old.xls', { type: 'application/vnd.ms-excel' });

    const failure = await read(file).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ImportError);
    expect((failure as ImportError).kind).toBe('unsupported');
    expect((failure as ImportError).message).toMatch(/old-format \.xls/);
  });
});

describe('duplicate detection at statement scale', () => {
  const draft = (i: number, over: Partial<DraftRow> = {}): DraftRow => ({
    id: `d${i}`,
    source: {
      line: i, date: '2026-11-01', postedDate: null, description: `SHOP ${i}`, amount: 100 + i,
      direction: 'debit', balance: null, reference: null, currency: null,
    },
    include: true, date: '2026-11-01', amount: 100 + i, merchant: `Shop ${i}`, note: `SHOP ${i}`,
    category: 'groceries', origin: 'rule', confidence: 90, issues: [],
    duplicateOf: null, duplicateInBatch: null,
    ...over,
  });
  const expense = (i: number, over: Partial<ExpenseItem> = {}): ExpenseItem => ({
    id: `tx_${i}`, amount: 100 + i, category: 'groceries', date: '2026-11-01',
    note: `SHOP ${i}`, merchant: `Shop ${i}`, ...over,
  } as ExpenseItem);

  it('flags every row of a 20,000-row statement already in the ledger, quickly', () => {
    const drafts = Array.from({ length: 20_000 }, (_, i) => draft(i));
    const ledger = Array.from({ length: 20_000 }, (_, i) => expense(i));

    const started = performance.now();
    const marked = markDuplicates(drafts, ledger);
    const elapsed = performance.now() - started;

    expect(marked.every((d) => d.duplicateOf !== null && d.include === false)).toBe(true);
    expect(marked[19_999].duplicateOf).toBe('tx_19999');
    // A scan of the whole ledger per row took several seconds here. Generous,
    // so a slow CI machine cannot make this flaky.
    expect(elapsed).toBeLessThan(2500);
  });

  it('still reports the earliest matching row', () => {
    const ledger = [
      expense(1, { id: 'first', amount: 250, merchant: 'Blue Tokai', note: 'BLUE TOKAI' }),
      expense(2, { id: 'second', amount: 250, merchant: 'Blue Tokai', note: 'BLUE TOKAI' }),
    ];
    const [marked] = markDuplicates(
      [draft(0, { amount: 250, merchant: 'Blue Tokai', source: { ...draft(0).source, description: 'BLUE TOKAI' } })],
      ledger,
    );
    expect(marked.duplicateOf).toBe('first');
  });

  it('still treats amounts a hair apart as the same, and a cent apart as different', () => {
    const ledger = [expense(1, { id: 'a', amount: 10.004, merchant: 'Cafe', note: 'CAFE' })];
    const same = markDuplicates([draft(0, { amount: 10.0, merchant: 'Cafe', source: { ...draft(0).source, description: 'CAFE' } })], ledger);
    const different = markDuplicates([draft(0, { amount: 10.01, merchant: 'Cafe', source: { ...draft(0).source, description: 'CAFE' } })], ledger);
    expect(same[0].duplicateOf).toBe('a');
    expect(different[0].duplicateOf).toBeNull();
  });
});

describe('a signed amount column that says nothing else', () => {
  it('reads a bank export: spending negative, money in positive', async () => {
    const { doc, directionsUncertain } = await read(csvFile([
      'Date,Description,Amount',
      '03/11/2026,WOOLWORTHS 1234 SYDNEY,-45.90',
      '04/11/2026,UBER TRIP,-12.00',
      '05/11/2026,TRANSFER FROM SAVINGS,500.00',
      '06/11/2026,NETFLIX,-16.99',
    ].join('\n')));

    // The 500 has no inflow word in it. It used to default to spending.
    expect(doc.rows.map((r) => r.direction)).toEqual(['debit', 'debit', 'credit', 'debit']);
    // Nothing in the file settled it, so the sheet offers to swap.
    expect(directionsUncertain).toBe(true);
    expect(doc.rows.every((r) => !r.directionStated)).toBe(true);
  });

  it('reads a card export the other way: purchases positive, repayments negative', async () => {
    const { doc } = await read(csvFile([
      'Date,Description,Amount',
      '03/11/2026,SWIGGY BANGALORE,450.00',
      '04/11/2026,UBER TRIP,220.50',
      '05/11/2026,AMAZON,1299.00',
      '06/11/2026,ONLINE TRANSFER THANK YOU,-1500.00',
    ].join('\n')));
    expect(doc.rows.map((r) => r.direction)).toEqual(['debit', 'debit', 'debit', 'credit']);
  });

  it('leaves a column with no negatives exactly as before', async () => {
    const { doc } = await read(csvFile([
      'Date,Description,Amount',
      '03/11/2026,SWIGGY BANGALORE,450.00',
      '04/11/2026,SALARY NOV,50000.00',
    ].join('\n')));
    // Unsigned: spending by default, money in only where the description says so.
    expect(doc.rows.map((r) => r.direction)).toEqual(['debit', 'credit']);
  });

  it('is overruled by a balance column, which cannot be misread', async () => {
    // Mostly positive, so the sign alone would call the positives spending —
    // but the balance rises on each of them.
    const { doc, directionsUncertain } = await read(csvFile([
      'Date,Description,Amount,Balance',
      '03/11/2026,PAY ACME LTD,2000.00,3000.00',
      '04/11/2026,PAY ACME LTD,2100.00,5100.00',
      '05/11/2026,RENT,-1200.00,3900.00',
    ].join('\n')));
    expect(doc.rows.map((r) => r.direction)).toEqual(['credit', 'credit', 'debit']);
    expect(directionsUncertain).toBe(false);
  });

  it('is not uncertain when the bank printed Debit and Credit columns', async () => {
    const { directionsUncertain } = await read(csvFile([
      'Date,Description,Debit,Credit',
      '03/11/2026,SWIGGY,450.00,',
      '04/11/2026,SALARY NOV,,50000.00',
    ].join('\n')));
    expect(directionsUncertain).toBe(false);
  });

  it('can be read the other way round, one draft at a time', () => {
    const base: DraftRow = {
      id: 'd1',
      source: { line: 2, date: '2026-11-03', postedDate: null, description: 'PAY ACME', amount: 2000, direction: 'debit', balance: null, reference: null, currency: null },
      include: true, date: '2026-11-03', amount: 2000, merchant: 'Acme', note: 'PAY ACME',
      category: 'groceries', origin: 'rule', confidence: 90, issues: [], duplicateOf: null, duplicateInBatch: null,
    };
    const asCredit = flipDirection(base);
    expect(asCredit.amount).toBe(-2000);
    expect(asCredit.issues).toContain('credit');
    expect(asCredit.include).toBe(false);
    expect(asCredit.source.direction).toBe('credit');

    const back = flipDirection(asCredit);
    expect(back.amount).toBe(2000);
    expect(back.issues).not.toContain('credit');
    expect(back.include).toBe(true);

    // A row read by a camera is never ticked for the user, whichever way it faces.
    const camera = flipDirection({ ...asCredit, issues: ['credit', 'recognised-text'] });
    expect(camera.include).toBe(false);
  });
});

describe('a file with no header row', () => {
  it('reads date, amount, description, balance — newest first, as one bank exports it', async () => {
    const { doc, reconciliation } = await read(csvFile([
      '05/11/2026,-200.00,UBER TRIP SYDNEY,1554.10',
      '04/11/2026,+500.00,TRANSFER FROM SAVINGS,1754.10',
      '03/11/2026,-45.90,WOOLWORTHS 1234 SYDNEY,1254.10',
      '02/11/2026,-100.00,CHEMIST WAREHOUSE,1300.00',
    ].join('\n')));

    expect(doc.columnsInferred).toBe(true);
    expect(doc.rows.map((r) => [r.date, r.amount, r.description, r.balance, r.direction])).toEqual([
      ['2026-11-05', 200, 'UBER TRIP SYDNEY', 1554.1, 'debit'],
      ['2026-11-04', 500, 'TRANSFER FROM SAVINGS', 1754.1, 'credit'],
      ['2026-11-03', 45.9, 'WOOLWORTHS 1234 SYDNEY', 1254.1, 'debit'],
      ['2026-11-02', 100, 'CHEMIST WAREHOUSE', 1300, 'debit'],
    ]);
    expect(doc.newestFirst).toBe(true);
    expect(reconciliation.ok).toBe(true);
  });

  it('reads date, amount, description with no balance', async () => {
    const { doc } = await read(csvFile([
      '03/11/2026,-45.90,WOOLWORTHS 1234 SYDNEY',
      '04/11/2026,-12.00,UBER TRIP',
      '05/11/2026,500.00,TRANSFER FROM SAVINGS',
    ].join('\n')));
    expect(doc.columnsInferred).toBe(true);
    expect(doc.rows.map((r) => [r.amount, r.direction])).toEqual([[45.9, 'debit'], [12, 'debit'], [500, 'credit']]);
  });

  it('finds the balance by its arithmetic, not by where it sits', () => {
    // Balance before amount: the steps of column 1 are column 3.
    const map = inferColumns([
      ['01/11/2026', '900.00', 'SHOP A', '100.00'],
      ['02/11/2026', '700.00', 'SHOP B', '200.00'],
      ['03/11/2026', '650.00', 'SHOP C', '50.00'],
    ]);
    expect(map).toMatchObject({ date: 0, balance: 1, amount: 3, description: [2] });
  });

  it('refuses two money columns it cannot tell apart', async () => {
    // Withdrawals and deposits, perhaps — in which order is anybody's guess.
    await expect(read(csvFile([
      '03/11/2026,SWIGGY,450.00,10.00',
      '04/11/2026,UBER,220.50,75.00',
      '05/11/2026,AMAZON,1299.00,3.00',
    ].join('\n')))).rejects.toMatchObject({ message: expect.stringMatching(/could not find a header row/) });
  });

  it('refuses when a third number column could be anything', async () => {
    await expect(read(csvFile([
      '03/11/2026,900123456,SWIGGY,450.00,9550.00',
      '04/11/2026,900123457,UBER,220.50,9329.50',
    ].join('\n')))).rejects.toMatchObject({ message: expect.stringMatching(/could not find a header row/) });
  });

  it('still refuses a file with no dates at all', async () => {
    await expect(read(csvFile('SWIGGY,lunch,450\nUBER,cab,220')))
      .rejects.toMatchObject({ message: expect.stringMatching(/could not find a header row/) });
  });
});
