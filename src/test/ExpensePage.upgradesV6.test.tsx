import { describe, it, expect, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ExpensePage from '../tools/pages/ExpensePage';
import { CurrencyProvider } from '../tools/CurrencyContext';
import { ToastProvider } from '../tools/ui/Toast';
import type { BudgetStore } from '../tools/lib/budget';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * The Expense Tracker's new surfaces, as a user meets them:
 *
 *   • a month score, and the working behind it;
 *   • switches that shorten a page that had grown very long;
 *   • a spend that can be dated into next month and then navigated to;
 *   • opening and closing bank balances, reconciled;
 *   • the Wallet, reachable from anywhere on the page.
 *
 * The clock is pinned at the TOP LEVEL rather than in `beforeEach`, because the
 * module graph reads the date at import time.
 */
vi.useFakeTimers({ shouldAdvanceTime: true });
vi.setSystemTime(new Date(2026, 4, 15, 12, 0, 0)); // 15 May 2026

const CM = '2026-05';
const NEXT = '2026-06';
const PREV = '2026-04';

let seq = 0;
const tx = (date: string, category: string, amount: number): ExpenseItem =>
  ({ id: `t${++seq}`, date, category, amount });

function seed(items: ExpenseItem[], vals: Record<string, number> = {}, income = '100000') {
  localStorage.setItem('fx_expenses', JSON.stringify(items));
  const store: BudgetStore = {
    [PREV]: { vals, income, n: '50', w: '30', s: '20' },
    [CM]: { vals, income, n: '50', w: '30', s: '20' },
  };
  localStorage.setItem('fx_bb_data', JSON.stringify(store));
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CurrencyProvider>
        <ToastProvider>
          <ExpensePage />
        </ToastProvider>
      </CurrencyProvider>
    </MemoryRouter>,
  );
}

/**
 * Open the Panels menu, flip one switch, and close it again.
 *
 * Closing matters for the assertions that follow: the menu carries each
 * panel's NAME as its switch label, so a query for "Monthly trend" would find
 * the switch and report the panel as still on screen.
 */
function togglePanel(label: string) {
  const trigger = screen.getByRole('button', { name: /Panels/ });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(label) }));
  fireEvent.click(trigger);
}

const PLAN = { rent: 30_000, groceries: 12_000, eating_out: 6_000, emergency: 20_000 };
const SPEND = [
  tx(`${CM}-02`, 'rent', 30_000),
  tx(`${CM}-05`, 'groceries', 5_500),
  tx(`${CM}-09`, 'eating_out', 2_800),
  tx(`${CM}-03`, 'emergency', 20_000),
  tx(`${PREV}-05`, 'groceries', 11_000),
];

beforeEach(() => {
  localStorage.clear();
  cleanup();
});
afterEach(() => cleanup());
// Hand the clock back. Leaving fake timers installed lets a pending timeout in
// a component fire after this file's environment is torn down, which surfaces
// as an unattributable "caught after test environment was torn down" warning in
// whichever suite happens to run next.
afterAll(() => vi.useRealTimers());

describe('the month score', () => {
  it('shows a grade, a headline and the working behind it', () => {
    seed(SPEND, PLAN);
    renderPage();

    expect(screen.getByText('Month score')).toBeInTheDocument();
    // A bare number attached to somebody's finances is worse than no number, so
    // every component is one click away with its own figure and reason.
    fireEvent.click(screen.getByRole('button', { name: 'Show the working' }));
    expect(screen.getByRole('columnheader', { name: 'Component' })).toBeInTheDocument();
    expect(screen.getByText('Budget fidelity')).toBeInTheDocument();
    expect(screen.getByText('Savings rate')).toBeInTheDocument();
  });

  it('names what it could not measure instead of scoring it zero', () => {
    seed(SPEND, PLAN, '0'); // no income recorded
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Show the working' }));
    expect(screen.getByText('Not counted, and why')).toBeInTheDocument();
    // Two components need an income — the savings rate and the wants share —
    // so the reason is stated against each of them rather than once, vaguely.
    expect(screen.getAllByText(/No income is recorded/).length).toBeGreaterThanOrEqual(1);
  });

  it('can be switched off entirely', () => {
    seed(SPEND, PLAN);
    renderPage();
    expect(screen.getByText('Month score')).toBeInTheDocument();
    togglePanel('Month score');
    expect(screen.queryByText('Month score')).not.toBeInTheDocument();
  });
});

describe('the panel switches', () => {
  it('hides the monthly trend and remembers the choice', () => {
    seed(SPEND, PLAN);
    renderPage();
    expect(screen.getByText('Monthly trend')).toBeInTheDocument();

    togglePanel('Monthly trend');
    expect(screen.queryByText('Monthly trend')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('fx_exp_panels') || '{}').trend).toBe(false);

    // …and it stays hidden on the next visit.
    cleanup();
    renderPage();
    expect(screen.queryByText('Monthly trend')).not.toBeInTheDocument();
  });

  it('hides spending insights', () => {
    seed(SPEND, PLAN);
    renderPage();
    togglePanel('Spending insights');
    expect(screen.queryByText('Spending insights')).not.toBeInTheDocument();
  });

  it('is a display preference, not synced data', async () => {
    // A panel hidden on a phone must stay visible on the desktop where there is
    // room for it, so this key is deliberately outside SYNC_KEYS.
    const { SYNC_KEYS } = await import('../tools/cloudSync');
    expect(SYNC_KEYS).not.toContain('fx_exp_panels');
  });
});

