import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CurrencyProvider } from '../tools/CurrencyContext';
import ExpensePage from '../tools/pages/ExpensePage';
import { currentMonth } from '../tools/lib/month';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * The Expense Tracker's intelligence layer, from the outside: arithmetic in the
 * amount field, a recoverable delete, and a heatmap a keyboard can actually
 * reach.
 */

/**
 * The clock is pinned mid-month for the whole file. Several assertions here
 * depend on where "today" falls relative to the seeded day-of-month: the
 * timeline only accumulates spending up to today, so a suite that seeds days
 * 2 and 9 and expects ₹620 silently becomes a different test on the 1st of
 * the month, when neither day has happened yet. Pinning is what makes the
 * seeded data and the app's own notion of "now" agree on every day of the
 * year. The 15th is late enough that any seeded day below it reads as past,
 * and early enough to leave room for "upcoming" cases.
 */
const NOW = new Date('2026-07-15T09:00:00');
vi.useFakeTimers({ shouldAdvanceTime: true });
vi.setSystemTime(NOW);

const CM = currentMonth();

let seq = 0;
function tx(day: number, category: string, amount: number, note?: string): ExpenseItem {
  return {
    id: `t${++seq}`, date: `${CM}-${String(day).padStart(2, '0')}`,
    category, amount, ...(note ? { note } : {}),
  };
}

function seed(items: ExpenseItem[]) {
  localStorage.setItem('fx_expenses', JSON.stringify(items));
}

function renderPage() {
  return render(<MemoryRouter><CurrencyProvider><ExpensePage /></CurrencyProvider></MemoryRouter>);
}

const saved = (): ExpenseItem[] => JSON.parse(localStorage.getItem('fx_expenses') || '[]');
const amountField = () => screen.getByLabelText(/^Amount/);

beforeEach(() => {
  // Re-pin per test: individual suites below advance the clock, and a suite
  // that restored real timers would hand the next one a "now" that no longer
  // matches the module-level CM the fixtures are dated against.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  localStorage.clear();
  cleanup();
});
afterEach(() => vi.useRealTimers());

/* ══════════════════════════════════════════════════════════════════════════
   Formula input
   ══════════════════════════════════════════════════════════════════════════ */

