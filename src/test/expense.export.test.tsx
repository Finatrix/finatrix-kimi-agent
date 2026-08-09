import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import ExpensePage from '../tools/pages/ExpensePage';
import { buildExpenseExport } from '../tools/lib/reports';
import { currentMonth } from '../tools/lib/month';
import { computeDashboard } from '../tools/lib/expense';
import { mergedCats } from '../tools/lib/budget';

const CM = currentMonth();

/** N transactions spread across the current month, alternating categories. */
function seed(n: number) {
  const cats = ['rent', 'groceries', 'eating_out', 'transport', 'stocks'];
  const items = Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    amount: 100 + (i % 37),
    category: cats[i % cats.length],
    date: `${CM}-${String((i % 28) + 1).padStart(2, '0')}`,
    merchant: `Merchant ${i}`,
    note: `note ${i}`,
  }));
  localStorage.setItem('fx_expenses', JSON.stringify(items));
  return items;
}

/**
 * Capture whatever `downloadBlob` hands to the browser. The exporters build a
 * Blob and click an anchor; stubbing the object-URL layer lets a test read the
 * exact bytes a user would receive.
 */
function captureDownloads(): { text: () => Promise<string>; count: () => number } {
  const blobs: Blob[] = [];
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => { blobs.push(b as Blob); return 'blob:x'; }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return {
    count: () => blobs.length,
    text: async () => {
      const b = blobs.at(-1);
      if (!b) throw new Error('nothing was downloaded');
      // jsdom's Blob has no .text(); FileReader is the portable path.
      return new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsText(b);
      });
    },
  };
}

/**
 * Data rows in the exported CSV's transaction block (after its header row).
 *
 * Matched on the header's CONTENT, not its quoting. Cells are quoted only when
 * they contain a quote, comma or newline (RFC 4180 minimal quoting, shared with
 * the Careers exporter via src/lib/csv.ts), so these header cells are bare —
 * this used to look for `"Date","Category",…` and silently found nothing.
 */
function csvTransactionRows(csv: string): string[] {
  const lines = csv.split('\n');
  const start = lines.findIndex((l) => /^"?Date"?,"?Category"?,"?Merchant"?/.test(l));
  expect(start, 'transaction header row not found in export').toBeGreaterThan(-1);
  return lines.slice(start + 1).filter((l) => l.trim() !== '');
}

describe('expense export completeness', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * The regression this suite exists for: the tracker used to export
   * `r.recent` — an 8-row dashboard preview — so every report silently dropped
   * everything beyond the eighth transaction.
   */
  it.each([10, 100, 1000, 5000])('exports every one of %i transactions from the data layer', (n) => {
    seed(n);
    const payload = buildExpenseExport(CM);
    expect(payload).not.toBeNull();
    expect(payload!.txCount).toBe(n);
    expect(payload!.transactions).toHaveLength(n);
    // No duplicates and no gaps: every seeded id is represented exactly once.
    expect(new Set(payload!.transactions.map((t) => `${t.date}|${t.note}`)).size).toBe(n);
  });

  it('exports every transaction from the tracker itself, not just the visible rows', async () => {
    const n = 250; // far beyond the 8-row dashboard preview
    seed(n);
    const dl = captureDownloads();
    render(<CurrencyProvider><ExpensePage /></CurrencyProvider>);

    fireEvent.click(screen.getByText(/Export ▾/));
    fireEvent.click(screen.getByText('Download CSV'));

    await waitFor(() => expect(dl.count()).toBe(1));
    expect(csvTransactionRows(await dl.text())).toHaveLength(n);
  });

  it('exports a filtered-down list in full when a selection is exported', async () => {
    seed(20);
    const dl = captureDownloads();
    render(<CurrencyProvider><ExpensePage /></CurrencyProvider>);

    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;
    fireEvent.click(within(txCard).getByText('Select'));
    fireEvent.click(within(txCard).getByLabelText('Select all shown'));
    fireEvent.click(within(txCard).getByText('Export ▾'));
    fireEvent.click(within(txCard).getByText('Export CSV'));

    await waitFor(() => expect(dl.count()).toBe(1));
    expect(csvTransactionRows(await dl.text())).toHaveLength(20);
  });

  it('carries the summary a financial report needs', () => {
    seed(12);
    localStorage.setItem('fx_bb_data', JSON.stringify({
      [CM]: { income: '90000', n: '50', w: '30', s: '20', vals: { rent: 20000, groceries: 8000 } },
    }));
    const p = buildExpenseExport(CM)!;
    expect(p.income).toBe(90000);
    expect(p.budget).toBe(28000);
    expect(p.netCashFlow).toBe(90000 - p.totalSpent);
    expect(p.budgetUsedPct).toBeCloseTo((p.totalSpent / 28000) * 100, 5);
    expect(p.categoryBudgets?.length).toBeGreaterThan(0);
    // Savings movements are present in the breakdown but flagged as non-spending.
    expect(p.breakdown.find((b) => b.label === 'Stocks / Equity')?.spending).toBe(false);
    expect(p.breakdown.find((b) => b.label === 'Rent')?.spending).toBe(true);
  });
});

