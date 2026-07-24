import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import { ToastProvider } from '../tools/ui/Toast';
import BudgetPage from '../tools/pages/BudgetPage';
import InvestMatchPage from '../tools/pages/InvestMatchPage';

/**
 * Audit regression guards: every numeric field a user types into must carry an
 * accessible name. Both pages previously exposed rows of unnamed spinbuttons —
 * the visible prompt sat in a sibling node that was never wired to the input,
 * so screen-reader users heard "spin button" with no indication of which.
 */

/** Every spinbutton the page renders, with the name AT would announce. */
function spinbuttonNames(): string[] {
  return screen.getAllByRole('spinbutton').map((el) => el.getAttribute('aria-label') ?? el.getAttribute('id') ?? '');
}

describe('Budget Builder — category amount fields', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('names every category amount field, not just the income field', () => {
    render(
      <CurrencyProvider>
        <BudgetPage />
      </CurrencyProvider>
    );

    // Named, and the name leads with the visible category label (WCAG 2.5.3).
    expect(screen.getByRole('spinbutton', { name: /^Rent amount/ })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /^Groceries amount/ })).toBeInTheDocument();

    // Nothing typeable is left anonymous anywhere on the page.
    for (const el of screen.getAllByRole('spinbutton')) {
      expect(el).toHaveAccessibleName();
    }
    expect(spinbuttonNames().length).toBeGreaterThan(5);
  });

  it('names a custom category amount from whatever the row is called', () => {
    render(
      <CurrencyProvider>
        <BudgetPage />
      </CurrencyProvider>
    );
    fireEvent.click(screen.getAllByText('+ Add Category')[0]);
    fireEvent.change(screen.getByDisplayValue('New category'), { target: { value: 'Gym' } });

    expect(screen.getByRole('spinbutton', { name: /^Gym amount/ })).toBeInTheDocument();
    // …and the amount is still the row's own field.
    const row = screen.getByDisplayValue('Gym').closest('.row-line') as HTMLElement;
    expect(within(row).getByRole('spinbutton', { name: /^Gym amount/ })).toBeInTheDocument();
  });

  it('focuses a category amount when its visible label is clicked', () => {
    render(
      <CurrencyProvider>
        <BudgetPage />
      </CurrencyProvider>
    );
    const amount = screen.getByRole('spinbutton', { name: /^Rent amount/ });
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
      <ToastProvider>
        <InvestMatchPage />
      </ToastProvider>
    );

  it('labels each numeric question with its own visible prompt', () => {
    renderPage();
    expect(screen.getByRole('spinbutton', { name: 'How old are you?' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByRole('spinbutton', { name: 'Monthly income (₹)' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Next'));
    expect(
      screen.getByRole('spinbutton', { name: 'How much can you invest monthly? (₹)' })
    ).toBeInTheDocument();
  });

  it('describes the accepted range so limits are not discovered by trial', () => {
    renderPage();
    expect(screen.getByRole('spinbutton', { name: 'How old are you?' }))
      .toHaveAccessibleDescription('Between 18 and 75.');
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
