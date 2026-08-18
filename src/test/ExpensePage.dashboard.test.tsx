import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CurrencyProvider } from '../tools/CurrencyContext';
import ExpensePage from '../tools/pages/ExpensePage';
import { currentMonth } from '../tools/lib/month';

const CM = currentMonth();

function renderPage() {
  return render(<MemoryRouter><CurrencyProvider><ExpensePage /></CurrencyProvider></MemoryRouter>);
}

function seedBudget(vals: Record<string, number>, income = '80000') {
  localStorage.setItem('fx_bb_data', JSON.stringify({
    [CM]: { income, n: '50', w: '30', s: '20', vals },
  }));
}
function seedExpenses(rows: Array<[string, number, string, Record<string, unknown>?]>) {
  localStorage.setItem('fx_expenses', JSON.stringify(rows.map(([category, amount, day, extra], i) => ({
    id: `t${i}`, category, amount, date: `${CM}-${day}`, ...extra,
  }))));
}

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('dashboard summary cards', () => {
  it('shows remaining budget, budget used, days remaining, safe spend, savings and cash flow', () => {
    seedBudget({ rent: 20000, groceries: 10000, emergency: 10000 });
    seedExpenses([['rent', 20000, '02'], ['groceries', 4000, '03'], ['emergency', 5000, '04']]);
    renderPage();

    expect(screen.getByText('Remaining budget')).toBeInTheDocument();
    expect(screen.getByText('Budget used')).toBeInTheDocument();
    expect(screen.getByText('Days remaining')).toBeInTheDocument();
    expect(screen.getByText('Daily safe spend')).toBeInTheDocument();
    expect(screen.getByText('Monthly savings')).toBeInTheDocument();
    expect(screen.getByText('Net cash flow')).toBeInTheDocument();

    // 40,000 budget, 29,000 spent → 11,000 left, 73% used.
    const used = screen.getByText('Budget used').closest('.stat-cell') as HTMLElement;
    expect(within(used).getByText('73%')).toBeInTheDocument();
    // Savings = the savings-section spend; net cash flow = income − everything.
    const savings = screen.getByText('Monthly savings').closest('.fx-metric') as HTMLElement;
    expect(within(savings).getByText('₹5,000')).toBeInTheDocument();
    const flow = screen.getByText('Net cash flow').closest('.fx-metric') as HTMLElement;
    expect(within(flow).getByText('₹51,000')).toBeInTheDocument();
  });

  it('says so plainly instead of inventing a cash-flow figure without income', () => {
    seedExpenses([['rent', 1000, '02']]);
    renderPage();
    const flow = screen.getByText('Net cash flow').closest('.fx-metric') as HTMLElement;
    expect(within(flow).getByText('—')).toBeInTheDocument();
    expect(within(flow).getByText(/Add income in Budget Builder/)).toBeInTheDocument();
  });
});

describe('budget warnings', () => {
  it('lists categories approaching or past their limit, most urgent first', () => {
    seedBudget({ eating_out: 10000, transport: 5000, groceries: 10000 });
    seedExpenses([
      ['eating_out', 9200, '02'],  // 92%
      ['transport', 4450, '03'],   // 89%
      ['groceries', 500, '04'],    // 5% — not a warning
    ]);
    renderPage();

    const card = screen.getByText('Budget warnings').closest('.card') as HTMLElement;
    const rows = within(card).getAllByRole('button');
    expect(rows.map((b) => b.textContent)).toEqual([
      expect.stringContaining('Eating Out'),
      expect.stringContaining('Transport'),
    ]);
    expect(within(card).getByText('92%')).toBeInTheDocument();
    expect(within(card).getByText('89%')).toBeInTheDocument();
    expect(within(card).queryByText('Groceries')).toBeNull();
  });

  it('is clickable: following a warning filters the list to that category', () => {
    seedBudget({ eating_out: 10000 });
    seedExpenses([
      ['eating_out', 9600, '02', { merchant: 'Dosa Plaza' }],
      ['rent', 500, '03', { merchant: 'Landlord' }],
    ]);
    renderPage();

    const card = screen.getByText('Budget warnings').closest('.card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Eating Out.*Show these transactions/ }));

    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;
    expect(within(txCard).getByText('Dosa Plaza')).toBeInTheDocument();
    expect(within(txCard).queryByText('Landlord')).toBeNull();
  });

  it('stays out of the way when nothing needs attention', () => {
    seedBudget({ groceries: 10000 });
    seedExpenses([['groceries', 1000, '02']]);
    renderPage();
    expect(screen.queryByText('Budget warnings')).toBeNull();
  });
});

describe('transaction search', () => {
  const seeded = () => seedExpenses([
    ['groceries', 1250, '05', { merchant: 'BigBasket', note: 'weekly shop', paymentMethod: 'UPI' }],
    ['eating_out', 300, '11', { merchant: 'Blue Bottle', note: 'coffee' }],
    ['rent', 20000, '01', { merchant: 'Landlord' }],
  ]);

  const search = (term: string) => {
    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;
    fireEvent.change(within(txCard).getByLabelText('Search transactions'), { target: { value: term } });
    return txCard;
  };

  it('matches merchant, category, note, payment method, amount and date', () => {
    seeded();
    renderPage();

    expect(within(search('bigbasket')).getByText('BigBasket')).toBeInTheDocument();
    expect(within(search('eating')).getByText('Blue Bottle')).toBeInTheDocument();
    expect(within(search('coffee')).getByText('Blue Bottle')).toBeInTheDocument();
    expect(within(search('upi')).getByText('BigBasket')).toBeInTheDocument();
    expect(within(search('1250')).getByText('BigBasket')).toBeInTheDocument();
    expect(within(search('1,250')).getByText('BigBasket')).toBeInTheDocument();
    expect(within(search(`${CM}-01`)).getByText('Landlord')).toBeInTheDocument();
  });

  it('filters instantly and narrows to nothing with a clear way back', () => {
    seeded();
    renderPage();
    const txCard = search('bigbasket');
    expect(within(txCard).queryByText('Landlord')).toBeNull();

    search('zzzz');
    expect(within(txCard).getByText('No matching transactions')).toBeInTheDocument();
    fireEvent.click(within(txCard).getByText('Clear search & filters'));
    expect(within(txCard).getByText('Landlord')).toBeInTheDocument();
  });
});

describe('bulk delete safety', () => {
  it('asks before deleting a large selection', () => {
    seedExpenses(Array.from({ length: 6 }, (_, i) =>
      ['groceries', 100 + i, String(i + 1).padStart(2, '0')] as [string, number, string]));
    renderPage();

    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;
    fireEvent.click(within(txCard).getByText('Select'));
    fireEvent.click(within(txCard).getByLabelText('Select all shown'));
    fireEvent.click(within(txCard).getByText('Delete'));

    // Nothing is gone yet — the confirmation is the checkpoint.
    const confirm = screen.getByRole('alertdialog');
    expect(within(confirm).getByText('Delete 6 transactions?')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('fx_expenses') || '[]')).toHaveLength(6);

    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(JSON.parse(localStorage.getItem('fx_expenses') || '[]')).toHaveLength(6);
  });
});

describe('reduced motion', () => {
  it('removes a row immediately instead of animating it out', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(((q: string) => ({
      matches: q.includes('reduce'), media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia);

    seedExpenses([['rent', 500, '02']]);
    renderPage();
    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;
    fireEvent.click(within(txCard).getByLabelText('Delete Rent'));

    // No waiting: the delete is synchronous when motion is not wanted.
    expect(within(txCard).queryByLabelText('Delete Rent')).toBeNull();
    vi.restoreAllMocks();
  });
});
