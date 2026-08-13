import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportExpensePdf, exportAuditCsv, type ExpenseExport } from '../tools/lib/exporters';

/**
 * Filenames jsPDF's own `save()` was asked for.
 *
 * `save` is not on the prototype — jsPDF attaches it to each instance in the
 * constructor — so it cannot be spied on the class. It is intercepted at the
 * module boundary instead, which also stops the real implementation running:
 * under Node it falls back to writing the PDF to the current directory, and it
 * was dropping a stray file into the repo root on every test run.
 */
const { saved } = vi.hoisted(() => ({ saved: [] as string[] }));

vi.mock('jspdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jspdf')>();
  class NonSavingPdf extends actual.jsPDF {
    constructor(...args: ConstructorParameters<typeof actual.jsPDF>) {
      super(...args);
      // Cast: jsPDF's `save` is overloaded (it can return a Promise when asked
      // for one). The exporters only ever call the plain form, so the stub
      // implements that and is asserted through `saved`.
      this.save = ((name?: string) => {
        saved.push(name ?? '');
        return this;
      }) as unknown as typeof this.save;
    }
  }
  return { ...actual, jsPDF: NonSavingPdf, default: NonSavingPdf };
});

/**
 * The PDF path had no coverage, which is how a report gains a cover page and a
 * comparison section that throw on a real payload without anyone noticing until
 * a user presses Export. These do not assert pixels — they assert the document
 * is produced at all, for the payload shapes that actually occur.
 */

/** Capture what `downloadBlob` would hand to the browser. */
const downloads: Array<{ name: string; blob: Blob }> = [];

beforeEach(() => {
  downloads.length = 0;
  saved.length = 0;
  // jsdom has no object URLs and no real anchor download.
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:mock', configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: new Blob() });
  });
});

afterEach(() => vi.restoreAllMocks());

function payload(over: Partial<ExpenseExport> = {}): ExpenseExport {
  return {
    monthLabel: 'August 2026',
    currency: 'INR',
    totalSpent: 12500,
    dailyAvg: 480,
    txCount: 26,
    budget: 20000,
    income: 60000,
    monthlySavings: 8000,
    netCashFlow: 47500,
    budgetUsedPct: 62.5,
    daysInMonth: 31,
    daysRemaining: 5,
    categoryBudgets: [
      { label: 'Rent', budget: 9000, spent: 9000 },
      { label: 'Groceries', budget: 6000, spent: 2400 },
      { label: 'Eating Out', budget: 3000, spent: 1100 },
    ],
    breakdown: [
      { label: 'Rent', amount: 9000, pct: 72, spending: true },
      { label: 'Groceries', amount: 2400, pct: 19, spending: true },
      { label: 'Eating Out', amount: 1100, pct: 9, spending: true },
    ],
    transactions: [
      { date: '2026-08-01', category: 'Rent', amount: 9000, note: 'Flat' },
      { date: '2026-08-04', category: 'Groceries', amount: 2400, note: '', merchant: 'DMart' },
      { date: '2026-08-09', category: 'Eating Out', amount: 1100, note: 'dinner', paymentMethod: 'UPI' },
    ],
    ...over,
  };
}

/**
 * `exportExpensePdf` ends in jsPDF's own `doc.save()`, which owns the download,
 * so these assert the document is BUILT rather than delivered. That is the part
 * this change touched and the part that can throw: the cover, the comparison
 * section and their arithmetic all run before save is reached.
 */
describe('expense PDF report', () => {
  it('produces a document for a full month', async () => {
    await expect(exportExpensePdf(payload())).resolves.toBeUndefined();
    expect(saved).toEqual(['finatrix-expenses-august-2026.pdf']);
  });

  it('produces a document with a previous month to compare against', async () => {
    await expect(exportExpensePdf(payload({
      previous: {
        label: 'July 2026',
        totalSpent: 14800,
        byCategory: { Rent: 9000, Groceries: 3100, Travel: 2700 },
      },
    }))).resolves.toBeUndefined();
  });

  /**
   * The empty month is the shape most likely to divide by zero: no spend, no
   * budget, no transactions, and a previous month that is also empty.
   */
  it('survives a month with nothing in it', async () => {
    await expect(exportExpensePdf(payload({
      totalSpent: 0, dailyAvg: 0, txCount: 0, budget: 0, income: 0,
      monthlySavings: 0, netCashFlow: null, budgetUsedPct: 0,
      categoryBudgets: [], breakdown: [], transactions: [],
      previous: { label: 'July 2026', totalSpent: 0, byCategory: {} },
    }))).resolves.toBeUndefined();
  });

  it('handles a category that exists in only one of the two months', async () => {
    await expect(exportExpensePdf(payload({
      previous: {
        label: 'July 2026',
        totalSpent: 5000,
        // Travel is absent this month; Eating Out is absent last month.
        byCategory: { Rent: 9000, Travel: 2700 },
      },
    }))).resolves.toBeUndefined();
  });

  it('handles a refund (negative amount) without breaking the layout', async () => {
    await expect(exportExpensePdf(payload({
      breakdown: [{ label: 'Shopping', amount: -1200, pct: -10, spending: true }],
      transactions: [{ date: '2026-08-11', category: 'Shopping', amount: -1200, note: 'returned' }],
    }))).resolves.toBeUndefined();
  });
});

describe('change-history CSV', () => {
  it('exports the log with a header and one row per change', () => {
    exportAuditCsv([
      {
        changedAt: '13/08/2026, 17:35', action: 'Edited', category: 'Groceries',
        txDate: '2026-08-12', amount: 520, label: 'Corner Store',
        changes: 'Amount: 450 → 520',
      },
    ], new Date(2026, 7, 13));
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe('finatrix-expense-history-2026-08-13.csv');
  });

  it('names the file by the local day, never a UTC-shifted one', () => {
    // Late evening local is already tomorrow in UTC east of Greenwich.
    exportAuditCsv([], new Date(2026, 7, 13, 23, 55));
    expect(downloads[0].name).toBe('finatrix-expense-history-2026-08-13.csv');
  });
});
