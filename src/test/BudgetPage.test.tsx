import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import BudgetPage from '../tools/pages/BudgetPage';

function renderPage() {
  return render(
    <CurrencyProvider>
      <BudgetPage />
    </CurrencyProvider>
  );
}

describe('BudgetPage (React) — wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('renders with 50/30/20 defaults, V4 categories, an export control and an unallocated summary', () => {
    renderPage();
    expect(screen.getByText('The 50/30/20 rule, made effortless.')).toBeInTheDocument();
    // New V4 categories present; export control available.
    expect(screen.getByText('Eating Out')).toBeInTheDocument();
    expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
    expect(screen.getByText(/Export budget/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Monthly take-home income/)).toHaveValue(50000);
    // No spend yet → whole income is unallocated + the "Start above" nudge.
    expect(screen.getByText('Unallocated')).toBeInTheDocument();
    expect(screen.getByText('Start above')).toBeInTheDocument();
  });

  it('recomputes labels + split warning when a percentage changes', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Needs %'), { target: { value: '60' } });
    // 60 + 30 + 20 = 110 → warning shown and the Needs card label updates live.
    expect(screen.getByText('Percentages must add up to 100%')).toBeInTheDocument();
    expect(screen.getByText('Needs · 60%')).toBeInTheDocument();
  });

  it('flags a category as over-limit from a spend entry', () => {
    renderPage();
    // Needs limit at 50% of 50,000 = 25,000. Enter 30,000 of rent → over by 5,000.
    const rentRow = screen.getByText('Rent').closest('.row-line') as HTMLElement;
    const rentInput = rentRow.querySelector('input') as HTMLInputElement;
    fireEvent.change(rentInput, { target: { value: '30000' } });
    expect(screen.getByText('Over by ₹5,000')).toBeInTheDocument();
  });
});
