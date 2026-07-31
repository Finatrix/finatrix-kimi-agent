import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import BudgetPage from '../tools/pages/BudgetPage';
import { currentMonth, prevMonth } from '../tools/lib/month';
import type { BudgetStore } from '../tools/lib/budget';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * Smart budget suggestions, as the user meets them.
 *
 * The behaviour under test is mostly a promise about what does NOT happen: a
 * suggestion must never become a budget without an explicit press. Everything
 * else on this card is in service of making that decision an informed one.
 */

const CM = currentMonth();
const M1 = prevMonth(CM);
const M2 = prevMonth(M1);
const M3 = prevMonth(M2);

let seq = 0;
function tx(month: string, category: string, amount: number): ExpenseItem {
  return { id: `t${++seq}`, date: `${month}-05`, category, amount };
}

function seed(items: ExpenseItem[], vals: Record<string, number> = {}) {
  localStorage.setItem('fx_expenses', JSON.stringify(items));
  const store: BudgetStore = {
    [CM]: { vals, income: '50000', n: '50', w: '30', s: '20' },
  };
  localStorage.setItem('fx_bb_data', JSON.stringify(store));
}

function renderPage() {
  return render(<CurrencyProvider><BudgetPage /></CurrencyProvider>);
}

const card = () => screen.getByText('Suggested from your spending').closest('.card') as HTMLElement;
const savedVals = (): Record<string, number> =>
  (JSON.parse(localStorage.getItem('fx_bb_data') || '{}') as BudgetStore)[CM]?.vals ?? {};
const groceriesRow = () =>
  within(card()).getByText('Groceries').closest('li') as HTMLElement;
/** The three headline figures, scoped away from the (always-in-DOM) explanation. */
const figures = (row: HTMLElement) => row.querySelector('.fx-sug-figs') as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('the card only appears when there is something to suggest', () => {
  it('stays hidden with no spending history at all', () => {
    seed([]);
    renderPage();
    expect(screen.queryByText('Suggested from your spending')).not.toBeInTheDocument();
  });

  it('appears once history exists', () => {
    seed([tx(M1, 'groceries', 550), tx(M2, 'groceries', 530)]);
    renderPage();
    expect(screen.getByText('Suggested from your spending')).toBeInTheDocument();
  });
});

describe('what the card tells the user', () => {
  beforeEach(() => {
    seed([tx(M1, 'groceries', 560), tx(M2, 'groceries', 500), tx(M3, 'groceries', 566)], { groceries: 400 });
  });

  it('shows the suggestion, the current budget and the difference', () => {
    renderPage();
    const figs = figures(groceriesRow());
    // Average of 560, 500 and 566 is 542, which rounds up to 550.
    expect(within(figs).getByText('₹550')).toBeInTheDocument();
    expect(within(figs).getByText('₹400')).toBeInTheDocument();
    expect(within(figs).getByText('+₹150')).toBeInTheDocument();
  });

  it('explains the number rather than asserting it', () => {
    renderPage();
    const row = groceriesRow();
    fireEvent.click(within(row).getByText('Why this number?'));
    expect(within(row).getByText(/average groceries spend over 3 months/i)).toBeInTheDocument();
    // The month-by-month evidence is there to be checked by hand.
    expect(within(row).getByText('₹566')).toBeInTheDocument();
  });

  it('grades its own confidence', () => {
    renderPage();
    expect(within(groceriesRow()).getByText(/confidence/i)).toBeInTheDocument();
  });

  it('lets the user change how many months are averaged', () => {
    renderPage();
    const threeMonths = within(card()).getByRole('button', { name: '3m' });
    fireEvent.click(threeMonths);
    expect(threeMonths).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('nothing is written without an explicit press', () => {
  beforeEach(() => {
    seed([tx(M1, 'groceries', 560), tx(M2, 'groceries', 500), tx(M3, 'groceries', 566)], { groceries: 400 });
  });

  it('leaves the budget untouched just by rendering the suggestion', () => {
    renderPage();
    expect(screen.getByText('Suggested from your spending')).toBeInTheDocument();
    expect(savedVals().groceries).toBe(400);
  });

  it('applies the suggested figure on Accept', () => {
    renderPage();
    fireEvent.click(within(groceriesRow()).getByRole('button', { name: /Accept ₹550/ }));

    expect(savedVals().groceries).toBe(550);
    // …and the category's own input now shows it.
    const needs = screen.getByText(/^Needs · /).closest('.card') as HTMLElement;
    expect(within(needs).getByLabelText(/^Groceries amount/)).toHaveValue(550);
  });

  it('applies the user’s own figure on Edit, not the suggestion', () => {
    renderPage();
    fireEvent.click(within(groceriesRow()).getByRole('button', { name: /Edit the suggested/ }));

    const field = within(groceriesRow()).getByLabelText(/Your amount/);
    expect(field).toHaveValue('550'); // pre-filled with the suggestion
    fireEvent.change(field, { target: { value: '480' } });
    fireEvent.click(within(groceriesRow()).getByRole('button', { name: 'Apply' }));

    expect(savedVals().groceries).toBe(480);
  });

  it('accepts arithmetic in the edit field', () => {
    renderPage();
    fireEvent.click(within(groceriesRow()).getByRole('button', { name: /Edit the suggested/ }));
    fireEvent.change(within(groceriesRow()).getByLabelText(/Your amount/), { target: { value: '500+50' } });
    fireEvent.click(within(groceriesRow()).getByRole('button', { name: 'Apply' }));

    expect(savedVals().groceries).toBe(550);
  });

  it('changes nothing on Cancel', () => {
    renderPage();
    fireEvent.click(within(groceriesRow()).getByRole('button', { name: /Edit the suggested/ }));
    fireEvent.change(within(groceriesRow()).getByLabelText(/Your amount/), { target: { value: '9999' } });
    fireEvent.click(within(groceriesRow()).getByRole('button', { name: 'Cancel' }));

    expect(savedVals().groceries).toBe(400);
  });

  it('dismisses a row on Ignore, keeping the existing budget', () => {
    renderPage();
    fireEvent.click(within(groceriesRow()).getByRole('button', { name: /Ignore the Groceries suggestion/ }));

    expect(within(card()).queryByText('Groceries')).not.toBeInTheDocument();
    expect(savedVals().groceries).toBe(400);
  });

  it('lets dismissed rows be brought back', () => {
    renderPage();
    fireEvent.click(within(groceriesRow()).getByRole('button', { name: /Ignore the Groceries suggestion/ }));
    fireEvent.click(within(card()).getByRole('button', { name: 'Show them again' }));

    expect(within(card()).getByText('Groceries')).toBeInTheDocument();
  });

  it('remembers a dismissal across a remount', () => {
    const first = renderPage();
    fireEvent.click(within(groceriesRow()).getByRole('button', { name: /Ignore the Groceries suggestion/ }));
    first.unmount();

    renderPage();
    expect(within(card()).queryByText('Groceries')).not.toBeInTheDocument();
  });
});
