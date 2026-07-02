import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import { ToastProvider } from '../tools/ui/Toast';
import ExpensePage from '../tools/pages/ExpensePage';

function renderPage() {
  return render(
    <CurrencyProvider>
      <ToastProvider>
        <ExpensePage />
      </ToastProvider>
    </CurrencyProvider>
  );
}

describe('ExpensePage (React) — wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('renders empty state, an export control, and logs an expense into the breakdown', () => {
    renderPage();
    expect(screen.getByText('Track every rupee. Privately.')).toBeInTheDocument();
    expect(screen.getByText(/Export ▾/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Add expense'));

    // Default category is Dining; the breakdown card shows it with the amount.
    const breakdown = screen.getByText(/by category/).closest('.card') as HTMLElement;
    expect(within(breakdown).getByText('Dining')).toBeInTheDocument();
    expect(within(breakdown).getByText('₹500')).toBeInTheDocument();
    expect(within(breakdown).getByText('100%')).toBeInTheDocument();
  });

  it('sets a monthly budget via the inline editor', () => {
    renderPage();
    fireEvent.click(screen.getByText('Set budget'));
    const input = screen.getByLabelText('Monthly budget');
    fireEvent.change(input, { target: { value: '10000' } });
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByText(/of ₹10,000/)).toBeInTheDocument();
  });
});
