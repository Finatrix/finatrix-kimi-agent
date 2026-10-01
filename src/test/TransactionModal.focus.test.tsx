import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CurrencyProvider } from '../tools/CurrencyContext';
import ExpensePage from '../tools/pages/ExpensePage';

/**
 * The add/edit sheet has to own the keyboard the instant it exists.
 *
 * The sheet used to focus the amount from a 40ms `setTimeout`, which left a
 * window where the dialog was on screen with nothing inside it focused: the
 * opener button had been unmounted, so `document.activeElement` was `<body>`
 * and every character typed in that window went nowhere. It is a short window
 * on an idle machine and a long one on a loaded phone, which is exactly the
 * shape of a bug that reaches users and never reaches CI.
 *
 * Both halves are pinned here because fixing only the first would leave the
 * mirror-image defect: a late timer that yanks focus back out of whichever
 * field the user had already moved to.
 */
function renderPage() {
  return render(
    <MemoryRouter>
      <CurrencyProvider>
        <ExpensePage />
      </CurrencyProvider>
    </MemoryRouter>
  );
}

describe('TransactionModal — focus is owned from the first frame', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
    vi.useRealTimers();
  });

  it('focuses the amount field synchronously, before any timer could run', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add an expense' }));

    const dialog = screen.getByRole('dialog');
    const amount = within(dialog).getByLabelText(/^Amount/) as HTMLInputElement;

    // No act() flush, no timer advance: this is the state of the world in the
    // frame the sheet first paints, which is when a fast typist starts typing.
    expect(document.activeElement).toBe(amount);
  });

  it('does not steal focus back from a field the user moved to', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add an expense' }));

    const dialog = screen.getByRole('dialog');
    const merchant = within(dialog).getByLabelText(/Merchant/i) as HTMLInputElement;
    merchant.focus();
    fireEvent.change(merchant, { target: { value: 'Blue Tokai' } });

    // Well past any settle delay the sheet might want for its entry animation.
    await act(async () => { vi.advanceTimersByTime(500); });

    expect(document.activeElement).toBe(merchant);
    expect(merchant.value).toBe('Blue Tokai');
    vi.useRealTimers();
  });
});

describe('TransactionModal — one error, said once', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  /**
   * The amount field validates itself on blur and the sheet validates on
   * submit; for a malformed formula both ask `evaluateFormula` and both get
   * the same sentence back. Submitting blurs the field on the way to the
   * button, so both fired and the message appeared twice — two identical red
   * lines on screen, and the same sentence read out twice by a screen reader.
   */
  it('shows a malformed amount exactly one message after submit', () => {
    render(
      <MemoryRouter>
        <CurrencyProvider>
          <ExpensePage />
        </CurrencyProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add an expense' }));

    const dialog = screen.getByRole('dialog');
    const amount = within(dialog).getByLabelText(/^Amount/) as HTMLInputElement;

    fireEvent.change(amount, { target: { value: 'aaaa' } });
    // Focus leaves for the button, which is what arms the field's own check.
    fireEvent.blur(amount);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add transaction' }));

    const shown = within(dialog).getAllByText(/Use only numbers/i);
    expect(shown).toHaveLength(1);
  });
});
