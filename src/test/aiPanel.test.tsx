import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within, cleanup } from '@testing-library/react';
import { Markdown } from '../tools/ui/Markdown';
import AiPanel from '../tools/ui/AiPanel';
import { CurrencyProvider } from '../tools/CurrencyContext';

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
    return h.completion;
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

  it('renders an assistant-supplied chart as accessible markup, not a canvas', async () => {
    reply({
      answer: 'Here it is.',
      chart: {
        title: 'Top categories', unit: 'currency',
        points: [{ label: 'Groceries', value: 550 }, { label: 'Dining', value: 120 }],
      },
    });
    const { container } = renderPanel();
    await ask('Show my top categories');

    await waitFor(() => expect(screen.getByText('Top categories')).toBeInTheDocument());
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('reports a failure as a message instead of failing silently', async () => {
    h.completion = { ok: false, kind: 'limit', message: 'Daily AI limit reached. Try again tomorrow.' };
    renderPanel();
    await ask('How much did I spend?');
    await waitFor(() =>
      expect(screen.getByText(/Daily AI limit reached/)).toBeInTheDocument());
  });

  it('explains itself to a signed-out visitor and disables the composer', async () => {
    h.user = null;
    renderPanel();
    expect(screen.getByText(/Sign in to use FinatriX AI/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Ask FinatriX AI/i)).toBeDisabled();
    // The composer cannot take focus, so the dialog itself must — otherwise a
    // screen reader is left outside the dialog entirely.
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
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
});
