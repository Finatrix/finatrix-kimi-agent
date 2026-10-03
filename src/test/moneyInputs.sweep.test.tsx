import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import { MarketProvider } from '../tools/MarketContext';
import { ToastProvider } from '../tools/ui/Toast';
import GoalPlannerPage from '../tools/pages/GoalPlannerPage';
import ParkSmartPage from '../tools/pages/ParkSmartPage';
import PeerComparePage from '../tools/pages/PeerComparePage';
import LifeMapPage from '../tools/pages/LifeMapPage';
import DashboardPlanning from '../tools/ui/DashboardPlanning';
import TransactionList from '../tools/ui/TransactionList';
import { getJSON } from '../tools/lib/storage';
import { readSavedGoal } from '../tools/lib/dashboard';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * Sweep guard for the money-input rule: no money or percentage field is
 * `type="number"`. A number input reports '' for anything not yet a valid
 * number, so "12." wiped fields holding numeric state, the scroll wheel
 * silently changed values, and phones offered the wrong keypad.
 *
 * The only spinbuttons left are whole-number counts — an age, a deadline in
 * years, months of cover. Anything else showing up as a spinbutton is a
 * money field that has regressed.
 */

vi.mock('chart.js/auto', () => ({ default: class { data = { labels: [], datasets: [{ data: [] }, { data: [] }] }; update() {} destroy() {} } }));
vi.mock('../lib/analytics', () => ({ track: vi.fn() }));

const COUNT = /age|years|months/i;

function show(children: ReactNode) {
  return render(<MemoryRouter><CurrencyProvider><MarketProvider><ToastProvider>{children}</ToastProvider></MarketProvider></CurrencyProvider></MemoryRouter>);
}

function selectMarket(market: string, currency: string) {
  localStorage.setItem('fx_market', market);
  localStorage.setItem('fx_currency', currency);
}

/** Every spinbutton on screen is a count, and every named money field is a decimal textbox. */
function expectOnlyCountsAreNumeric(moneyLabels: (string | RegExp)[]) {
  for (const el of screen.queryAllByRole('spinbutton')) {
    expect(el).toHaveAccessibleName(COUNT);
  }
  for (const label of moneyLabels) {
    const field = screen.getByLabelText(label);
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveAttribute('inputmode', 'decimal');
  }
}

/** Typing a trailing decimal point must not blank the field. */
function expectDecimalSurvives(label: string | RegExp, typed = '1250.') {
  const field = screen.getByLabelText(label);
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: typed } });
  expect(field).toHaveValue(typed);
}

beforeEach(() => { cleanup(); localStorage.clear(); selectMarket('IN', 'INR'); });

describe('Goal Planner', () => {
  it('has text money fields that keep a decimal point', () => {
    show(<GoalPlannerPage />);
    expectOnlyCountsAreNumeric([/Target amount in today/, /Already saved/]);
    expectDecimalSurvives(/Target amount in today/);
  });

  it('saves a formula as the number it means, so the dashboard reads it correctly', () => {
    show(<GoalPlannerPage />);
    fireEvent.change(screen.getByLabelText(/Target amount in today/), { target: { value: '500000*2' } });
    expect(getJSON<Record<string, string>>('fx_goals', {})['gp-target']).toBe('1000000');
    fireEvent.click(screen.getByRole('button', { name: 'Show me the path' }));
    // The dashboard's parser strips non-digits: a raw save would read as 5,000,002.
    expect(readSavedGoal()?.targetToday).toBe(1000000);
  });

  it('never saves a half-typed formula', () => {
    show(<GoalPlannerPage />);
    fireEvent.change(screen.getByLabelText(/Already saved/), { target: { value: '20000+' } });
    expect(getJSON<Record<string, string>>('fx_goals', {})['gp-existing']).toBe('');
  });
});

describe('ParkSmart', () => {
  it('has a text amount field in a tax-slab market', () => {
    show(<ParkSmartPage />);
    expectOnlyCountsAreNumeric([/Amount to park/]);
    expectDecimalSurvives(/Amount to park/);
  });

  it('takes entered net rates as percentages, not spinbuttons', () => {
    selectMarket('AU', 'AUD');
    show(<ParkSmartPage />);
    expectOnlyCountsAreNumeric([/Amount to park/, 'Annual net rate for option 1 (%)', 'Annual net rate for option 2 (%)']);
    expectDecimalSurvives('Annual net rate for option 1 (%)', '4.');
  });
});