describe('spending insights carry their own takeaway', () => {
  it('states what to do without waiting for the assistant', () => {
    // A month that will produce the "under budget pace" insight: half the month
    // gone, well under the spendable plan.
    seed(SPEND, PLAN);
    renderPage();
    const card = screen.getByText('Spending insights').closest('.card') as HTMLElement;
    // Every insight renders its deterministic action line, which used to be
    // behind the AI button.
    expect(card.querySelectorAll('.fx-insight-do').length).toBeGreaterThan(0);
  });
});

describe('scheduling a spend for a future month', () => {
  it('lets the month navigator reach forward', () => {
    seed(SPEND, PLAN);
    renderPage();
    // The next arrow used to stop at the current month, so a forward-dated
    // spend landed in a month there was no way to open.
    const next = screen.getByRole('button', { name: 'Go to next month' });
    expect(next).not.toBeDisabled();
    fireEvent.click(next);
    // The month name, not one of the quick-jump chips beside it — those carry
    // the same text and the chip for June now exists too, which is the point.
    expect(document.querySelector('.fx-mnav-month')?.textContent).toBe('June 2026');
    expect(document.querySelector('.fx-mnav-note')?.textContent).toBe('Planning ahead');
  });

  it('says a future date schedules the spend rather than recording it', () => {
    seed(SPEND, PLAN);
    renderPage();
    const date = screen.getByLabelText('Date') as HTMLInputElement;
    fireEvent.change(date, { target: { value: `${NEXT}-10` } });
    expect(screen.getByText(/Scheduled for June 2026/)).toBeInTheDocument();
  });

  it('lists what has been scheduled, grouped by the month it lands in', () => {
    seed([...SPEND, tx(`${NEXT}-10`, 'rent', 30_000)], PLAN);
    renderPage();
    const card = screen.getByText('Scheduled').closest('.card') as HTMLElement;
    expect(within(card).getByRole('button', { name: 'Open June 2026' })).toBeInTheDocument();
    // And it says plainly which month's totals it belongs to.
    expect(within(card).getByText(/counts toward its own month/)).toBeInTheDocument();
  });

  it('shows nothing at all when nothing is scheduled', () => {
    seed(SPEND, PLAN);
    renderPage();
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument();
  });

  it('labels a future month as planned rather than spent', () => {
    seed([...SPEND, tx(`${NEXT}-10`, 'rent', 30_000)], PLAN);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Go to next month' }));
    // "Monthly spent" would be a lie for a month that has not started.
    const kpis = document.querySelector('.dash-grid') as HTMLElement;
    expect(within(kpis).getByText('Scheduled')).toBeInTheDocument();
    expect(within(kpis).getByText('Budget committed')).toBeInTheDocument();
    expect(screen.getByText('Month plan')).toBeInTheDocument();
  });
});

describe('the bank balance', () => {
  it('reconciles the ledger against the account once switched on', () => {
    seed(SPEND, PLAN);
    renderPage();
    togglePanel('Bank balance');

    const opening = screen.getByLabelText(/Opening bank balance/) as HTMLInputElement;
    fireEvent.focus(opening);
    fireEvent.change(opening, { target: { value: '20000' } });
    fireEvent.blur(opening);

    const closing = screen.getByLabelText(/Closing bank balance/) as HTMLInputElement;
    fireEvent.focus(closing);
    fireEvent.change(closing, { target: { value: '61300' } });
    fireEvent.blur(closing);

    // 20,000 + 100,000 − 58,300 logged = 61,700 expected. The bank says
    // 61,300, so 400 left the account that the ledger does not explain.
    expect(screen.getByText('Spent but not logged')).toBeInTheDocument();
    expect(screen.getByText('Expected closing')).toBeInTheDocument();
  });

  it('writes the closing balance to Net Worth on request, and never back', () => {
    seed(SPEND, PLAN);
    renderPage();
    togglePanel('Bank balance');

    const closing = screen.getByLabelText(/Closing bank balance/) as HTMLInputElement;
    fireEvent.focus(closing);
    fireEvent.change(closing, { target: { value: '61300' } });
    fireEvent.blur(closing);

    fireEvent.click(screen.getByRole('button', { name: /Save to Net Worth/ }));
    const accounts = JSON.parse(localStorage.getItem('fx_networth') || '[]');
    expect(accounts).toHaveLength(1);
    expect(accounts[0].balances[CM]).toBe(61300);
  });
});

describe('the wallet', () => {
  it('is reachable from the tracker and reports the year to date', () => {
    seed(SPEND, PLAN);
    renderPage();
    const fab = screen.getByRole('button', { name: /^Wallet\./ });
    // The balance is in the accessible name, so it is available without
    // opening anything.
    expect(fab.getAttribute('aria-label')).toMatch(/banked|overdrawn|on plan|No budget/i);

    fireEvent.click(fab);
    const dialog = screen.getByRole('dialog', { name: 'Wallet' });
    expect(within(dialog).getByText(/positive/)).toBeInTheDocument();
    expect(within(dialog).getByRole('columnheader', { name: 'Balance' })).toBeInTheDocument();
  });

  it('closes on Escape and gives focus back', () => {
    seed(SPEND, PLAN);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^Wallet\./ }));
    expect(screen.getByRole('dialog', { name: 'Wallet' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Wallet' })).not.toBeInTheDocument();
  });
});
