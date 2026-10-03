import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CurrencyProvider } from '../tools/CurrencyContext';
import { MarketProvider } from '../tools/MarketContext';
import { ToastProvider } from '../tools/ui/Toast';
import BudgetPage from '../tools/pages/BudgetPage';
import InvestMatchPage from '../tools/pages/InvestMatchPage';

/**
 * Audit regression guards: every numeric field a user types into must carry an
 * accessible name. Both pages previously exposed rows of unnamed spinbuttons —
 * the visible prompt sat in a sibling node that was never wired to the input,
 * so screen-reader users heard "spin button" with no indication of which.
 *
 * Budget Builder's money fields are `textbox`, not `spinbutton`. They are
 * `type="text"` with `inputMode="decimal"` on purpose: a `type="number"` input
 * reports an empty value for anything not yet a valid number, so `"12."` wiped
 * the field and decimals could not be typed at all. See ui/MoneyField.tsx.
 * The same holds for InvestMatch's money questions; only its age question,
 * a whole number, is still a spinbutton.
 */

/** Every money field the page renders, with the name AT would announce. */
function amountFieldNames(): string[] {
  return screen
    .getAllByRole('textbox')
    .map((el) => el.getAttribute('aria-label') ?? '')
    .filter((n) => / amount /.test(n));
}

describe('Budget Builder — category amount fields', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('names every category amount field, not just the income field', () => {
    render(
      <MemoryRouter>
        <CurrencyProvider>
          <BudgetPage />
        </CurrencyProvider>
      </MemoryRouter>
    );

    // Named, and the name leads with the visible category label (WCAG 2.5.3).
    expect(screen.getByRole('textbox', { name: /^Rent amount/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Groceries amount/ })).toBeInTheDocument();

    // Nothing typeable is left anonymous anywhere on the page.
    for (const el of screen.getAllByRole('textbox')) {
      expect(el).toHaveAccessibleName();
    }
    expect(amountFieldNames().length).toBeGreaterThan(5);
  });

  it('names a custom category amount from whatever the row is called', () => {
    render(
      <MemoryRouter>
        <CurrencyProvider>
          <BudgetPage />
        </CurrencyProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getAllByText('+ Add Category')[0]);
    fireEvent.change(screen.getByDisplayValue('New category'), { target: { value: 'Gym' } });

    expect(screen.getByRole('textbox', { name: /^Gym amount/ })).toBeInTheDocument();
    // …and the amount is still the row's own field.
    const row = screen.getByDisplayValue('Gym').closest('.row-line') as HTMLElement;
    expect(within(row).getByRole('textbox', { name: /^Gym amount/ })).toBeInTheDocument();
  });

  it('focuses a category amount when its visible label is clicked', () => {
    render(
      <MemoryRouter>
        <CurrencyProvider>
          <BudgetPage />
        </CurrencyProvider>
      </MemoryRouter>
    );
    const amount = screen.getByRole('textbox', { name: /^Rent amount/ });
    expect(screen.getByText('Rent').getAttribute('for')).toBe(amount.id);
  });
});

describe('InvestMatch — question labelling', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <CurrencyProvider>
          <MarketProvider>
            <ToastProvider>
              <InvestMatchPage />
            </ToastProvider>
          </MarketProvider>
        </CurrencyProvider>
      </MemoryRouter>
    );

  it('labels each numeric question with its own visible prompt', () => {
    renderPage();
    expect(screen.getByRole('spinbutton', { name: 'How old are you?' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByRole('textbox', { name: 'Monthly income (₹)' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Next'));
    expect(
      screen.getByRole('textbox', { name: 'How much can you invest monthly? (₹)' })
    ).toBeInTheDocument();
  });

  it('describes the accepted range so limits are not discovered by trial', () => {
    renderPage();
    expect(screen.getByRole('spinbutton', { name: 'How old are you?' }))
      .toHaveAccessibleDescription('Between 18 and 75.');

    // The money questions keep their range note now that they are text fields.
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByRole('textbox', { name: 'Monthly income (₹)' }))
      .toHaveAccessibleDescription('1 or more.');
  });

  it('accepts a decimal and arithmetic in a money answer', () => {
    renderPage();
    fireEvent.click(screen.getByText('Next')); // age → income
    const income = screen.getByRole('textbox', { name: 'Monthly income (₹)' });
    expect(income).toHaveAttribute('type', 'text');
    expect(income).toHaveAttribute('inputmode', 'decimal');
    // "12." is not a valid number, so a number input would have blanked here.
    fireEvent.change(income, { target: { value: '45000.' } });
    expect(income).toHaveValue('45000.');
    fireEvent.change(income, { target: { value: '30000+15000' } });
    fireEvent.click(screen.getByText('Next')); // income → monthly, committing 45000
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByRole('textbox', { name: 'Monthly income (₹)' })).toHaveValue('45000');
  });

  it('groups the choice questions under their prompt', () => {
    renderPage();
    fireEvent.click(screen.getByText('Next')); // age → income
    fireEvent.click(screen.getByText('Next')); // income → monthly
    fireEvent.click(screen.getByText('Next')); // monthly → risk

    const group = screen.getByRole('group', { name: "What's your risk appetite?" });
    expect(within(group).getByRole('button', { name: /Conservative/ })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /Aggressive/ })).toBeInTheDocument();
  });
});
