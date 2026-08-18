import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CurrencyProvider } from '../tools/CurrencyContext';
import ExpensePage from '../tools/pages/ExpensePage';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * "Still to come this month" on the Expense Tracker.
 *
 * The model is covered in commitments.test.ts; what matters here is that the
 * card only appears when it has something true to say, and that it never
 * disturbs the pacing figure it sits beside.
 */

// Mid-month, so a bill on the 20th is still ahead and one on the 3rd has passed.
const NOW = new Date('2026-08-10T09:00:00');
const CM = '2026-08';

let seq = 0;
function tx(date: string, category: string, amount: number, merchant?: string): ExpenseItem {
  return { id: `t${seq++}`, date, category, amount, ...(merchant ? { merchant } : {}) };
}

/** The same bill in each of the three previous months — enough to be detected. */
function history(category: string, amount: number, day: number, merchant?: string): ExpenseItem[] {
  return ['2026-05', '2026-06', '2026-07'].map((m) =>
    tx(`${m}-${String(day).padStart(2, '0')}`, category, amount, merchant),
  );
}

function seedBudget() {
  localStorage.setItem('fx_bb_data', JSON.stringify({
    [CM]: { income: '80000', n: '50', w: '30', s: '20', vals: { rent: 24000, groceries: 9000, subs: 1000 } },
  }));
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CurrencyProvider><ExpensePage /></CurrencyProvider>
    </MemoryRouter>
  );
}

describe('Expense Tracker — what is already spoken for', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    localStorage.clear();
    cleanup();
    seq = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('stays silent when no recurring bill has been detected', () => {
    seedBudget();
    localStorage.setItem('fx_expenses', JSON.stringify([tx(`${CM}-02`, 'eating_out', 400)]));
    renderPage();
    expect(screen.queryByText('Still to come this month')).not.toBeInTheDocument();
  });

  it('names the bills still due and what they leave free', () => {
    seedBudget();
    localStorage.setItem('fx_expenses', JSON.stringify([
      ...history('rent', 24000, 20),
      tx(`${CM}-02`, 'groceries', 2000),
    ]));
    renderPage();

    const card = screen.getByText('Still to come this month').closest('.card') as HTMLElement;
    expect(within(card).getByText('Rent')).toBeInTheDocument();
    expect(within(card).getByText(/usually the 20th/)).toBeInTheDocument();
    expect(within(card).getByText('Already spoken for')).toBeInTheDocument();
    // Twice: once as the header total, once on the bill's own row.
    expect(within(card).getAllByText('₹24,000')).toHaveLength(2);
    // Free to spend is the tracker's own remaining budget minus that ₹24,000 —
    // the budget total comes from Budget Builder, not from this file's guess.
    expect(within(card).getByText('Free to spend')).toBeInTheDocument();
    expect(within(card).getByText('₹7,000')).toBeInTheDocument();
  });

  it('treats a bill already paid this month as settled, not still due', () => {
    seedBudget();
    localStorage.setItem('fx_expenses', JSON.stringify([
      ...history('rent', 24000, 20),
      tx(`${CM}-02`, 'rent', 24000),
    ]));
    renderPage();
    // Paid on the 2nd, so nothing is left to come and the card says nothing.
    expect(screen.queryByText('Still to come this month')).not.toBeInTheDocument();
  });

  it('leaves the existing daily pacing figure alone', () => {
    seedBudget();
    localStorage.setItem('fx_expenses', JSON.stringify(history('rent', 24000, 20)));
    renderPage();
    // Both figures are on the page: the old one (whole remaining budget) and the
    // new one (after commitments). The point is the difference between them.
    expect(screen.getByText('Daily safe spend')).toBeInTheDocument();
    expect(screen.getByText('Free per day')).toBeInTheDocument();
  });

  it('disappears when an earlier, already-settled month is opened', async () => {
    seedBudget();
    localStorage.setItem('fx_expenses', JSON.stringify(history('rent', 24000, 20)));
    renderPage();
    expect(screen.getByText('Still to come this month')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
    expect(screen.queryByText('Still to come this month')).not.toBeInTheDocument();
  });
});
