import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import BudgetPage from '../tools/pages/BudgetPage';
import type { BudgetStore } from '../tools/lib/budget';

/**
 * Categories belong to the month, as the user meets it.
 *
 * The bug: removing Transport to plan a month you are not commuting removed it
 * from every month you had already budgeted — rewriting an executed plan and
 * orphaning its transactions. The unit-level rule is covered in
 * `budgetCatsMonth.test.ts`; this is the same rule through the actual editor,
 * which is where the two halves of the arrangement are written in two separate
 * calls and could clobber each other.
 */
vi.useFakeTimers({ shouldAdvanceTime: true });
vi.setSystemTime(new Date(2026, 7, 12, 12, 0, 0)); // 12 August 2026

const CM = '2026-08';
const NEXT = '2026-09';

function seed() {
  const store: BudgetStore = {
    [CM]: { vals: { rent: 30_000 }, income: '100000', n: '50', w: '30', s: '20' },
  };
  localStorage.setItem('fx_bb_data', JSON.stringify(store));
}

function renderPage() {
  return render(<CurrencyProvider><BudgetPage /></CurrencyProvider>);
}

const needsCard = () => screen.getByText(/^Needs · /).closest('.card') as HTMLElement;
const monthStore = () => JSON.parse(localStorage.getItem('fx_bb_cats_by_month') || '{}');

/** Start planning next month from an empty plan. */
function goToNextMonth() {
  fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
  const start = screen.queryByRole('button', { name: /Start empty/ });
  if (start) fireEvent.click(start);
}

beforeEach(() => {
  localStorage.clear();
  cleanup();
  seed();
});
afterEach(() => cleanup());
afterAll(() => vi.useRealTimers());

describe('a category added for one month', () => {
  it('is written against that month, not the account', () => {
    renderPage();
    fireEvent.click(within(needsCard()).getByText('+ Add Category'));
    fireEvent.change(screen.getByDisplayValue('New category'), { target: { value: 'Gym' } });

    expect(Object.keys(monthStore())).toEqual([CM]);
    expect(monthStore()[CM].cats.needs[0].l).toBe('Gym');
  });

  it('carries forward into a later month that has no arrangement of its own', () => {
    renderPage();
    fireEvent.click(within(needsCard()).getByText('+ Add Category'));
    fireEvent.change(screen.getByDisplayValue('New category'), { target: { value: 'Gym' } });

    goToNextMonth();
    // Inherited, and the page says so rather than leaving the user to guess.
    expect(screen.getByDisplayValue('Gym')).toBeInTheDocument();
    expect(screen.getByText(/Categories carried forward from/)).toBeInTheDocument();
  });
});

describe('a category removed for one month', () => {
  it('leaves every earlier month exactly as it was', () => {
    renderPage();
    // Give August its own arrangement first, so the two months genuinely differ.
    fireEvent.click(within(needsCard()).getByText('+ Add Category'));
    fireEvent.change(screen.getByDisplayValue('New category'), { target: { value: 'Gym' } });

    goToNextMonth();
    // Archive Transport for September only.
    const nextNeeds = needsCard();
    fireEvent.click(within(nextNeeds).getByRole('button', { name: 'Organise' }));
    fireEvent.click(within(nextNeeds).getByRole('button', { name: 'Archive Transport' }));
    expect(within(needsCard()).queryByLabelText(/^Transport amount/)).not.toBeInTheDocument();

    // Back to August: Transport is still there, because September's decision
    // was September's.
    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    expect(within(needsCard()).getByLabelText(/^Transport amount/)).toBeInTheDocument();

    expect(monthStore()[NEXT].prefs.archived).toContain('transport');
    expect(monthStore()[CM].prefs.archived).not.toContain('transport');
  });

  it('deletes a custom category outright without resurrecting it', () => {
    // Regression: the two halves of an arrangement (categories and preferences)
    // are written in two calls from one handler. Merging each onto the value
    // captured at render time made the second overwrite the first, so the
    // deleted category reappeared the instant its preferences were forgotten.
    renderPage();
    const card = needsCard();
    fireEvent.click(within(card).getByText('+ Add Category'));
    fireEvent.change(screen.getByDisplayValue('New category'), { target: { value: 'Gym' } });

    fireEvent.click(within(card).getByRole('button', { name: 'Organise' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Hide Gym' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Delete Gym' }));

    expect(screen.queryByDisplayValue('Gym')).toBeNull();
    expect(monthStore()[CM].cats.needs).toEqual([]);
    expect(monthStore()[CM].prefs.hidden).toEqual([]);
  });
});

describe('the account-wide template', () => {
  it('is kept in step while the current month is the only one customised', () => {
    // An account that never navigates away from "this month" keeps behaving
    // exactly as it did before per-month arrangements existed.
    renderPage();
    fireEvent.click(within(needsCard()).getByText('+ Add Category'));
    fireEvent.change(screen.getByDisplayValue('New category'), { target: { value: 'Gym' } });

    expect(JSON.parse(localStorage.getItem('fx_bb_cats') || '{}').needs?.[0]?.l).toBe('Gym');
  });

  it('stops being written once a second month disagrees', () => {
    renderPage();
    fireEvent.click(within(needsCard()).getByText('+ Add Category'));
    fireEvent.change(screen.getByDisplayValue('New category'), { target: { value: 'Gym' } });

    goToNextMonth();
    fireEvent.click(within(needsCard()).getByText('+ Add Category'));
    fireEvent.change(screen.getByDisplayValue('New category'), { target: { value: 'Wedding' } });

    // September's addition must not leak into the template every inheriting
    // month reads from.
    const template = JSON.parse(localStorage.getItem('fx_bb_cats') || '{}');
    expect(template.needs.map((c: { l: string }) => c.l)).toEqual(['Gym']);
    expect(monthStore()[NEXT].cats.needs.map((c: { l: string }) => c.l)).toEqual(['Gym', 'Wedding']);
  });
});

describe('the plan score', () => {
  it('rates the budget on screen and shows its working', () => {
    renderPage();
    expect(screen.getByText('Plan score')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show the working' }));
    expect(screen.getByText('Savings commitment')).toBeInTheDocument();
    expect(screen.getByText('Coverage & coherence')).toBeInTheDocument();
  });
});

describe('the automatic budget', () => {
  it('says what it needs rather than proposing figures from nothing', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Forecast' }));
    expect(screen.getByText(/no logged spending in the months before/i)).toBeInTheDocument();
  });

  it('never writes an allocation without a press', () => {
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: 'a', date: '2026-07-05', category: 'groceries', amount: 12_000 },
      { id: 'b', date: '2026-06-05', category: 'groceries', amount: 11_000 },
      { id: 'c', date: '2026-05-05', category: 'groceries', amount: 11_500 },
    ]));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Forecast' }));

    const before = JSON.parse(localStorage.getItem('fx_bb_data') || '{}')[CM].vals;
    expect(before.groceries ?? 0).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /^Set Groceries to/ }));
    const after = JSON.parse(localStorage.getItem('fx_bb_data') || '{}')[CM].vals;
    expect(after.groceries).toBeGreaterThan(0);
  });
});
