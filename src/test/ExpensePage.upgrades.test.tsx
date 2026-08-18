import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { CurrencyProvider } from '../tools/CurrencyContext';
import ExpensePage from '../tools/pages/ExpensePage';

function renderPage() {
  return render(
    <MemoryRouter>
      <CurrencyProvider>
        <ExpensePage />
      </CurrencyProvider>
    </MemoryRouter>
  );
}

function thisMonth(): string {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function seedMixedSections() {
  const m = thisMonth();
  localStorage.setItem('fx_expenses', JSON.stringify([
    { id: 'a', amount: 300, category: 'eating_out', date: `${m}-05`, merchant: 'Blue Bottle' },  // Wants
    { id: 'b', amount: 9000, category: 'rent', date: `${m}-01`, note: 'Rent' },                  // Needs
    { id: 'c', amount: 2000, category: 'stocks', date: `${m}-02`, note: 'SIP' },                 // Savings
    { id: 'd', amount: 800, category: 'groceries', date: `${m}-03`, merchant: 'DMart' },         // Needs
  ]));
}

describe('quick add — the one-line entry route', () => {
  beforeEach(() => { localStorage.clear(); cleanup(); });

  it('previews what will be logged before anything is saved', () => {
    renderPage();
    const input = screen.getByLabelText('Quick add');
    fireEvent.change(input, { target: { value: '340 lunch yesterday upi' } });

    // Nothing written yet…
    expect(localStorage.getItem('fx_expenses')).toBeNull();
    // …but everything understood is shown back.
    const help = screen.getByText('₹340').closest('p') as HTMLElement;
    expect(within(help).getByText('₹340')).toBeInTheDocument();
    expect(within(help).getByText('Yesterday')).toBeInTheDocument();
    expect(within(help).getByText('UPI')).toBeInTheDocument();
    expect(within(help).getByText(/Eating Out/)).toBeInTheDocument();
  });

  it('logs the parsed line on Enter and clears the field', () => {
    renderPage();
    const input = screen.getByLabelText('Quick add') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '340 lunch upi #work' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const stored = JSON.parse(localStorage.getItem('fx_expenses') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      amount: 340, category: 'eating_out', note: 'lunch', paymentMethod: 'UPI',
    });
    expect(stored[0].tags).toEqual(['work']);
    expect(input.value).toBe('');
  });

  it('records the quick-added spend in the change history like any other add', () => {
    renderPage();
    const input = screen.getByLabelText('Quick add');
    fireEvent.change(input, { target: { value: '340 lunch' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    const log = JSON.parse(localStorage.getItem('fx_expense_audit') || '[]');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: 'add', amount: 340 });
  });

  it('will not submit a line with no amount', () => {
    renderPage();
    const input = screen.getByLabelText('Quick add');
    fireEvent.change(input, { target: { value: 'lunch with the team' } });

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(localStorage.getItem('fx_expenses')).toBeNull();
  });

  it('falls back to the form\'s selected category when the line names none', () => {
    renderPage();
    const input = screen.getByLabelText('Quick add');
    fireEvent.change(input, { target: { value: '500 something obscure' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Rent is the first budget category, i.e. the form's default selection.
    const stored = JSON.parse(localStorage.getItem('fx_expenses') || '[]');
    expect(stored[0].category).toBe('rent');
  });
});

describe('category budgets — sorting', () => {
  beforeEach(() => { localStorage.clear(); cleanup(); });

  const card = () => screen.getByText('Category budgets').closest('.card') as HTMLElement;
  /** Category names in the order they are rendered. */
  const order = () =>
    Array.from(card().querySelectorAll('.bar[role="progressbar"]'))
      .map((b) => b.getAttribute('aria-label')?.replace(' spending against budget', ''));

  it('defaults to most-spent first, preserving the previous behaviour', () => {
    seedMixedSections();
    renderPage();
    expect(order()[0]).toBe('Rent'); // 9000, the largest
  });

  it('groups by Needs, Wants then Savings when asked', () => {
    seedMixedSections();
    renderPage();
    fireEvent.change(within(card()).getByLabelText('Sort'), { target: { value: 'section' } });

    // Needs (Rent 9000, Groceries 800), then Wants, then Savings.
    expect(order()).toEqual(['Rent', 'Groceries', 'Eating Out', 'Stocks / Equity']);
    // The sections are labelled — a grouped list with no headings is just a
    // differently ordered list.
    expect(within(card()).getByText('Needs')).toBeInTheDocument();
    expect(within(card()).getByText('Wants')).toBeInTheDocument();
    expect(within(card()).getByText('Savings')).toBeInTheDocument();
  });

  it('sorts alphabetically, and shows no section headings outside the section sort', () => {
    seedMixedSections();
    renderPage();
    fireEvent.change(within(card()).getByLabelText('Sort'), { target: { value: 'name' } });

    const names = order();
    expect(names).toEqual([...names].sort((a, b) => (a ?? '').localeCompare(b ?? '')));
    expect(within(card()).queryByText('Needs')).toBeNull();
  });

  it('remembers the choice across a remount', () => {
    seedMixedSections();
    renderPage();
    fireEvent.change(within(card()).getByLabelText('Sort'), { target: { value: 'name' } });
    cleanup();

    renderPage();
    expect((within(card()).getByLabelText('Sort') as HTMLSelectElement).value).toBe('name');
  });
});

describe('analytics — the empty state', () => {
  beforeEach(() => { localStorage.clear(); cleanup(); });

  it('shows what the tab becomes rather than only that it is empty', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Analytics/ }));

    expect(screen.getByText('Your analytics start here')).toBeInTheDocument();
    // Named milestones, so "when does this get useful?" has an answer.
    expect(screen.getByText(/Month-end forecast and pacing/)).toBeInTheDocument();
    expect(screen.getByText(/Recurring detection/)).toBeInTheDocument();
    // The sample chart is explicitly labelled as not real.
    expect(screen.getByText(/Example only/)).toBeInTheDocument();
  });

  it('sends the user to the add form instead of describing where it is', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Analytics/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Log your first expense' }));

    // Back on Overview, where the quick-add field lives.
    expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Quick add')).toBeInTheDocument();
  });

  it('gives way to the real analytics as soon as there is data', () => {
    seedMixedSections();
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /Analytics/ }));
    expect(screen.queryByText('Your analytics start here')).toBeNull();
    expect(screen.getByText(/Avg per month/i)).toBeInTheDocument();
  });
});

