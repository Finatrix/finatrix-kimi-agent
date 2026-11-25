import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AiPanel from '../tools/ui/AiPanel';
import { CurrencyProvider } from '../tools/CurrencyContext';
import type { ListenOutcome, VoiceEngine } from '../lib/voice/engine';

/**
 * Voice in the AI chat, end to end inside the panel: the mic sits behind the
 * same AI consent as typing, a spoken question goes through the same `send`,
 * the reply is read aloud, and the conversation keeps listening until a pause.
 */

const h = vi.hoisted(() => ({
  user: { id: 'user-1', email: 'a@b.invalid', user_metadata: {} } as { id: string } | null,
  canListen: true,
  heard: [] as ListenOutcome[],
  spoken: [] as Array<{ text: string; lang: string }>,
  questions: [] as string[],
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
  requestCompletion: async (req: { user: string }) => {
    h.questions.push(req.user);
    return {
      ok: true, model: 'test-model', ms: 1, promptTokens: 1, completionTokens: 1,
      content: JSON.stringify({ mode: 'general', headline: 'An index fund tracks a whole market.', answer: '- **Low fees** keep more of the return.' }),
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
  speak: async (text, lang) => { h.spoken.push({ text, lang }); return 'done'; },
  cancelSpeaking: vi.fn(),
};

vi.mock('../lib/voice/engine', () => ({
  deviceCanListen: () => h.canListen,
  loadVoiceEngine: () => Promise.resolve(engine),
}));

function renderPanel() {
  return render(
    <CurrencyProvider>
      <AiPanel id="fx-ai-panel" onClose={() => {}} />
    </CurrencyProvider>,
  );
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  h.user = { id: 'user-1' };
  h.canListen = true;
  h.heard = [];
  h.spoken = [];
  h.questions = [];
});

describe('voice in FinatriX AI', () => {
  it('asks for the AI consent, worded for voice, before the microphone opens', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Talk hands-free' }));
    expect(await screen.findByText('Talk to FinatriX AI?')).toBeInTheDocument();
    expect(screen.getByText(/FinatriX never receives the audio/)).toBeInTheDocument();
    expect(h.questions).toHaveLength(0);

    h.heard = [{ kind: 'heard', text: 'What is an index fund?' }];
    fireEvent.click(screen.getByRole('button', { name: 'Allow and start talking' }));
    await waitFor(() => expect(h.spoken).toHaveLength(1));
    expect(localStorage.getItem('fx_ai_consent')).toBe('1');
  });

  it('runs a hands-free back-and-forth and stops after a pause', async () => {
    localStorage.setItem('fx_ai_consent', '1');
    localStorage.setItem('fx_voice_lang', 'en-IN');
    h.heard = [
      { kind: 'heard', text: 'What is an index fund?' },
      { kind: 'heard', text: 'Why are fees low?' },
      { kind: 'silence' },
    ];
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Talk hands-free' }));

    expect(await screen.findByText('Voice ended after a pause. Tap the mic to talk again.')).toBeInTheDocument();
    // Both questions went through the chat, as typed ones do, and both answers were read aloud.
    expect(h.questions).toHaveLength(2);
    expect(screen.getByText('What is an index fund?')).toBeInTheDocument();
    expect(screen.getByText('Why are fees low?')).toBeInTheDocument();
    expect(h.spoken).toEqual([
      { text: 'An index fund tracks a whole market. Low fees keep more of the return.', lang: 'en-IN' },
      { text: 'An index fund tracks a whole market. Low fees keep more of the return.', lang: 'en-IN' },
    ]);
    expect(screen.getByRole('button', { name: 'Talk hands-free' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows what it hears, the language it listens in, and stops on a tap', async () => {
    localStorage.setItem('fx_ai_consent', '1');
    let release: ((o: ListenOutcome) => void) | null = null;
    const listen = engine.listen;
    engine.listen = (_lang, onPartial) => {
      onPartial('खाने पर कितना');
      return new Promise((resolve) => { release = resolve; });
    };
    (engine.cancelListening as ReturnType<typeof vi.fn>).mockImplementation(() => release?.({ kind: 'aborted' }));
    try {
      renderPanel();
      const mic = screen.getByRole('button', { name: 'Talk hands-free' });
      fireEvent.click(mic);
      expect(await screen.findByText('“खाने पर कितना”')).toBeInTheDocument();
      expect(screen.getByText(/Listening/)).toBeInTheDocument();
      expect(mic).toHaveAttribute('aria-pressed', 'true');

      const picker = screen.getByLabelText('Language you speak') as HTMLSelectElement;
      expect(picker.options).toHaveLength(11);
      fireEvent.change(picker, { target: { value: 'hi-IN' } });
      expect(localStorage.getItem('fx_voice_lang')).toBe('hi-IN');

      fireEvent.click(mic);
      await waitFor(() => expect(mic).toHaveAttribute('aria-pressed', 'false'));
      expect(h.questions).toHaveLength(0);
    } finally {
      engine.listen = listen;
      (engine.cancelListening as ReturnType<typeof vi.fn>).mockReset();
    }
  });

  it('explains a refused microphone and leaves typing as it was', async () => {
    localStorage.setItem('fx_ai_consent', '1');
    h.heard = [{ kind: 'denied' }];
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Talk hands-free' }));
    expect(await screen.findByText(/can’t use the microphone/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Ask FinatriX AI/i)).not.toBeDisabled();
  });

  it('offers no mic where the browser cannot listen, or to a guest', () => {
    h.canListen = false;
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Talk hands-free' })).toBeNull();
    cleanup();
    h.canListen = true;
    h.user = null;
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Talk hands-free' })).toBeNull();
  });
});
