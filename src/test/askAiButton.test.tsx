import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CurrencyProvider } from '../tools/CurrencyContext';
import { AiProvider } from '../tools/ui/AiAssistant';
import { AskAiButton } from '../tools/ui/AskAiButton';
import ExpensePage from '../tools/pages/ExpensePage';
import { currentMonth } from '../tools/lib/month';
import type { ExpenseItem } from '../tools/lib/expense';
import type { BudgetStore } from '../tools/lib/budget';

/**
 * The ✨ buttons that turn a figure into a question.
 *
 * The property that matters most is the accessible one: a page carries many of
 * these, and identically-named buttons would leave a screen-reader user with a
 * list of "Ask FinatriX AI" entries and no way to tell which row is which.
 */

// The panel is a lazy chunk with its own suite; here we only care that the
// buttons open it and with what subject.
vi.mock('../tools/ui/AiPanel', () => ({
  default: ({ focus }: { focus: { kind: string; label?: string } | null }) => (
    <div data-testid="panel">panel:{focus ? `${focus.kind}${focus.label ? `:${focus.label}` : ''}` : 'none'}</div>
  ),
}));

const CM = currentMonth();
let seq = 0;
const tx = (day: number, category: string, amount: number): ExpenseItem => ({
  id: `t${++seq}`, date: `${CM}-${String(day).padStart(2, '0')}`, category, amount,
});

function seed() {
  localStorage.setItem('fx_expenses', JSON.stringify([
    tx(2, 'rent', 18000), tx(3, 'groceries', 2400), tx(9, 'groceries', 1800),
  ]));
  const store: BudgetStore = {
    [CM]: { vals: { rent: 18000, groceries: 5000 }, income: '60000', n: '50', w: '30', s: '20' },
  };
  localStorage.setItem('fx_bb_data', JSON.stringify(store));
}

const renderInShell = (ui: React.ReactNode, enabled = true) =>
  render(<MemoryRouter><CurrencyProvider><AiProvider enabled={enabled}>{ui}</AiProvider></CurrencyProvider></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('AskAiButton', () => {
  it('names its subject in the accessible name, not just "Ask AI"', () => {
    renderInShell(<AskAiButton focus={{ kind: 'category', key: 'groceries', label: 'Groceries' }} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAccessibleName(/Groceries/);
  });

  it('keeps the accessible name when the visible label is dropped', () => {
    renderInShell(
      <AskAiButton focus={{ kind: 'category', key: 'travel', label: 'Travel' }} iconOnly />,
    );
    expect(screen.getByRole('button')).toHaveAccessibleName(/Travel/);
  });

  it('opens the assistant pointed at its own subject', async () => {
    renderInShell(<AskAiButton focus={{ kind: 'category', key: 'groceries', label: 'Groceries' }} />);
    fireEvent.click(screen.getByRole('button'));
    // The panel is a lazy chunk, so the first open resolves asynchronously.
    expect(await screen.findByTestId('panel')).toHaveTextContent('panel:category:Groceries');
  });

  it('renders nothing before the assistant is usable', () => {
    renderInShell(<AskAiButton focus={{ kind: 'heatmap' }} />, false);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing outside the tools shell rather than opening nothing', () => {
    render(<MemoryRouter><CurrencyProvider><AskAiButton focus={{ kind: 'heatmap' }} /></CurrencyProvider></MemoryRouter>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('the surfaces that carry one', () => {
  beforeEach(seed);

  const renderPage = () => renderInShell(<ExpensePage />);

  it('puts one on the month summary', async () => {
    renderPage();
    const card = screen.getByText(/Pacing & cash flow|Month summary/).closest('.card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /Financial Summary|summary/i }));
    expect(await screen.findByTestId('panel')).toHaveTextContent('panel:overview');
  });

  it('puts one on every category row, each naming its own category', async () => {
    renderPage();
    const card = screen.getByText('Category budgets').closest('.card') as HTMLElement;
    const groceries = within(card).getByRole('button', { name: /Groceries/ });
    fireEvent.click(groceries);
    expect(await screen.findByTestId('panel')).toHaveTextContent('panel:category:Groceries');
  });

  it('puts one on the heatmap and the timeline', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Analytics/ }));

    const heat = screen.getByText(/^Daily spending/).closest('.card') as HTMLElement;
    fireEvent.click(within(heat).getByRole('button', { name: /pattern/i }));
    expect(await screen.findByTestId('panel')).toHaveTextContent('panel:heatmap');

    const timeline = screen.getByText('Budget timeline').closest('.card') as HTMLElement;
    fireEvent.click(within(timeline).getByRole('button', { name: /timeline/i }));
    expect(await screen.findByTestId('panel')).toHaveTextContent('panel:timeline');
  });

  it('puts one on every transaction, naming the row rather than repeating "Ask AI"', async () => {
    renderPage();
    const ask = await screen.findByRole('button', { name: /Ask FinatriX AI about this transaction: Rent/i });
    fireEvent.click(ask);
    expect(await screen.findByTestId('panel')).toHaveTextContent('panel:transaction:Rent');
  });
});

describe('reachability', () => {
  beforeEach(seed);

  it('keeps the transaction entry point on the edit sheet, where a mobile tap lands', async () => {
    // The row's action group is display:none below 560px, so the row button
    // alone would make this a desktop-only feature.
    renderInShell(<ExpensePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Rent' }));
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: /Ask AI/i }));

    expect(await screen.findByTestId('panel')).toHaveTextContent('panel:transaction');
    // The form closes first: two stacked dialogs would trap focus in the wrong
    // one, and the answer is about the stored row, not the unsaved draft.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders no AI affordance at all before the cloud seed lands', () => {
    renderInShell(<ExpensePage />, false);
    expect(screen.queryByRole('button', { name: /Ask FinatriX AI/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Financial Summary/i })).not.toBeInTheDocument();
  });
});
