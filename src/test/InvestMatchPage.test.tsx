import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ToastProvider } from '../tools/ui/Toast';
import { CurrencyProvider } from '../tools/CurrencyContext';
import { MarketProvider } from '../tools/MarketContext';
import InvestMatchPage from '../tools/pages/InvestMatchPage';

// The page reads both the display currency and the active market: its question
// labels carry the currency symbol and its allocation comes from the market
// pack. `localStorage` is cleared per test, so the market resolves to the
// default (India) and these assertions stay the Indian ones they always were.
function renderPage() {
  return render(
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
}

describe('InvestMatchPage (React) — wizard', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('starts at question 1 and advances numeric steps', () => {
    renderPage();
    expect(screen.getByText('How old are you?')).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 6')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Monthly income (₹)')).toBeInTheDocument();
    expect(screen.getByText('Question 2 of 6')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('How old are you?')).toBeInTheDocument();
  });

  it('shows risk options at the risk step', () => {
    renderPage();
    fireEvent.click(screen.getByText('Next')); // age -> income
    fireEvent.click(screen.getByText('Next')); // income -> monthly
    fireEvent.click(screen.getByText('Next')); // monthly -> risk
    expect(screen.getByText("What's your risk appetite?")).toBeInTheDocument();
    expect(screen.getByText('Conservative')).toBeInTheDocument();
    expect(screen.getByText('Aggressive')).toBeInTheDocument();
  });
});