describe('PeerCompare', () => {
  it('has text money and rate fields; age stays a whole number', () => {
    show(<PeerComparePage />);
    expectOnlyCountsAreNumeric([/Monthly income/, /Total savings/, /Total investments/, /Total debt/, 'Monthly savings rate (%)', /Monthly expenses/]);
    expect(screen.getByRole('spinbutton', { name: 'Your age' })).toBeInTheDocument();
    expectDecimalSurvives(/Monthly income/);
  });

  it('has text figure fields against a published reference', () => {
    selectMarket('AU', 'AUD');
    show(<PeerComparePage />);
    expectOnlyCountsAreNumeric([/Your matching figure/]);
    fireEvent.click(screen.getByRole('button', { name: 'Build my matching figure from parts' }));
    expectOnlyCountsAreNumeric([/Component 1/, /Component 2/]);
    // A liability is a negative component, and a formula is a normal way to state one.
    fireEvent.change(screen.getByLabelText(/Component 1/), { target: { value: '250000' } });
    fireEvent.change(screen.getByLabelText(/Component 2/), { target: { value: '-40000-10000' } });
    expect(screen.getByText(/Component total:/)).toHaveTextContent(/200,000/);
  });
});

describe('LifeMap', () => {
  it('has text money fields, and saves a formula as its result', () => {
    show(<LifeMapPage />);
    expectOnlyCountsAreNumeric([/Monthly income/, /Monthly expenses/, /Total savings/, /emergency fund/, /Total investments so far/]);
    expectDecimalSurvives(/Monthly income/);
    fireEvent.change(screen.getByLabelText(/Monthly income/), { target: { value: '40000+5000' } });
    expect(getJSON<Record<string, string>>('fx_lifemap', {})['lm-income']).toBe('45000');
  });

  it('resolves formulas on the refresh-from-other-tools save too', () => {
    show(<LifeMapPage />);
    fireEvent.change(screen.getByLabelText(/Total savings/), { target: { value: '100000+50000' } });
    // With no other tool data, refresh keeps the typed field and re-saves the form.
    fireEvent.click(screen.getByRole('button', { name: 'Use latest saved figures' }));
    expect(getJSON<Record<string, string>>('fx_lifemap', {})['lm-savings']).toBe('150000');
  });
});

describe('Dashboard emergency fund', () => {
  it('keeps a decimal in a money field held as a number', () => {
    // This one held numeric state, so "12." really did wipe: '' → 0 → blank.
    show(<DashboardPlanning />);
    expectOnlyCountsAreNumeric(['Monthly essentials (INR)', 'Accessible savings already set aside (INR)', 'Monthly contribution (INR)']);
    expect(screen.getByRole('spinbutton', { name: 'Months of cover' })).toBeInTheDocument();
    const essentials = screen.getByLabelText('Monthly essentials (INR)');
    fireEvent.focus(essentials);
    fireEvent.change(essentials, { target: { value: '20000.' } });
    expect(essentials).toHaveValue('20000.');
    fireEvent.change(essentials, { target: { value: '20000.5' } });
    fireEvent.blur(essentials);
    expect(essentials).toHaveValue('20000.5');
  });
});

describe('Transaction amount filters', () => {
  const items: ExpenseItem[] = [
    { id: 'a', amount: 1200, category: 'groceries', date: '2026-10-01' },
    { id: 'b', amount: -300, category: 'groceries', date: '2026-10-02', note: 'Refund' },
  ];
  const noop = () => {};
  const renderList = () => render(
    <TransactionList
      items={items} hasAnyEver cats={[]} cfmt={(n) => `₹${n}`} sym="₹" monthLabelText="October 2026" now={new Date(2026, 9, 3)}
      onAdd={noop} onEdit={noop} onDuplicate={noop} onDelete={noop} onBulkDelete={noop} onBulkDuplicate={noop}
      onBulkCategory={noop} onBulkAddTags={noop} onExport={noop}
    />,
  );

  it('are text fields that keep a decimal, and treat 0 as a real bound', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    expectOnlyCountsAreNumeric(['Min amount', 'Max amount']);
    expectDecimalSurvives('Min amount', '12.');

    const min = screen.getByLabelText('Min amount');
    // Blank is "no bound"; 0 is a filter that hides refunds — the two must not merge.
    fireEvent.change(min, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    fireEvent.change(min, { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeInTheDocument();
  });
});