describe('top spending categories', () => {
  const cats = mergedCats({ needs: [], wants: [], save: [] });
  const NOW = new Date('2026-07-15T10:00:00');

  it('excludes savings, investments and transfers', () => {
    const items = [
      { id: '1', amount: 40000, category: 'stocks', date: '2026-07-02' },
      { id: '2', amount: 30000, category: 'emergency', date: '2026-07-03' },
      { id: '3', amount: 25000, category: 'transfers', date: '2026-07-04' },
      { id: '4', amount: 9000, category: 'groceries', date: '2026-07-05' },
      { id: '5', amount: 4000, category: 'eating_out', date: '2026-07-06' },
    ];
    const r = computeDashboard('2026-07', items, cats, {}, NOW);

    expect(r.topCategories.map((c) => c.k)).toEqual(['groceries', 'eating_out']);
    // The money still exists in the totals — it is only excluded from "top spending".
    expect(r.monthlySpent).toBe(108000);
    expect(r.monthlySavings).toBe(95000);
  });

  it('excludes an uncategorised key that is plainly an internal movement', () => {
    const items = [
      { id: '1', amount: 5000, category: 'internal_transfer', date: '2026-07-02' },
      { id: '2', amount: 100, category: 'groceries', date: '2026-07-03' },
    ];
    const r = computeDashboard('2026-07', items, cats, {}, NOW);
    expect(r.topCategories.map((c) => c.k)).toEqual(['groceries']);
  });
});

describe('dashboard summary metrics', () => {
  const cats = mergedCats({ needs: [], wants: [], save: [] });
  const NOW = new Date('2026-07-10T10:00:00'); // 10th of a 31-day month

  it('derives pacing and cash flow from real state', () => {
    const items = [{ id: '1', amount: 12000, category: 'rent', date: '2026-07-02' }];
    const r = computeDashboard('2026-07', items, cats, { rent: 20000 }, NOW, 50000);

    expect(r.daysInMonth).toBe(31);
    expect(r.daysRemaining).toBe(21);
    expect(r.budgetUsedPct).toBe(60);
    expect(r.dailySafeSpend).toBeCloseTo(8000 / 21, 6);
    expect(r.netCashFlow).toBe(38000);
    expect(r.tone).toBe('safe');
  });

  it('reports no pacing (rather than a fake figure) without income or budget', () => {
    const r = computeDashboard('2026-07', [], cats, {}, NOW);
    expect(r.dailySafeSpend).toBeNull();
    expect(r.netCashFlow).toBeNull();
    expect(r.tone).toBe('none');
  });

  it('lists categories at or past 80% as warnings, most urgent first', () => {
    const items = [
      { id: '1', amount: 9200, category: 'eating_out', date: '2026-07-02' },  // 92%
      { id: '2', amount: 4800, category: 'transport', date: '2026-07-03' },   // 96%
      { id: '3', amount: 1000, category: 'groceries', date: '2026-07-04' },   // 10%
      { id: '4', amount: 12000, category: 'rent', date: '2026-07-05' },       // 120% → over
    ];
    const r = computeDashboard('2026-07', items, cats,
      { eating_out: 10000, transport: 5000, groceries: 10000, rent: 10000 }, NOW);

    expect(r.warnings.map((w) => w.k)).toEqual(['rent', 'transport', 'eating_out']);
    expect(r.warnings[0].tone).toBe('over');
    expect(r.warnings[1].tone).toBe('warn');
    expect(r.warnings.some((w) => w.k === 'groceries')).toBe(false);
  });
});
