import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import NetWorthPage from '../tools/pages/NetWorthPage';
import { NET_WORTH_KEY, type NetWorthAccount } from '../tools/lib/netWorth';
import { currentMonth, prevMonth } from '../tools/lib/month';

const CM = currentMonth();
const PM = prevMonth(CM);

function renderPage() {
  return render(<CurrencyProvider><NetWorthPage /></CurrencyProvider>);
}

function seed(accounts: Partial<NetWorthAccount>[]) {
  localStorage.setItem(NET_WORTH_KEY, JSON.stringify(accounts));
}

const stored = (): NetWorthAccount[] => JSON.parse(localStorage.getItem(NET_WORTH_KEY) || '[]');

/** The balance field for one account, addressed the way a screen reader would. */
const field = (name: string, month = CM) =>
  screen.getByLabelText(new RegExp(`^${name} balance for `, 'i'), { selector: `input` }) as HTMLInputElement
  ?? screen.getByLabelText(`${name} balance for ${month}`);

describe('Net Worth — first run', () => {
  beforeEach(() => { localStorage.clear(); cleanup(); });

  it('opens on an empty state with one clear action, not an empty grid', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What you own, minus what you owe');
    expect(screen.getByRole('button', { name: /add your first account/i })).toBeInTheDocument();
    // No figures are invented before anything is entered.
    expect(screen.queryByText('Net worth')).not.toBeInTheDocument();
  });

  it('adds the first account and shows it on the sheet', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /add your first account/i }));
    fireEvent.change(screen.getByLabelText('What is it?'), { target: { value: 'HDFC savings' } });
    fireEvent.change(screen.getByLabelText(/^Balance in /), { target: { value: '140000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));

    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ name: 'HDFC savings', kind: 'asset', category: 'cash' });
    expect(stored()[0].balances[CM]).toBe(140000);
    expect(screen.getByText('HDFC savings')).toBeInTheDocument();
  });

  it('refuses a nameless account instead of storing "Untitled"', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /add your first account/i }));
    fireEvent.change(screen.getByLabelText(/^Balance in /), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i);
    expect(stored()).toHaveLength(0);
  });

  it('offers only the categories that belong to the side being added', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /add your first account/i }));
    const select = screen.getByLabelText('Category') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toContain('Cash & bank');
    expect([...select.options].map((o) => o.textContent)).not.toContain('Home loan');

    fireEvent.click(screen.getByLabelText('I owe it'));
    const owed = screen.getByLabelText('Category') as HTMLSelectElement;
    expect([...owed.options].map((o) => o.textContent)).toContain('Home loan');
    expect([...owed.options].map((o) => o.textContent)).not.toContain('Cash & bank');
  });

  it('accepts arithmetic in the balance, like every other money field here', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /add your first account/i }));
    fireEvent.change(screen.getByLabelText('What is it?'), { target: { value: 'Gold' } });
    fireEvent.change(screen.getByLabelText(/^Balance in /), { target: { value: '12000*4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(stored()[0].balances[CM]).toBe(48000);
  });
});

