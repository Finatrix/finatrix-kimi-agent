import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AiPanel from '../tools/ui/AiPanel';
import { CurrencyProvider } from '../tools/CurrencyContext';
import { loadExpenses } from '../tools/lib/expense';
import { ymdLocal } from '../lib/date';
import type { ListenOutcome, VoiceEngine } from '../lib/voice/engine';

/**
 * Step 3.2 inside the panel: a message that asks for an action gets a confirm
 * card, nothing is saved until Save is tapped, Undo reverses it, and anything
 * the picker cannot act on is answered by the chat exactly as before.
 */

const h = vi.hoisted(() => ({
  plan: '' as string,
  pickerOk: true,
  tasks: [] as string[],
  heard: [] as ListenOutcome[],
  spoken: [] as string[],
}));

vi.mock('../context/AuthContext', async (importOriginal) => {
  const real = await importOriginal<typeof import('../context/AuthContext')>();
  return {
    ...real,
    useAuth: () => ({
      user: { id: 'user-1' }, session: null, loading: false, configured: true,
      signUp: vi.fn(), signIn: vi.fn(), signInWithProvider: vi.fn(),
      signOut: vi.fn(), resendVerification: vi.fn(), resetPassword: vi.fn(),
    }),
  };
});

vi.mock('../lib/ai/transport', () => ({
  requestCompletion: async (req: { task: string }) => {
    h.tasks.push(req.task);
    if (req.task === 'money-action') {
      return h.pickerOk
        ? { ok: true, model: 'picker', ms: 1, promptTokens: 1, completionTokens: 1, content: h.plan }
        : { ok: false, kind: 'failed', message: 'Update the app to use AI.' };
    }
    return {
      ok: true, model: 'test-model', ms: 1, promptTokens: 1, completionTokens: 1,
      content: JSON.stringify({ mode: 'general', headline: 'Chat answered.', answer: '- From the chat.' }),
    };
  },
}));

const engine: VoiceEngine = {
  canListen: () => true,
  prime: vi.fn(),
  listen: async (_lang, onPartial) => {
    const next = h.heard.shift() ?? { kind: 'silence' };
    if (next.kind === 'heard') onPartial(next.text);
    return next;
  },
  cancelListening: vi.fn(),
  speak: async (text) => { h.spoken.push(text); return 'done'; },
  cancelSpeaking: vi.fn(),
};

vi.mock('../lib/voice/engine', () => ({
  deviceCanListen: () => true,
  loadVoiceEngine: () => Promise.resolve(engine),
}));

const onClose = vi.fn();

function renderPanel() {
  return render(
    <CurrencyProvider>
      <AiPanel id="fx-ai-panel" onClose={onClose} />
    </CurrencyProvider>,
  );
}

function ask(text: string) {
  const box = screen.getByRole('textbox');
  fireEvent.change(box, { target: { value: text } });
  fireEvent.submit(box.closest('form')!);
}

const yesterday = () => {
  const d = new Date();
  return ymdLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
};

beforeEach(() => {
  cleanup();
  localStorage.clear();
  localStorage.setItem('fx_ai_consent', '1');
  localStorage.setItem('fx_currency', 'INR');
  localStorage.setItem('fx_market', 'IN');
  h.plan = '';
  h.pickerOk = true;
  h.tasks = [];
  h.heard = [];
  h.spoken = [];
  onClose.mockClear();
});

