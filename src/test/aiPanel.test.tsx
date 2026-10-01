import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within, cleanup, act } from '@testing-library/react';
import { Markdown } from '../tools/ui/Markdown';
import AiPanel from '../tools/ui/AiPanel';
import { CurrencyProvider } from '../tools/CurrencyContext';
import { SUGGESTED_PROMPTS } from '../tools/ai/prompts';
import { currentMonth } from '../tools/lib/month';

/**
 * The assistant's rendering surface. Two things are load-bearing here: model
 * output can never become live markup, and the answer on screen is the answer
 * the transport returned — nothing invented in the UI layer.
 */

const h = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'a@b.invalid', user_metadata: {} } as { id: string } | null,
  completion: { ok: true, content: '', model: 'test-model', ms: 1, promptTokens: 1, completionTokens: 1 } as
    | { ok: true; content: string; model: string; ms: number; promptTokens: number; completionTokens: number }
    | { ok: false; kind: string; message: string },
  deferred: null as Promise<unknown> | null,
  lastRequest: null as null | { system: string; user: string; task: string },
}));

vi.mock('../context/AuthContext', async (importOriginal) => {
  const real = await importOriginal<typeof import('../context/AuthContext')>();
  return {
    ...real,
    useAuth: () => ({
      user: h.user, session: null, loading: false, configured: true,
      signUp: vi.fn(), signIn: vi.fn(), signInWithProvider: vi.fn(),
      signOut: vi.fn(), resendVerification: vi.fn(), resetPassword: vi.fn(),
    }),
  };
});

vi.mock('../lib/ai/transport', () => ({
  requestCompletion: async (req: { system: string; user: string; task: string }) => {
    h.lastRequest = req;
    return h.deferred ?? h.completion;
  },
}));

function reply(payload: unknown) {
  h.completion = {
    ok: true, content: JSON.stringify(payload), model: 'test-model',
    ms: 1, promptTokens: 1, completionTokens: 1,
  };
}

function renderPanel(props: Partial<React.ComponentProps<typeof AiPanel>> = {}) {
  return render(
    <CurrencyProvider>
      <AiPanel id="fx-ai-panel" onClose={() => {}} {...props} />
    </CurrencyProvider>,
  );
}

const ask = async (question: string) => {
  fireEvent.change(screen.getByLabelText(/Ask FinatriX AI/i), { target: { value: question } });
  fireEvent.click(screen.getByLabelText('Send question'));
};