describe('arithmetic in the amount field', () => {
  it('shows what a formula evaluates to before anything is saved', () => {
    renderPage();
    fireEvent.change(amountField(), { target: { value: '120/4' } });

    expect(screen.getByText('= ₹30')).toBeInTheDocument();
    expect(saved()).toHaveLength(0); // nothing committed yet
  });

  it('saves the evaluated amount, not the text', () => {
    renderPage();
    fireEvent.change(amountField(), { target: { value: '50+(20*2)' } });
    fireEvent.click(screen.getByText('Add expense'));

    expect(saved()).toHaveLength(1);
    expect(saved()[0].amount).toBe(90);
  });

  it('still accepts a plain number', () => {
    renderPage();
    fireEvent.change(amountField(), { target: { value: '249.99' } });
    fireEvent.click(screen.getByText('Add expense'));

    expect(saved()[0].amount).toBe(249.99);
  });

  it('shows no preview for a plain number — there is nothing to preview', () => {
    renderPage();
    fireEvent.change(amountField(), { target: { value: '42' } });
    expect(screen.queryByText(/^= /)).not.toBeInTheDocument();
  });

  it('says nothing while a formula is still half-typed', () => {
    renderPage();
    fireEvent.change(amountField(), { target: { value: '12+' } });
    expect(screen.queryByText(/^= /)).not.toBeInTheDocument();
    expect(screen.queryByText(/incomplete/i)).not.toBeInTheDocument();
  });

  it('reports a broken formula once the user leaves the field', () => {
    renderPage();
    fireEvent.change(amountField(), { target: { value: '(100-25' } });
    fireEvent.blur(amountField());

    expect(screen.getByText(/Check the brackets/i)).toBeInTheDocument();
    expect(amountField()).toHaveAttribute('aria-invalid', 'true');
  });

  it('names the reason on submit rather than claiming the amount is empty', () => {
    renderPage();
    fireEvent.change(amountField(), { target: { value: '10/0' } });
    fireEvent.click(screen.getByText('Add expense'));

    expect(screen.getByRole('alert')).toHaveTextContent(/divide by zero/i);
    expect(saved()).toHaveLength(0);
  });

  it('never evaluates anything but arithmetic', () => {
    renderPage();
    fireEvent.change(amountField(), { target: { value: 'alert(1)' } });
    fireEvent.click(screen.getByText('Add expense'));

    expect(saved()).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent(/only numbers/i);
  });

  it('keeps a numeric keypad on mobile despite being a text field', () => {
    renderPage();
    // type=number would discard "120/4" outright, so the field is text —
    // inputMode is what preserves the numeric keyboard.
    expect(amountField()).toHaveAttribute('type', 'text');
    expect(amountField()).toHaveAttribute('inputmode', 'decimal');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Undo delete
   ══════════════════════════════════════════════════════════════════════════ */

describe('undo delete', () => {
  // Timers are already faked and pinned by the file-level hooks above.
  beforeEach(() => seed([tx(2, 'rent', 500, 'Flat rent'), tx(3, 'groceries', 120, 'Market')]));

  /** The list plays a 220ms exit animation before committing, so let it finish. */
  const settleRemoval = () => act(() => { vi.advanceTimersByTime(300); });

  const deleteFirst = () => {
    const list = screen.getByText('Transactions').closest('.card') as HTMLElement;
    fireEvent.click(within(list).getAllByRole('button', { name: /^Delete / })[0]);
    settleRemoval();
  };

  it('offers an undo naming what was deleted', () => {
    renderPage();
    deleteFirst();

    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent(/Deleted/);
    expect(within(toast).getByRole('button', { name: /^Undo/ })).toBeInTheDocument();
  });

  it('restores the transaction exactly', () => {
    renderPage();
    const before = saved();
    deleteFirst();
    expect(saved()).toHaveLength(1);

    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: /^Undo/ }));

    const after = saved();
    expect(after).toHaveLength(2);
    expect([...after].sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual([...before].sort((a, b) => a.id.localeCompare(b.id)));
  });

  it('commits the deletion once the window closes', () => {
    renderPage();
    deleteFirst();
    act(() => { vi.advanceTimersByTime(10_000); });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(saved()).toHaveLength(1);
  });

  it('keeps the offer open for the full ten seconds', () => {
    renderPage();
    deleteFirst();
    act(() => { vi.advanceTimersByTime(9_000); });

    expect(within(screen.getByRole('status')).getByRole('button', { name: /^Undo/ })).toBeInTheDocument();
  });

  it('undoes a bulk delete as one batch', () => {
    renderPage();
    const list = screen.getByText('Transactions').closest('.card') as HTMLElement;
    fireEvent.click(within(list).getByRole('button', { name: 'Select' }));
    fireEvent.click(within(list).getByLabelText('Select all shown'));
    fireEvent.click(within(list).getByRole('button', { name: 'Delete' }));
    settleRemoval();

    expect(saved()).toHaveLength(0);
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: /^Undo/ }));
    expect(saved()).toHaveLength(2);
  });

  it('restores the most recent deletion with Ctrl/Cmd+Z', () => {
    renderPage();
    deleteFirst();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    expect(saved()).toHaveLength(2);
  });

  it('leaves the browser’s own text undo alone while typing', () => {
    renderPage();
    deleteFirst();
    fireEvent.keyDown(amountField(), { key: 'z', ctrlKey: true });

    expect(saved()).toHaveLength(1); // the field's undo, not ours
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Heatmap
   ══════════════════════════════════════════════════════════════════════════ */

describe('spending heatmap', () => {
  beforeEach(() => seed([tx(2, 'rent', 500), tx(2, 'groceries', 120), tx(9, 'groceries', 60)]));

  const openAnalytics = () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Analytics/ }));
    return screen.getByText(/^Daily spending/).closest('.card') as HTMLElement;
  };

  it('makes every day reachable by keyboard, not just by pointer', () => {
    const card = openAnalytics();
    const day2 = within(card).getByRole('button', { name: /^2 / });
    expect(day2).toBeInTheDocument();
    // A div with a title attribute is not focusable; a button is.
    expect(day2.tagName).toBe('BUTTON');
  });

  it('names the date, the amount and the transaction count', () => {
    const card = openAnalytics();
    expect(within(card).getByRole('button', { name: /^2 .*₹620, 2 transactions/ })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /^9 .*₹60, 1 transaction$/ })).toBeInTheDocument();
  });

  it('shows the detail on focus, so it is not hover-only', () => {
    const card = openAnalytics();
    fireEvent.focus(within(card).getByRole('button', { name: /^9 / }));

    const readout = card.querySelector('.fx-hm-read') as HTMLElement;
    expect(readout).toHaveTextContent('₹60');
    expect(readout).toHaveTextContent('1 transaction');
  });

  it('points at the busiest day when nothing is selected', () => {
    const card = openAnalytics();
    expect(card.querySelector('.fx-hm-read')).toHaveTextContent(/Busiest day/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Budget timeline
   ══════════════════════════════════════════════════════════════════════════ */

describe('budget timeline', () => {
  beforeEach(() => seed([tx(2, 'rent', 500), tx(9, 'groceries', 120)]));

  const openTimeline = () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Analytics/ }));
    return screen.getByText('Budget timeline').closest('.card') as HTMLElement;
  };

  it('offers daily, weekly and monthly views', () => {
    const card = openTimeline();
    for (const label of ['Daily', 'Weekly', 'Monthly']) {
      expect(within(card).getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(within(card).getByRole('button', { name: 'Weekly' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches granularity on press', () => {
    const card = openTimeline();
    fireEvent.click(within(card).getByRole('button', { name: 'Daily' }));

    expect(within(card).getByRole('button', { name: 'Daily' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(card).getByRole('button', { name: 'Weekly' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('describes the chart in text for anyone who cannot see it', () => {
    const card = openTimeline();
    const chart = within(card).getByRole('img');
    expect(chart).toHaveAccessibleName(/cumulative spending/i);
    expect(chart).toHaveAccessibleName(/₹620/);
  });
});
