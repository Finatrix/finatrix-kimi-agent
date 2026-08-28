import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import BudgetPage from '../tools/pages/BudgetPage';
import { currentMonth, monthLabel, nextMonthUnclamped } from '../tools/lib/month';
import type { BudgetStore } from '../tools/lib/budget';
import type { CatPrefs } from '../tools/lib/budgetCats';

const CM = currentMonth();
const NM = nextMonthUnclamped(CM);

function renderPage() {
  return render(<CurrencyProvider><BudgetPage /></CurrencyProvider>);
}

const prefs = (): CatPrefs => JSON.parse(localStorage.getItem('fx_bb_catprefs') || '{}');
const store = (): BudgetStore => JSON.parse(localStorage.getItem('fx_bb_data') || '{}');
const needsCard = () => screen.getByText(/^Needs · /).closest('.card') as HTMLElement;
const incomeCard = () => screen.getByText('Monthly income').closest('.card') as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('income sources', () => {
  it('supports unlimited sources and totals them into take-home income', () => {
    renderPage();
    const card = incomeCard();
    // Legacy single-figure income seeds Salary.
    expect(within(card).getByLabelText(/^Salary amount/)).toHaveValue('50000');

    fireEvent.change(within(card).getByLabelText(/^Rental Income amount/), { target: { value: '18000' } });
    fireEvent.change(within(card).getByLabelText(/^Dividend amount/), { target: { value: '2000' } });

    expect(screen.getByLabelText('Total monthly take-home income')).toHaveTextContent('₹70,000');
    // …and the split limits follow the new income (50% of 70,000).
    expect(within(needsCard()).getByText('limit ₹35,000')).toBeInTheDocument();
  });

  it('creates, renames and persists a custom source', () => {
    renderPage();
    fireEvent.click(screen.getByText('+ Add income source'));

    const nameInput = screen.getByDisplayValue('New income source');
    fireEvent.change(nameInput, { target: { value: 'Freelance' } });
    fireEvent.change(screen.getByLabelText(/^Freelance amount/), { target: { value: '12000' } });

    expect(screen.getByLabelText('Total monthly take-home income')).toHaveTextContent('₹62,000');
    const saved = JSON.parse(localStorage.getItem('fx_bb_income') || '{}');
    expect(saved.sources.at(-1)).toMatchObject({ l: 'Freelance', custom: true });
    // The per-source amounts ride along with the month, and `income` still
    // carries the total for every downstream consumer.
    expect(store()[CM].inc).toMatchObject({ salary: 50000 });
    expect(store()[CM].income).toBe('62000');
  });

  it('archives a source out of the total and restores it unchanged', () => {
    renderPage();
    const card = incomeCard();
    fireEvent.change(within(card).getByLabelText(/^Interest amount/), { target: { value: '5000' } });
    expect(screen.getByLabelText('Total monthly take-home income')).toHaveTextContent('₹55,000');

    fireEvent.click(within(card).getByRole('button', { name: 'Organise' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Archive Interest' }));

    expect(screen.getByLabelText('Total monthly take-home income')).toHaveTextContent('₹50,000');
    expect(within(card).getByText('Archived (1)')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Restore Interest' }));
    expect(screen.getByLabelText('Total monthly take-home income')).toHaveTextContent('₹55,000');
  });
});

describe('category management', () => {
  it('reorders with the keyboard and persists the arrangement', () => {
    renderPage();
    const card = needsCard();
    fireEvent.click(within(card).getByRole('button', { name: 'Organise' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Move Groceries up' }));

    expect(prefs().order.needs.slice(0, 2)).toEqual(['groceries', 'rent']);
    // The rendered order follows immediately.
    const labels = within(card).getAllByLabelText(/amount \(₹\)$/).map((el) => el.getAttribute('id'));
    expect(labels[0]).toBe('bb-amt-needs-groceries');
  });

  it('hides a category from the list while still counting it', () => {
    renderPage();
    const card = needsCard();
    fireEvent.change(within(card).getByLabelText(/^Rent amount/), { target: { value: '10000' } });

    fireEvent.click(within(card).getByRole('button', { name: 'Organise' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Hide Rent' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Done' }));

    expect(within(card).queryByLabelText(/^Rent amount/)).toBeNull();
    expect(within(card).getByText(/hidden category is still counted/)).toBeInTheDocument();
    // Still in the total — hiding is decluttering, not exclusion.
    expect(within(card).getByText('₹10,000 used')).toBeInTheDocument();
    expect(prefs().hidden).toEqual(['rent']);
  });

  it('archives a category out of the totals and restores it losslessly', () => {
    renderPage();
    const card = needsCard();
    fireEvent.change(within(card).getByLabelText(/^Rent amount/), { target: { value: '10000' } });
    expect(within(card).getByText('₹10,000 used')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Organise' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Archive Rent' }));

    expect(within(card).getByText('₹0 used')).toBeInTheDocument();
    expect(prefs().archived).toEqual(['rent']);
    // The amount is retained in storage, not destroyed.
    expect(store()[CM].vals.rent).toBe(10000);

    fireEvent.click(within(card).getByRole('button', { name: 'Restore Rent' }));
    expect(within(card).getByText('₹10,000 used')).toBeInTheDocument();
  });

  it('deletes a custom category and forgets its arrangement', () => {
    renderPage();
    const card = needsCard();
    fireEvent.click(within(card).getByText('+ Add Category'));
    fireEvent.change(screen.getByDisplayValue('New category'), { target: { value: 'Gym' } });

    fireEvent.click(within(card).getByRole('button', { name: 'Organise' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Hide Gym' }));
    expect(prefs().hidden).toHaveLength(1);

    fireEvent.click(within(card).getByRole('button', { name: 'Delete Gym' }));
    expect(screen.queryByDisplayValue('Gym')).toBeNull();
    expect(prefs().hidden).toEqual([]);
  });
});

describe('progress colours', () => {
  /**
   * The bar is a filled shape, so it takes the -fill tokens, not the AA-deepened
   * text tokens of the same name. Asserting the exact token (rather than a
   * computed colour) is what keeps this readable AND keeps it honest: it fails
   * if a bar is ever pointed back at a text colour, which is the regression that
   * drained the light-theme charts in the first place.
   */
  it('moves through green → orange → blue → red as spending grows', () => {
    renderPage();
    const card = needsCard();
    const bar = () => within(card).getByRole('progressbar');
    const rent = () => within(card).getByLabelText(/^Rent amount/);
    // Needs limit is 50% of the seeded 50,000 income = 25,000.

    fireEvent.change(rent(), { target: { value: '10000' } }); // 40%
    expect(bar()).toHaveAttribute('aria-valuetext', expect.stringContaining('On track'));
    expect(bar().firstElementChild).toHaveStyle({ background: 'var(--green-fill)' });

    fireEvent.change(rent(), { target: { value: '22000' } }); // 88%
    expect(bar()).toHaveAttribute('aria-valuetext', expect.stringContaining('Near limit'));
    expect(bar().firstElementChild).toHaveStyle({ background: 'var(--orange-fill)' });

    fireEvent.change(rent(), { target: { value: '25000' } }); // exactly 100%
    expect(bar()).toHaveAttribute('aria-valuetext', expect.stringContaining('Fully used'));
    expect(bar().firstElementChild).toHaveStyle({ background: 'var(--blue-fill)' });

    fireEvent.change(rent(), { target: { value: '30000' } }); // over
    expect(within(card).getByText('Over by ₹5,000')).toBeInTheDocument();
    expect(bar().firstElementChild).toHaveStyle({ background: 'var(--red-fill)' });
  });
});

describe('planning next month', () => {
  it('offers duplicate / start-empty and never touches other months', () => {
    renderPage();
    const card = needsCard();
    fireEvent.change(within(card).getByLabelText(/^Rent amount/), { target: { value: '15000' } });

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText(`Plan ${monthLabel(NM)}`)).toBeInTheDocument();

    fireEvent.click(screen.getByText(`Duplicate ${monthLabel(CM)}`));

    // Next month exists with a copy of the plan…
    expect(store()[NM].vals.rent).toBe(15000);
    // …and this month is untouched.
    expect(store()[CM].vals.rent).toBe(15000);

    // Editing next month must not write back into this month.
    fireEvent.change(within(needsCard()).getByLabelText(/^Rent amount/), { target: { value: '21000' } });
    expect(store()[NM].vals.rent).toBe(21000);
    expect(store()[CM].vals.rent).toBe(15000);
  });

  it('starts an empty month with nothing carried over', () => {
    renderPage();
    fireEvent.change(within(needsCard()).getByLabelText(/^Rent amount/), { target: { value: '15000' } });

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.click(screen.getByText('Start empty'));

    expect(store()[NM].vals).toEqual({});
    expect(screen.getByLabelText('Total monthly take-home income')).toHaveTextContent('₹0');
    expect(store()[CM].vals.rent).toBe(15000);
  });

  it('does not create a budget for a month the user only looked at', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(store()[NM]).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    expect(store()[NM]).toBeUndefined();
  });
});

describe('calendar rollover', () => {
  afterEach(() => vi.useRealTimers());

  it('activates the new month automatically when the clock rolls over', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-07-20T09:00:00'));
    const { container } = renderPage();
    // Targets MonthNav's month label by class. This used to walk a structural
    // path down to an inline `text-align: center`, which tied the assertion to
    // how the navigator happened to be styled rather than to what it renders.
    const heading = () => container.querySelector('.fx-mnav-month');
    expect(heading()).toHaveTextContent('July 2026');

    vi.setSystemTime(new Date('2026-08-01T09:00:00'));
    act(() => { window.dispatchEvent(new Event('focus')); });

    expect(heading()).toHaveTextContent('August 2026');
    expect(screen.getByText('Current month')).toBeInTheDocument();
  });
});
