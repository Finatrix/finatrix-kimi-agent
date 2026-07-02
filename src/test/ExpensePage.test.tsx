import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import ExpensePage from '../tools/pages/ExpensePage';

function renderPage() {
  return render(
    <CurrencyProvider>
      <ExpensePage />
    </CurrencyProvider>
  );
}

describe('ExpensePage (React) — dashboard wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('renders the dashboard header, KPIs and an export control', () => {
    renderPage();
    expect(screen.getByText('Your budget, tracked live.')).toBeInTheDocument();
    expect(screen.getByText(/Export ▾/)).toBeInTheDocument();
    expect(screen.getByText('Monthly budget')).toBeInTheDocument();
    expect(screen.getByText('Monthly spent')).toBeInTheDocument();
    expect(screen.getByText('Remaining')).toBeInTheDocument();
    // Needs / Wants / Savings summary block from Budget Builder sections.
    expect(screen.getByText('Needs · Wants · Savings')).toBeInTheDocument();
  });

  it('logs an expense that flows into Monthly spent and Top categories', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Add expense'));

    // Default category is the first budget category (Rent). Spent rolls up.
    const top = screen.getByText('Top categories').closest('.card') as HTMLElement;
    expect(within(top).getByText('Rent')).toBeInTheDocument();
    // Recent expenses lists it too.
    const recent = screen.getByText('Recent expenses').closest('.card') as HTMLElement;
    expect(within(recent).getAllByText('₹500').length).toBeGreaterThan(0);
  });

  it("reflects a Budget Builder allocation as this category's budget", () => {
    const now = new Date();
    const m = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    localStorage.setItem('fx_bb_data', JSON.stringify({ [m]: { vals: { rent: 20000 } } }));
    renderPage();
    const cat = screen.getByText('Category budgets').closest('.card') as HTMLElement;
    expect(within(cat).getByText('Rent')).toBeInTheDocument();
    expect(within(cat).getByText(/budget ₹20,000/)).toBeInTheDocument();
  });
});
