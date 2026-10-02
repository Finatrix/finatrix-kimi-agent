import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CurrencyProvider } from '../tools/CurrencyContext';
import ExpensePage from '../tools/pages/ExpensePage';

/**
 * The Expense Tracker's floating "+".
 *
 * What matters, and why each is a real failure rather than a nicety:
 *  • It is reachable by name ("Add expense") — an icon-only control with no
 *    accessible name is invisible to VoiceOver and TalkBack.
 *  • It is portaled to <body>. A fixed control inside the page's
 *    transform-animated wrapper is fixed to that wrapper, not the screen.
 *  • It opens the SAME sheet as the in-page button and saves through the
 *    same path — no second form, no second set of rules.
 *  • It stays available on every tab, not only where the in-page card is.
 */
function renderPage() {
  return render(
    <MemoryRouter>
      <CurrencyProvider>
        <ExpensePage />
      </CurrencyProvider>
    </MemoryRouter>,
  );
}

const fab = () => screen.getByRole('button', { name: 'Add expense' });

describe('Expense Tracker floating add button', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('is a named, portaled button that marks the page for its extra foot room', () => {
    renderPage();
    const button = fab();
    expect(button.closest('.fx-add-dock')?.parentElement).toBe(document.body);
    expect(button.closest('.fx-add-dock')).toHaveClass('fx-tools', 'fx-scope');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(document.body).toHaveClass('fx-has-add-fab');
  });

  it('removes its body class when the page unmounts', () => {
    const { unmount } = renderPage();
    unmount();
    expect(document.body).not.toHaveClass('fx-has-add-fab');
  });

  it('opens the existing add sheet and saves through it, updating the page at once', () => {
    renderPage();
    fireEvent.click(fab());

    const dialog = screen.getByRole('dialog', { name: 'Add a transaction' });
    fireEvent.change(within(dialog).getByLabelText(/^Amount/), { target: { value: '725.50' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add transaction' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem('fx_expenses') ?? '[]') as { amount: number }[];
    expect(stored).toHaveLength(1);
    expect(stored[0].amount).toBe(725.5);
    const txList = screen.getByText('Transactions').closest('.card') as HTMLElement;
    // The list rounds to whole units; the stored figure above keeps the paise.
    expect(within(txList).getAllByText(/₹72(5\.50|6)\b/).length).toBeGreaterThan(0);
  });

  it('cancels without writing anything', () => {
    renderPage();
    fireEvent.click(fab());
    const dialog = screen.getByRole('dialog', { name: 'Add a transaction' });
    fireEvent.change(within(dialog).getByLabelText(/^Amount/), { target: { value: '90' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('fx_expenses') ?? '[]')).toHaveLength(0);
  });

  it('keeps the sheet open and says why when the amount is missing', () => {
    renderPage();
    fireEvent.click(fab());
    const dialog = screen.getByRole('dialog', { name: 'Add a transaction' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add transaction' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/enter an amount/i);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('opens one sheet however many times it is pressed', () => {
    renderPage();
    fireEvent.click(fab());
    fireEvent.click(fab());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('stays available on every tab', () => {
    renderPage();
    for (const name of ['Analytics', 'Recurring', 'History', 'Overview']) {
      fireEvent.click(screen.getByRole('tab', { name }));
      expect(fab()).toBeInTheDocument();
    }
  });
});
