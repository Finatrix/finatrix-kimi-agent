import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildBudgetExport, buildExpenseExport, listReports, hasAnyReport, exportReport,
} from '../tools/lib/reports';
import { currentMonth } from '../tools/lib/month';

const CM = currentMonth();

function seedBudget() {
  localStorage.setItem('fx_bb_data', JSON.stringify({
    [CM]: { income: '60000', n: '50', w: '30', s: '20', vals: { rent: 20000, groceries: 6000, stocks: 8000 } },
  }));
}
function seedExpenses() {
  localStorage.setItem('fx_expenses', JSON.stringify([
    { id: 'a', amount: 20000, category: 'rent', date: `${CM}-02`, note: 'Rent' },
    { id: 'b', amount: 3000, category: 'groceries', date: `${CM}-06` },
    { id: 'c', amount: 1500, category: 'eating_out', date: `${CM}-09`, merchant: 'Cafe' },
  ]));
}

describe('reports library', () => {
  beforeEach(() => localStorage.clear());

  it('returns null payloads when no data exists (never fabricates)', () => {
    expect(buildBudgetExport()).toBeNull();
    expect(buildExpenseExport()).toBeNull();
    expect(hasAnyReport()).toBe(false);
  });

  it('builds a budget export payload that matches the tool (reuses computeBudget)', () => {
    seedBudget();
    const b = buildBudgetExport();
    expect(b).not.toBeNull();
    expect(b!.income).toBe(60000);
    expect(b!.needs.pct).toBe(50);
    expect(b!.wants.pct).toBe(30);
    expect(b!.save.pct).toBe(20);
    // Category rows carry the entered amounts.
    expect(b!.rows.find((r) => r.label.toLowerCase().includes('rent'))?.amount).toBe(20000);
  });

  it('builds a COMPLETE expense export (every transaction, not just recents)', () => {
    seedExpenses();
    const e = buildExpenseExport();
    expect(e).not.toBeNull();
    expect(e!.txCount).toBe(3);
    expect(e!.transactions).toHaveLength(3);
    expect(e!.totalSpent).toBe(24500);
    // Merchant travels in its own field so an exporter can lay it out in its
    // own column without repeating it inside the description.
    expect(e!.transactions.some((t) => t.merchant === 'Cafe')).toBe(true);
    expect(e!.transactions.every((t) => !/Cafe —/.test(t.note))).toBe(true);
  });

  it('reports availability drives the hub UI', () => {
    seedBudget();
    seedExpenses();
    const list = listReports();
    expect(list).toHaveLength(2);
    expect(list.every((r) => r.available)).toBe(true);
    expect(hasAnyReport()).toBe(true);
  });

  it('exportReport resolves false when there is no data (safe, no crash)', async () => {
    await expect(exportReport('budget', 'csv')).resolves.toBe(false);
    await expect(exportReport('expenses', 'pdf')).resolves.toBe(false);
  });
});