describe('Markdown', () => {
  it('renders headings, lists and emphasis as real elements', () => {
    render(<Markdown text={'## Your month\n\n- **Groceries**: 550\n- *Dining*: 120'} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Your month' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Groceries').tagName).toBe('STRONG');
    expect(screen.getByText('Dining').tagName).toBe('EM');
  });

  it('renders a markdown table as a table', () => {
    render(<Markdown text={'| Category | Spent |\n| --- | --- |\n| Groceries | 550 |\n| Dining | 120 |'} />);
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Category' })).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2
  });

  it('never turns model text into live markup', () => {
    const { container } = render(
      <Markdown text={'Careful <script>alert(1)</script> and <b>bold</b> and <img src=x>.'} />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    // It survives as visible text instead of vanishing.
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('shows an unsupported construct as text rather than dropping it', () => {
    const { container } = render(<Markdown text={'A [link](https://example.com) here'} />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('[link](https://example.com)');
  });
});

describe('AiPanel', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    // Permission to send to the AI provider is its own concern (aiConsent.test.tsx).
    localStorage.setItem('fx_ai_consent', '1');
    h.user = { id: 'user-1' };
    h.lastRequest = null;
    reply({ answer: 'You spent 670 this month.' });
  });

  it('opens as a labelled modal dialog with the composer focused', async () => {
    renderPanel();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading', { name: 'FinatriX AI' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Ask FinatriX AI/i)).toHaveFocus());
  });

  it('offers starting prompts before any conversation exists', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Summarise my month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create a monthly review/ })).toBeInTheDocument();
  });

  it('shows that questions need not be about the user’s own data', () => {
    // The chips are the only place the general-knowledge half of the assistant
    // is visible before somebody guesses it exists, so several have to be
    // questions the DATA block could never answer.
    //
    // Asserted on the SHAPE of the list rather than on one exact sentence: the
    // wording is copy and will be rewritten, while "at least a third of the
    // opening chips are not about this user's ledger" is the contract that
    // actually matters and the one worth failing a build over.
    const general = SUGGESTED_PROMPTS.filter((p) => !/\bmy\b|\bI\b/i.test(p));
    expect(general.length).toBeGreaterThanOrEqual(3);

    renderPanel();
    for (const prompt of general) {
      expect(screen.getByRole('button', { name: prompt })).toBeInTheDocument();
    }
  });

  it('answers a question and shows the model’s reply', async () => {
    reply({ answer: '## Result\nYou spent **670**.', followUps: ['And last month?'] });
    renderPanel();
    await ask('How much did I spend?');

    await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: 'Result' })).toBeInTheDocument());
    expect(screen.getByText('670')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'And last month?' })).toBeInTheDocument();
  });

  it('sends the question inside its fence, with the data block alongside', async () => {
    renderPanel();
    await ask('How much did I spend?');
    await waitFor(() => expect(h.lastRequest).not.toBeNull());

    expect(h.lastRequest!.task).toBe('money-chat');
    expect(h.lastRequest!.user).toMatch(/<question>\nHow much did I spend\?\n<\/question>/);
    expect(h.lastRequest!.user).toMatch(/<data>/);
    expect(h.lastRequest!.system).toMatch(/NEVER invent/);
  });

  /** Two transactions this month, so a chart of them is a chart of real data. */
  const seedLedger = () => localStorage.setItem('fx_expenses', JSON.stringify([
    { id: 'a', date: `${currentMonth()}-01`, category: 'groceries', amount: 550 },
    { id: 'b', date: `${currentMonth()}-01`, category: 'eating_out', amount: 120 },
  ]));

  it('renders an assistant-supplied chart as accessible markup, not a canvas', async () => {
    seedLedger();
    reply({
      answer: 'Here it is.',
      chart: {
        title: 'Top categories', unit: 'currency',
        points: [{ label: 'Groceries', value: 550, source: 'data.categories.0.spent' }, { label: 'Dining', value: 120, source: 'data.categories.1.spent' }],
      },
    });
    renderPanel();
    await ask('Show my top categories');

    await waitFor(() => expect(screen.getByText('Top categories')).toBeInTheDocument());
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    // The panel is portalled to <body>: asking the render container would find
    // no canvas whatever the chart was drawn with.
    expect(document.querySelector('.fx-ai-chart canvas')).toBeNull();
    expect(document.querySelectorAll('.fx-ai-chart-row')).toHaveLength(2);
  });

  it('withholds a chart whose values are not in the user’s data', async () => {
    // Drawn in the user's currency, an invented bar is indistinguishable from a
    // real one. The whole chart is withheld and the answer says so.
    seedLedger();
    reply({
      answer: 'Here it is.',
      chart: {
        title: 'Top categories', unit: 'currency',
        points: [{ label: 'Groceries', value: 550, source: 'data.categories.0.spent' }, { label: 'Dining', value: 4800 }],
      },
    });
    renderPanel();
    await ask('Show my top categories');

    await waitFor(() => expect(screen.getByText(/chart was left out/)).toBeInTheDocument());
    expect(screen.queryByText('Top categories')).toBeNull();
  });

  it('names the amounts in an answer that are not in the user’s records', async () => {
    seedLedger();
    reply({ answer: 'Groceries came to ₹550. Try capping dining at ₹2,000 next month.' });
    renderPanel();
    await ask('Where can I save?');

    await waitFor(() => expect(screen.getByText(/1 of 2 amounts trace to your records/)).toBeInTheDocument());
    expect(screen.getByText(/Not in them: ₹2,000/)).toBeInTheDocument();
  });

  it('leads with a headline and shows key figures as tiles', async () => {
    seedLedger();
    reply({
      headline: 'Groceries are your biggest cost this month.',
      highlights: [
        { label: 'Groceries', value: 550, source: 'data.categories.0.spent', unit: 'currency', tone: 'neutral' },
        { label: 'Eating out', value: 120, source: 'data.categories.1.spent', unit: 'currency', tone: 'good' },
      ],
      answer: '- Groceries lead.\n- **Next:** plan one shop a week.',
    });
    renderPanel();
    await ask('What costs me most?');

    await waitFor(() => expect(screen.getByText('Groceries are your biggest cost this month.')).toBeInTheDocument());
    const tile = screen.getByText('Eating out').closest('.fx-ai-tile')!;
    expect(tile).toHaveClass('is-good');
    expect(tile.textContent).toMatch(/120/);
  });

  it('withholds a tile whose value is not in the data, and says so', async () => {
    seedLedger();
    reply({
      answer: 'x',
      highlights: [
        { label: 'Groceries', value: 550, source: 'data.categories.0.spent', unit: 'currency' },
        { label: 'Invented', value: 9999, unit: 'currency' },
      ],
    });
    renderPanel();
    await ask('Summarise');

    await waitFor(() => expect(screen.getByText(/figure tile was left out/)).toBeInTheDocument());
    expect(screen.queryByText('Invented')).toBeNull();
    expect(screen.getByText('Groceries', { selector: 'dt' })).toBeInTheDocument();
  });

  it('draws a donut with a legend a screen reader can read', async () => {
    seedLedger();
    reply({
      answer: 'x',
      chart: { type: 'donut', title: 'Where it went', unit: 'currency', points: [{ label: 'Groceries', value: 550, source: 'data.categories.0.spent' }, { label: 'Dining', value: 120, source: 'data.categories.1.spent' }] },
    });
    renderPanel();
    await ask('Split?');

    // The panel is portalled to <body>, so query the document, not the render container.
    await waitFor(() => expect(screen.getByText('Where it went')).toBeInTheDocument());
    expect(document.querySelectorAll('.fx-ai-donut-seg')).toHaveLength(2);
    expect(screen.getByText(/82%/)).toBeInTheDocument(); // 550 of 670
  });

  it('draws a trend line with a text alternative', async () => {
    seedLedger();
    reply({
      answer: 'x',
      chart: { type: 'line', title: 'Trend', unit: 'currency', points: [{ label: 'A', value: 120, source: 'data.categories.1.spent' }, { label: 'B', value: 550, source: 'data.categories.0.spent' }, { label: 'C', value: 670, source: 'data.spentOnNeedsAndWants' }] },
    });
    renderPanel();
    await ask('Trend?');

    await waitFor(() => expect(screen.getByRole('img', { name: /Line chart: A .*120.*C .*670/ })).toBeInTheDocument());
  });

  it('labels a general answer’s chart as an illustration', async () => {
    reply({
      mode: 'general',
      answer: 'Compounding speeds up over time.',
      chart: { type: 'line', title: 'Growth', unit: 'number', points: [{ label: 'Year 1', value: 100 }, { label: 'Year 10', value: 259 }] },
    });
    renderPanel();
    await ask('How does compounding work?');

    await waitFor(() => expect(screen.getByText('Illustration — not your data')).toBeInTheDocument());
  });

  it('collapses a long answer behind a disclosure button', async () => {
    reply({ mode: 'general', answer: Array.from({ length: 40 }, (_, i) => `- Point number ${i} explains one more thing.`).join('\n') });
    renderPanel();
    await ask('Explain it all');

    const more = await screen.findByRole('button', { name: 'Show the full answer' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('says so when every amount traces to the records', async () => {
    seedLedger();
    reply({ answer: 'Groceries were ₹550 and dining ₹120, so ₹670 in all.' });
    renderPanel();
    await ask('What did I spend?');

    await waitFor(() => expect(screen.getByText(/All 3 amounts trace to your records/)).toBeInTheDocument());
  });

  it('reports a failure as a message instead of failing silently', async () => {
    h.completion = { ok: false, kind: 'limit', message: 'Daily AI limit reached. Try again tomorrow.' };
    renderPanel();
    await ask('How much did I spend?');
    await waitFor(() =>
      expect(screen.getByText(/Daily AI limit reached/)).toBeInTheDocument());
  });

  it('offers local setup help to guests without sending a financial request', async () => {
    h.user = null;
    renderPanel();
    expect(screen.getByText(/Sign in for AI answers/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Ask FinatriX AI/i)).toBeEnabled();
    await waitFor(() => expect(screen.getByLabelText(/Ask FinatriX AI/i)).toHaveFocus());
    await ask('How do I get started?');
    expect(screen.getByText(/Start with Set up your month/)).toBeInTheDocument();
    expect(h.lastRequest).toBeNull();
    await ask('What did I spend on food?');
    expect(screen.getByText(/I can help you find your way/)).toBeInTheDocument();
    expect(h.lastRequest).toBeNull();
  });

  it('persists the conversation for the signed-in user and restores it', async () => {
    const first = renderPanel();
    await ask('How much did I spend?');
    await waitFor(() => expect(screen.getByText(/You spent 670/)).toBeInTheDocument());
    first.unmount();

    renderPanel();
    expect(screen.getByText('How much did I spend?')).toBeInTheDocument();
    expect(screen.getByText(/You spent 670/)).toBeInTheDocument();
  });

  it('never shows one account’s conversation to another', async () => {
    const first = renderPanel();
    await ask('my rent is too high');
    await waitFor(() => expect(screen.getByText(/You spent 670/)).toBeInTheDocument());
    first.unmount();

    h.user = { id: 'user-2' };
    renderPanel();
    expect(screen.queryByText('my rent is too high')).not.toBeInTheDocument();
    // And the previous account's transcript is gone from the device entirely.
    expect(localStorage.getItem('fx_ai_chat_user-1')).toBeNull();
  });

  it('clears history only after a confirmation', async () => {
    renderPanel();
    await ask('How much did I spend?');
    await waitFor(() => expect(screen.getByText(/You spent 670/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText(/You spent 670/)).toBeInTheDocument(); // not yet

    fireEvent.click(screen.getByRole('button', { name: 'Delete history' }));
    await waitFor(() => expect(screen.queryByText(/You spent 670/)).not.toBeInTheDocument());
    expect(localStorage.getItem('fx_ai_chat_user-1')).toBeNull();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <CurrencyProvider>
        <AiPanel id="fx-ai-panel" onClose={onClose} />
      </CurrencyProvider>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('sends on Enter and keeps Shift+Enter for a newline', async () => {
    renderPanel();
    const input = screen.getByLabelText(/Ask FinatriX AI/i);

    fireEvent.change(input, { target: { value: 'line one' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(h.lastRequest).toBeNull();

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(h.lastRequest).not.toBeNull());
  });

  it('will not send an empty question', () => {
    renderPanel();
    expect(screen.getByLabelText('Send question')).toBeDisabled();
  });
});

/**
 * Opening the assistant from a figure. The point of a focus is that the user
 * never has to re-describe what they were just looking at — so the subject has
 * to reach both the screen and the prompt.
 */
describe('AiPanel — opened from a figure', () => {
  const groceries = { kind: 'category', key: 'groceries', label: 'Groceries' } as const;

  beforeEach(() => {
    cleanup();
    localStorage.clear();
    // Permission to send to the AI provider is its own concern (aiConsent.test.tsx).
    localStorage.setItem('fx_ai_consent', '1');
    h.user = { id: 'user-1' };
    h.lastRequest = null;
    reply({ answer: 'Groceries are steady.' });
  });

  it('names the subject in the header instead of the generic title', () => {
    renderPanel({ focus: groceries, openedAt: 1 });
    expect(screen.getByRole('heading', { name: 'Groceries' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Groceries');
  });

  it('offers questions about that subject rather than the generic set', () => {
    renderPanel({ focus: groceries, openedAt: 1 });
    expect(screen.getByRole('button', { name: 'Compare Groceries to previous months' })).toBeInTheDocument();
    // The generic starting prompts and the whole-month review would bury them.
    expect(screen.queryByRole('button', { name: 'Summarise my month' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create a monthly review/ })).not.toBeInTheDocument();
  });

  it('sends the subject to the model in its own fence', async () => {
    renderPanel({ focus: groceries, openedAt: 1 });
    await ask('Why is this going up?');
    await waitFor(() => expect(h.lastRequest).not.toBeNull());

    expect(h.lastRequest!.user).toMatch(/<focus>[\s\S]*Groceries[\s\S]*<\/focus>/);
    // The whole-month data block is still there — a focus narrows attention,
    // it does not replace the context around it.
    expect(h.lastRequest!.user).toMatch(/<data>/);
  });

  it('keeps the generic title when opened from the plain launcher', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'FinatriX AI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Summarise my month' })).toBeInTheDocument();
  });

  it('re-primes when a second figure is opened behind the panel', () => {
    const { rerender } = renderPanel({ focus: groceries, openedAt: 1 });
    expect(screen.getByRole('heading', { name: 'Groceries' })).toBeInTheDocument();

    rerender(
      <CurrencyProvider>
        <AiPanel
          id="fx-ai-panel"
          onClose={() => {}}
          focus={{ kind: 'heatmap' }}
          openedAt={2}
        />
      </CurrencyProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Daily spending pattern' })).toBeInTheDocument();
  });

  it('still offers the subject’s questions when a conversation already exists', async () => {
    // The empty state carries them only while the transcript is empty. A
    // returning user pressing "Analyse Category" would otherwise get a subject
    // line and nothing to press — left to type out the question by hand, which
    // is the one thing opening from a figure exists to save them from.
    const { rerender } = renderPanel({ openedAt: 1 });
    await ask('How much did I spend?');
    await waitFor(() => expect(screen.getByText('Groceries are steady.')).toBeInTheDocument());

    rerender(
      <CurrencyProvider>
        <AiPanel id="fx-ai-panel" onClose={() => {}} focus={groceries} openedAt={2} />
      </CurrencyProvider>,
    );

    expect(screen.getByRole('button', { name: 'Suggest ways to reduce Groceries' })).toBeInTheDocument();
  });

  it('drops the questions once one has been asked, rather than re-offering them', async () => {
    renderPanel({ focus: groceries, openedAt: 1 });
    const prompt = screen.getByRole('button', { name: 'Compare Groceries to previous months' });
    fireEvent.click(prompt);

    await waitFor(() => expect(screen.getByText('Groceries are steady.')).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: 'Compare Groceries to previous months' }),
    ).not.toBeInTheDocument();
  });
});

describe('AiPanel — how much the answer stands on', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    // Permission to send to the AI provider is its own concern (aiConsent.test.tsx).
    localStorage.setItem('fx_ai_consent', '1');
    h.user = { id: 'user-1' };
    reply({ answer: 'You spent 670 this month.' });
  });

  it('states the evidence behind every answer, with its reason', async () => {
    renderPanel();
    await ask('How much did I spend?');

    // Nothing is logged in this test's store, so the honest reading is "low".
    await waitFor(() => expect(screen.getByText(/Low confidence/)).toBeInTheDocument());
    expect(screen.getByText(/No transactions have been logged yet/)).toBeInTheDocument();
  });

  it('keeps the badge with the turn it was measured for', async () => {
    const first = renderPanel();
    await ask('How much did I spend?');
    await waitFor(() => expect(screen.getByText(/Low confidence/)).toBeInTheDocument());
    first.unmount();

    // Restored from storage, not recomputed — a later transaction must not
    // silently upgrade an old answer's badge.
    renderPanel();
    expect(screen.getByText(/Low confidence/)).toBeInTheDocument();
  });

  it('puts no badge on a failure notice', async () => {
    h.completion = { ok: false, kind: 'network', message: '' };
    renderPanel();
    await ask('How much did I spend?');
    await waitFor(() => expect(screen.getByText(/Could not reach FinatriX AI/)).toBeInTheDocument());
    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
  });

  it('puts no badge on an answer that did not read the user’s data', async () => {
    // The badge rates their records. This account is empty, so an unscoped
    // badge would stamp "Low confidence — no transactions logged" onto a
    // correct textbook explanation that never depended on their records.
    reply({ mode: 'general', answer: 'Compounding is interest earned on interest.' });
    renderPanel();
    await ask('How does compounding work?');
    await waitFor(() =>
      expect(screen.getByText(/interest earned on interest/)).toBeInTheDocument());
    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
  });
});


describe('AiPanel — instant intelligence and session isolation', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    // Permission to send to the AI provider is its own concern (aiConsent.test.tsx).
    localStorage.setItem('fx_ai_consent', '1');
    h.user = { id: 'user-1' };
    h.lastRequest = null;
    h.deferred = null;
    reply({ answer: 'Private response from the previous account.' });
  });

  it('shows a financial briefing without calling the AI service', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Get my instant financial briefing' }));
    await waitFor(() => expect(screen.getByText('Calculated on your device · no AI request')).toBeInTheDocument());
    expect(screen.getByText('Complete your records', { selector: 'h3' })).toBeInTheDocument();
    expect(h.lastRequest).toBeNull();
  });

  it('reads the month selected on the originating page', async () => {
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: 'old', date: '2025-02-01', category: 'groceries', amount: 765 },
      { id: 'now', date: `${currentMonth()}-01`, category: 'groceries', amount: 999 },
    ]));
    renderPanel({ focus: { kind: 'overview', month: '2025-02' } });
    await ask('Explain my spending');
    await waitFor(() => expect(h.lastRequest).not.toBeNull());
    const data = JSON.parse(h.lastRequest!.user.match(/<data>\n([\s\S]*?)\n<\/data>/)![1]);
    expect(data.month).toBe('2025-02');
    expect(data.spentOnNeedsAndWants).toBe(765);
    expect(data.projectedMonthEnd).toBeNull();
  });

  it('drops a pending response after switching accounts', async () => {
    let resolve!: (value: unknown) => void;
    h.deferred = new Promise((r) => { resolve = r; });
    const panel = renderPanel();
    await ask('Explain my spending');
    await waitFor(() => expect(h.lastRequest).not.toBeNull());
    h.user = { id: 'user-2' };
    panel.rerender(<CurrencyProvider><AiPanel id="fx-ai-panel" onClose={() => {}} /></CurrencyProvider>);
    await act(async () => { resolve(h.completion); });
    expect(screen.queryByText('Private response from the previous account.')).not.toBeInTheDocument();
    expect(localStorage.getItem('fx_ai_chat_user-1')).toBeNull();
    expect(localStorage.getItem('fx_ai_chat_user-2')).toBeNull();
    expect(screen.getByLabelText('Send question')).toBeDisabled();
  });

  it('does not save a response after the panel closes', async () => {
    let resolve!: (value: unknown) => void;
    h.deferred = new Promise((r) => { resolve = r; });
    const panel = renderPanel();
    await ask('Explain my spending');
    panel.unmount();
    localStorage.removeItem('fx_ai_chat_user-1');
    await act(async () => { resolve(h.completion); });
    expect(localStorage.getItem('fx_ai_chat_user-1')).toBeNull();
  });
});