/**
 * The ⌘K palette does not log anything itself — it forwards the line the user
 * typed to this page as `?add=`. What matters here is that the hand-off lands
 * in the field (still unsaved, still editable) and then gets out of the URL.
 */
describe('hand-off from the command palette', () => {
  beforeEach(() => { localStorage.clear(); cleanup(); });

  function Here() {
    const { search } = useLocation();
    return <span data-testid="search">{search}</span>;
  }

  function renderWithAdd(line: string) {
    return render(
      <MemoryRouter initialEntries={[`/tools/expenses?add=${encodeURIComponent(line)}`]}>
        <CurrencyProvider>
          <Here />
          <ExpensePage />
        </CurrencyProvider>
      </MemoryRouter>
    );
  }

  it('types the handed-over line into quick add without saving it', () => {
    renderWithAdd('340 lunch yesterday upi');
    const input = screen.getByLabelText('Quick add') as HTMLInputElement;
    expect(input.value).toBe('340 lunch yesterday upi');
    // Previewed, not committed — the user still has to confirm.
    expect(screen.getByText('₹340')).toBeInTheDocument();
    expect(localStorage.getItem('fx_expenses')).toBeNull();
  });

  it('commits on Enter through the ordinary quick-add path', () => {
    renderWithAdd('340 lunch upi');
    fireEvent.keyDown(screen.getByLabelText('Quick add'), { key: 'Enter' });
    const stored = JSON.parse(localStorage.getItem('fx_expenses') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ amount: 340, note: 'lunch', paymentMethod: 'UPI' });
  });

  it('consumes the parameter, so a refresh does not re-seed the field', () => {
    renderWithAdd('340 lunch');
    expect(screen.getByTestId('search').textContent).toBe('');
  });

  it('opens the quick-add line even when the hand-off carries no text', () => {
    render(
      <MemoryRouter initialEntries={['/tools/expenses?add=']}>
        <CurrencyProvider><ExpensePage /></CurrencyProvider>
      </MemoryRouter>
    );
    const input = screen.getByLabelText('Quick add') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('leaves the field alone when no hand-off was made', () => {
    renderPage();
    expect((screen.getByLabelText('Quick add') as HTMLInputElement).value).toBe('');
  });
});