describe('Net Worth — the sheet', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
    seed([
      { id: 'cash', name: 'Salary account', kind: 'asset', category: 'cash', balances: { [PM]: 100000, [CM]: 140000 } },
      { id: 'mf', name: 'Equity MFs', kind: 'asset', category: 'equity', balances: { [PM]: 600000 } },
      { id: 'loan', name: 'Home loan', kind: 'liability', category: 'home_loan', balances: { [PM]: 3300000, [CM]: 3200000 } },
    ]);
  });

  it('shows assets, liabilities and the subtraction between them', () => {
    renderPage();
    // The assets total appears both as the KPI and as the Assets side total.
    expect(screen.getAllByText('₹7.40 L').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹32 L').length).toBeGreaterThan(0);  // the home loan
    // Owing more than you own is a real answer, and it is shown as one.
    expect(screen.getByText('−₹24.60 L')).toBeInTheDocument();
  });

  it('says which balances are carried forward rather than passing them off as current', () => {
    renderPage();
    const row = screen.getByText('Equity MFs').closest('li') as HTMLElement;
    expect(within(row).getByText(/from /)).toBeInTheDocument();
  });

  it('records a new balance for the month being viewed', () => {
    renderPage();
    fireEvent.change(field('Equity MFs'), { target: { value: '650000' } });
    expect(stored().find((a) => a.id === 'mf')!.balances[CM]).toBe(650000);
    // The earlier month is untouched — this is a new reading, not an edit of history.
    expect(stored().find((a) => a.id === 'mf')!.balances[PM]).toBe(600000);
  });

  it('clearing a balance restores the carried-forward value instead of writing zero', () => {
    renderPage();
    fireEvent.change(field('Salary account'), { target: { value: '' } });
    const account = stored().find((a) => a.id === 'cash')!;
    expect(account.balances[CM]).toBeUndefined();
    expect(account.balances[PM]).toBe(100000);
  });

  it('ignores a half-typed formula until it reads as a number', () => {
    renderPage();
    const input = field('Salary account');
    fireEvent.change(input, { target: { value: '140000+' } });
    expect(stored().find((a) => a.id === 'cash')!.balances[CM]).toBe(140000);
    fireEvent.change(input, { target: { value: '140000+5000' } });
    expect(stored().find((a) => a.id === 'cash')!.balances[CM]).toBe(145000);
  });

  it('asks before deleting, and names what is about to go', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Equity MFs' }));
    expect(stored()).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(stored()).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Equity MFs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Equity MFs' }));
    expect(stored().map((a) => a.id)).toEqual(['cash', 'loan']);
  });

  it('gives the trend a text equivalent, not just a picture', () => {
    renderPage();
    const table = screen.getByRole('table', { name: /net worth by month/i });
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
    expect(screen.getByRole('img', { name: /^Net worth from /i })).toBeInTheDocument();
  });

  it('labels every balance field with the account and the month it belongs to', () => {
    renderPage();
    for (const name of ['Salary account', 'Equity MFs', 'Home loan']) {
      expect(field(name)).toBeInTheDocument();
    }
  });

  it('exports every recorded balance, through the shared CSV writer', async () => {
    // jsdom implements neither of these; the exporter needs both to hand a file
    // over, so they are stubbed exactly as the Expense Tracker's export suite does.
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => { blobs.push(b as Blob); return 'blob:x'; }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(blobs).toHaveLength(1);
    // jsdom's Blob has no .text(); FileReader is the portable path.
    const text = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsText(blobs[0]);
    });
    expect(text.split('\n')[0]).toBe('Month,Type,Category,Account,Balance');
    expect(text).toContain('Salary account');
    expect(text).toContain('Home loan');
    vi.restoreAllMocks();
  });
});

describe('Net Worth — staleness', () => {
  beforeEach(() => { localStorage.clear(); cleanup(); });

  it('says so when a balance is months old, rather than quietly carrying it', () => {
    const old = `${Number(CM.slice(0, 4)) - 1}-${CM.slice(5)}`;
    seed([{ id: 'a', name: 'PPF', kind: 'asset', category: 'retirement', balances: { [old]: 300000 } }]);
    renderPage();
    expect(screen.getByRole('note')).toHaveTextContent(/hasn’t been updated/i);
  });

  it('stays quiet when everything is current', () => {
    seed([{ id: 'a', name: 'PPF', kind: 'asset', category: 'retirement', balances: { [CM]: 300000 } }]);
    renderPage();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

/**
 * Backfilling. Carry-forward means an account contributes nothing before its
 * first record, which would otherwise make history unenterable: someone who
 * starts in August could never make their line begin in July.
 */
describe('Net Worth — filling in an earlier month', () => {
  beforeEach(() => { localStorage.clear(); cleanup(); });

  it('offers a field for an account that did not exist yet, without counting it', () => {
    seed([{ id: 'a', name: 'Savings', kind: 'asset', category: 'cash', balances: { [CM]: 140000 } }]);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /previous month/i }));

    expect(screen.getByText(/Not recorded in /)).toBeInTheDocument();
    // It is offered, but it is not in any total for that month.
    const assets = screen.getByRole('region', { name: 'Assets' });
    expect(within(assets).getByText('₹0')).toBeInTheDocument();

    fireEvent.change(field('Savings', PM), { target: { value: '100000' } });
    expect(stored()[0].balances[PM]).toBe(100000);
    expect(stored()[0].balances[CM]).toBe(140000);
  });
});
