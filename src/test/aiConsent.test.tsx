import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

/**
 * Nothing reaches a third-party AI without the user's explicit permission
 * (App Review Guideline 5.1.2(i)). Three layers, each pinned here:
 *
 *  1. the transport refuses a signed-in request that has no permission, and
 *     sends nothing — the structural guarantee every caller inherits;
 *  2. the AI panel asks before the first question, and a "no" loses nothing;
 *  3. statement import asks before naming merchants, instead of reporting the
 *     refusal as an error.
 */

const h = vi.hoisted(() => ({
  token: 'token' as string | null,
  invoked: 0,
  user: { id: 'user-1' } as { id: string } | null,
  requests: [] as Array<{ task: string; user: string }>,
}));

describe('transport', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    h.token = 'token';
    h.invoked = 0;
    vi.doMock('../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { auth: { getUser: async () => ({ data: { user: null } }) } },
    }));
    vi.doMock('../lib/functions', () => ({
      readAccessToken: async () => h.token,
      invokeAuthed: async () => {
        h.invoked += 1;
        return { data: { content: '{"answer":"ok"}', model: 'm' }, error: null, reason: null };
      },
    }));
  });

  it('sends nothing for a signed-in user who has not allowed it', async () => {
    const { requestCompletion } = await import('../lib/ai/transport');
    const result = await requestCompletion({ task: 'chat', system: 's', user: 'u' });
    expect(result).toEqual({ ok: false, kind: 'no-consent', message: '' });
    expect(h.invoked).toBe(0);
  });

  it('tells a guest to sign in rather than asking for permission they cannot use', async () => {
    h.token = null;
    const { requestCompletion } = await import('../lib/ai/transport');
    const result = await requestCompletion({ task: 'chat', system: 's', user: 'u' });
    expect(result).toMatchObject({ ok: false, kind: 'no-session' });
    expect(h.invoked).toBe(0);
  });

  it('sends once permission is given, and stops again when it is withdrawn', async () => {
    const { setAiConsent } = await import('../lib/ai/consent');
    const { requestCompletion } = await import('../lib/ai/transport');
    setAiConsent(true);
    await expect(requestCompletion({ task: 'chat', system: 's', user: 'u' })).resolves.toMatchObject({ ok: true });
    expect(h.invoked).toBe(1);
    setAiConsent(false);
    await expect(requestCompletion({ task: 'chat', system: 's', user: 'u' })).resolves.toMatchObject({ kind: 'no-consent' });
    expect(h.invoked).toBe(1);
  });
});

describe('AI panel', () => {
  beforeEach(() => {
    vi.resetModules();
    cleanup();
    localStorage.clear();
    h.user = { id: 'user-1' };
    h.requests = [];
    vi.doMock('../context/AuthContext', async (importOriginal) => {
      const real = await importOriginal<typeof import('../context/AuthContext')>();
      return { ...real, useAuth: () => ({ user: h.user, session: null, loading: false, configured: true }) };
    });
    vi.doMock('../lib/ai/transport', () => ({
      requestCompletion: async (req: { task: string; user: string }) => {
        h.requests.push(req);
        return { ok: true, content: JSON.stringify({ answer: 'You spent 670 this month.' }), model: 'm', ms: 1, promptTokens: 1, completionTokens: 1 };
      },
    }));
  });

  async function renderPanel() {
    const { default: AiPanel } = await import('../tools/ui/AiPanel');
    const { CurrencyProvider } = await import('../tools/CurrencyContext');
    render(<CurrencyProvider><AiPanel id="p" onClose={() => {}} /></CurrencyProvider>);
  }

  const ask = (question: string) => {
    fireEvent.change(screen.getByLabelText(/Ask FinatriX AI/i), { target: { value: question } });
    fireEvent.click(screen.getByLabelText('Send question'));
  };

  it('asks before the first question leaves the device, naming where it goes', async () => {
    await renderPanel();
    ask('Where did my money go this month?');
    const card = await screen.findByRole('group', { name: 'Send this to an AI provider?' });
    expect(card).toHaveTextContent(/OpenRouter/);
    expect(card).toHaveTextContent(/name, email address and account ID are\s+not sent/);
    expect(h.requests).toHaveLength(0);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Allow and send' })).toHaveFocus());
  });

  it('sends the held question once allowed, and does not ask again', async () => {
    await renderPanel();
    ask('Where did my money go this month?');
    fireEvent.click(await screen.findByRole('button', { name: 'Allow and send' }));
    expect(await screen.findByText('You spent 670 this month.')).toBeInTheDocument();
    expect(h.requests).toHaveLength(1);
    expect(localStorage.getItem('fx_ai_consent')).toBe('1');

    ask('And last month?');
    await waitFor(() => expect(h.requests).toHaveLength(2));
    expect(screen.queryByRole('group', { name: 'Send this to an AI provider?' })).toBeNull();
  });

  it('declining sends nothing and gives the question back', async () => {
    await renderPanel();
    ask('Where did my money go this month?');
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('group', { name: 'Send this to an AI provider?' })).toBeNull();
    expect(screen.getByLabelText(/Ask FinatriX AI/i)).toHaveValue('Where did my money go this month?');
    expect(h.requests).toHaveLength(0);
    expect(localStorage.getItem('fx_ai_consent')).toBeNull();
  });

  it('never asks a guest, whose questions stay on the device', async () => {
    h.user = null;
    await renderPanel();
    ask('Where did my money go this month?');
    await screen.findByText(/Sign in for AI answers/);
    expect(screen.queryByRole('group', { name: 'Send this to an AI provider?' })).toBeNull();
    expect(h.requests).toHaveLength(0);
  });
});

describe('statement import', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('turns a refusal into a question, and asking again after "allow" runs the categoriser', async () => {
    let calls = 0;
    vi.doMock('../tools/ai/statementCategorize', () => ({
      categorizeDescriptions: async () => {
        calls += 1;
        return localStorage.getItem('fx_ai_consent') === '1'
          ? { ok: true, suggestions: new Map(), model: 'm', asked: 1 }
          : { ok: false, message: 'Nothing was sent.', retryable: false, needsConsent: true };
      },
    }));
    // The real CSV reader, so the drafts are built exactly as an import builds them.
    const { parseCsvStatement } = await import('../tools/lib/import/csv');
    const csv = ['Date,Narration,Withdrawal Amt.,Deposit Amt.', '02/09/2026,ZQX UNKNOWN MERCHANT 42,450.00,'].join('\n');
    vi.doMock('../tools/lib/import/extract', async (orig) => ({
      ...(await orig<typeof import('../tools/lib/import/extract')>()),
      extractStatement: async () => ({ doc: parseCsvStatement(csv, new Date(2026, 8, 30)) }),
    }));
    const { useStatementImport } = await import('../tools/lib/import/useStatementImport');
    const { result } = renderHook(() => useStatementImport({
      categories: [{ key: 'food', label: 'Food', section: 'needs' }], existing: [],
    }));
    await act(async () => { result.current.start(new File(['x'], 'statement.csv')); });
    await waitFor(() => expect(result.current.aiPhase).toBe('consent'));
    expect(result.current.aiMessage).toBe('');

    await act(async () => { result.current.allowAi(); });
    await waitFor(() => expect(result.current.aiPhase).toBe('done'));
    expect(calls).toBe(2);
    expect(localStorage.getItem('fx_ai_consent')).toBe('1');
  });


});