describe('FinatriX AI actions', () => {
  it('shows a confirm card, saves only on Save, and Undo removes the entry', async () => {
    h.plan = JSON.stringify({ action: 'log_expense', amount: '₹450', category: 'eating_out', note: 'lunch', day: 'yesterday' });
    renderPanel();
    ask('Add ₹450 for lunch yesterday');

    const save = await screen.findByRole('button', { name: 'Save' });
    expect(screen.getByRole('group', { name: 'Log spend' })).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toHaveValue('eating_out');
    expect(screen.getByLabelText('Date')).toHaveValue(yesterday());
    // Nothing is written by the card appearing.
    expect(loadExpenses()).toEqual([]);
    expect(h.tasks).toEqual(['money-action']);

    fireEvent.click(save);
    const rows = loadExpenses();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 450, category: 'eating_out', date: yesterday(), note: 'lunch' });
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toHaveFocus();

    fireEvent.click(undo);
    expect(loadExpenses()).toEqual([]);
    expect(screen.getByText(/Undone/)).toBeInTheDocument();
  });

  it('Cancel saves nothing', async () => {
    h.plan = JSON.stringify({ action: 'log_expense', amount: '450', category: 'eating_out' });
    renderPanel();
    ask('add 450 lunch');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Cancelled. Nothing was saved.')).toBeInTheDocument();
    expect(loadExpenses()).toEqual([]);
  });

  it('refuses an amount the user did not say', async () => {
    h.plan = JSON.stringify({ action: 'log_expense', amount: '5000', category: 'eating_out' });
    renderPanel();
    ask('add lunch');
    expect(await screen.findByText(/I didn’t catch an amount/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('a question goes to the chat, with the picker asked first only when it could be an action', async () => {
    h.plan = JSON.stringify({ action: 'none' });
    renderPanel();
    ask('What did I spend 500 on?');
    expect(await screen.findByText('Chat answered.')).toBeInTheDocument();
    expect(h.tasks).toEqual(['money-action', 'money-chat']);

    h.tasks = [];
    ask('What is an index fund?');
    await waitFor(() => expect(h.tasks).toEqual(['money-chat']));
  });

  it('falls back to the chat when the picker is unavailable', async () => {
    h.pickerOk = false;
    renderPanel();
    ask('add 450 lunch');
    expect(await screen.findByText('Chat answered.')).toBeInTheDocument();
    expect(loadExpenses()).toEqual([]);
  });

  it('opens a screen and closes the panel', async () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, assign } });
    try {
      h.plan = JSON.stringify({ action: 'open_screen', screen: 'budget' });
      renderPanel();
      ask('open my budget');
      await waitFor(() => expect(assign).toHaveBeenCalledWith('/tools/budget'));
      expect(onClose).toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('runs a calculator and shows the engine’s figures', async () => {
    h.plan = JSON.stringify({ action: 'run_calculator', calculator: 'sip', monthly: '10,000', years: '15' });
    renderPanel();
    ask('If I invest 10,000 a month for 15 years what do I get?');
    expect(await screen.findByRole('group', { name: 'Investment growth' })).toBeInTheDocument();
    // Moderate path, 12%: the worked example in calculators.ts (₹50,45,760).
    const figures = Array.from(document.querySelectorAll('.fx-act-rows.is-strong dd')).map((d) => d.textContent);
    // The Goal Planner's three paths, in the panel's money format.
    expect(figures).toHaveLength(3);
    expect(figures[1]).toBe('₹50.46 L');
  });

  it('by voice: the card is read aloud and nothing is saved until Save is tapped', async () => {
    localStorage.setItem('fx_voice_lang', 'en-IN');
    h.plan = JSON.stringify({ action: 'log_expense', amount: '450', category: 'eating_out', note: 'lunch' });
    h.heard = [{ kind: 'heard', text: 'add 450 for lunch' }, { kind: 'silence' }];
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Talk hands-free' }));
    await waitFor(() => expect(h.spoken).toHaveLength(1));
    expect(h.spoken[0]).toMatch(/Log ₹450\.00 for Eating Out, today\? Check the card and tap Save\./);
    expect(loadExpenses()).toEqual([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(loadExpenses()).toHaveLength(1);
  });
  it('a multi-step plan shows one card per step, reads them all aloud, and each saves on its own tap (step 3.9)', async () => {
    localStorage.setItem('fx_voice_lang', 'en-IN');
    h.plan = JSON.stringify({ action: 'plan', steps: [
      { action: 'log_expense', amount: '450', category: 'eating_out', note: 'lunch' },
      { action: 'log_expense', amount: '200', category: 'transport', note: 'taxi' },
    ] });
    h.heard = [{ kind: 'heard', text: 'add 450 for lunch and 200 for a taxi' }, { kind: 'silence' }];
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Talk hands-free' }));
    await waitFor(() => expect(h.spoken).toHaveLength(1));
    expect(h.spoken[0]).toMatch(/^1 of 2\. Log ₹450\.00 for Eating Out.*2 of 2\. Log ₹200\.00 for Transport/);
    const saves = await screen.findAllByRole('button', { name: 'Save' });
    expect(saves).toHaveLength(2);
    expect(loadExpenses()).toEqual([]);
    fireEvent.click(saves[1]);
    expect(loadExpenses().map((e) => e.amount)).toEqual([200]);
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1);
  });
});
