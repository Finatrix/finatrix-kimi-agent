import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VOICE_LANGUAGES, isStopPhrase, preferredVoiceLang, speechLangFor, loadVoiceLang, saveVoiceLang, VOICE_LANG_KEY,
} from '../lib/voice/languages';
import { speechTextFor, speechChunks } from '../lib/voice/speechText';
import { LISTEN_LIMIT_MS, startConversation, type VoiceReply, type VoiceSnapshot } from '../lib/voice/conversation';
import type { ListenOutcome, SpeakOutcome, VoiceEngine } from '../lib/voice/engine';
import { outcomeForError, pickVoice, webVoiceEngine } from '../lib/voice/webEngine';
import { toListenOutcome } from '../lib/voice/nativeEngine';
import { asciiDigits, parseAiAnswer } from '../tools/ai/validate';
import { amountsIn } from '../tools/ai/grounding';

describe('voice languages', () => {
  it('covers exactly the eleven decided languages, each with stop words', () => {
    expect(VOICE_LANGUAGES.map((l) => l.code)).toEqual([
      'en-IN', 'hi-IN', 'bn-IN', 'mr-IN', 'te-IN', 'ta-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN', 'or-IN',
    ]);
    for (const l of VOICE_LANGUAGES) expect(l.stop.length).toBeGreaterThan(0);
  });

  it('starts in the device language when FinatriX speaks it, else Indian English', () => {
    expect(preferredVoiceLang(['ta-IN', 'en-GB'])).toBe('ta-IN');
    expect(preferredVoiceLang(['hi'])).toBe('hi-IN');
    expect(preferredVoiceLang(['fr-FR', 'bn_IN'])).toBe('bn-IN');
    expect(preferredVoiceLang(['en-US'])).toBe('en-IN');
    expect(preferredVoiceLang(['de-DE'])).toBe('en-IN');
    expect(preferredVoiceLang([])).toBe('en-IN');
  });

  it('remembers the choice on this device and ignores anything it does not know', () => {
    localStorage.clear();
    saveVoiceLang('kn-IN');
    expect(loadVoiceLang()).toBe('kn-IN');
    localStorage.setItem(VOICE_LANG_KEY, 'xx-YY');
    expect(['en-IN', 'hi-IN']).toContain(loadVoiceLang());
  });

  it('stops on a whole "stop", in the language spoken or in English', () => {
    expect(isStopPhrase('Stop.', 'en-IN')).toBe(true);
    expect(isStopPhrase("That's all!", 'en-IN')).toBe(true);
    expect(isStopPhrase('बस।', 'hi-IN')).toBe(true);
    expect(isStopPhrase('रुको', 'hi-IN')).toBe(true);
    expect(isStopPhrase('stop', 'ta-IN')).toBe(true);
    expect(isStopPhrase('நிறுத்து', 'ta-IN')).toBe(true);
  });

  it('treats a question that contains "stop" as a question', () => {
    expect(isStopPhrase('should I stop my SIP', 'en-IN')).toBe(false);
    expect(isStopPhrase('बस का किराया कितना है', 'hi-IN')).toBe(false);
    expect(isStopPhrase('', 'en-IN')).toBe(false);
  });

  it('reads a reply in the voice of its own script', () => {
    expect(speechLangFor('You spent ₹4,500 on food.', 'hi-IN')).toBe('en-IN');
    expect(speechLangFor('आपने खाने पर ₹4,500 खर्च किए।', 'hi-IN')).toBe('hi-IN');
    // Marathi and Hindi share a script: the user's choice decides.
    expect(speechLangFor('तुम्ही ₹4,500 खर्च केले.', 'mr-IN')).toBe('mr-IN');
    expect(speechLangFor('நீங்கள் ₹4,500 செலவழித்தீர்கள்.', 'en-IN')).toBe('ta-IN');
    expect(speechLangFor('₹4,500', 'gu-IN')).toBe('gu-IN');
  });
});

describe('speech text', () => {
  it('drops markdown and tables, keeps every figure as written', () => {
    const spoken = speechTextFor({
      headline: 'Food is your biggest category at ₹4,500.',
      tiles: ['Food: ₹4,500', 'Rent: ₹15,000'],
      text: '- **Food** rose 12% on last month\n| a | b |\n| - | - |\n- **Next:** set a [food budget](/tools/budget)',
    });
    expect(spoken).toBe('Food is your biggest category at ₹4,500. Food: ₹4,500. Rent: ₹15,000. Food rose 12% on last month. Next: set a food budget.');
    expect(spoken).not.toMatch(/[*|#[\]]/);
  });

  it('cuts a long answer at a sentence, not mid-word', () => {
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const spoken = speechTextFor({ text: long }, 200);
    expect(spoken.length).toBeLessThanOrEqual(200);
    expect(spoken.endsWith('.')).toBe(true);
  });

  it('splits into pieces short enough for every engine', () => {
    const chunks = speechChunks(`${'A short sentence. '.repeat(30)}${'word '.repeat(80)}`, 120);
    expect(chunks.every((c) => c.length <= 120)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toContain('A short sentence.');
  });
});

describe('Indian-script digits in AI answers', () => {
  it('become 0–9, so the grounding check sees every amount', () => {
    expect(asciiDigits('₹४,५०० और ₹১২৩ and ₹௧௦')).toBe('₹4,500 और ₹123 and ₹10');
    expect(amountsIn(asciiDigits('खाने पर ₹४,५०० खर्च हुए')).map((a) => a.value)).toEqual([4500]);
  });

  it('are converted in the parsed answer and headline', () => {
    const parsed = parseAiAnswer(JSON.stringify({ mode: 'data', headline: 'कुल ₹१,२००', answer: '- किराया ₹८००' }));
    expect(parsed?.headline).toBe('कुल ₹1,200');
    expect(parsed?.answer).toBe('- किराया ₹800');
  });
});

/* ── The hands-free loop ── */

function fakeEngine(heard: ListenOutcome[], speakResult: SpeakOutcome = 'done') {
  const spoken: Array<{ text: string; lang: string }> = [];
  const listened: string[] = [];
  let pendingAbort: ((o: ListenOutcome) => void) | null = null;
  const engine: VoiceEngine = {
    canListen: () => true,
    prime: () => {},
    listen: vi.fn((lang: string, onPartial: (t: string) => void) => {
      listened.push(lang);
      const next = heard.shift();
      if (!next) return new Promise<ListenOutcome>((resolve) => { pendingAbort = resolve; });
      if (next.kind === 'heard') onPartial(next.text);
      return Promise.resolve(next);
    }),
    cancelListening: vi.fn(() => { pendingAbort?.({ kind: 'aborted' }); pendingAbort = null; }),
    speak: vi.fn(async (text: string, lang: string) => { spoken.push({ text, lang }); return speakResult; }),
    cancelSpeaking: vi.fn(),
  };
  return { engine, spoken, listened };
}

async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('hands-free conversation', () => {
  let states: VoiceSnapshot[];
  beforeEach(() => { states = []; });
  const last = () => states[states.length - 1];

  it('listens, asks, reads the reply aloud and listens again until a pause', async () => {
    const { engine, spoken, listened } = fakeEngine([
      { kind: 'heard', text: 'how much did I spend on food' },
      { kind: 'heard', text: 'and on rent' },
      { kind: 'silence' },
    ]);
    const ask = vi.fn(async (q: string): Promise<VoiceReply> => ({ spoken: `Answer to ${q}.`, failed: false }));
    startConversation({ engine, lang: () => 'en-IN', ask, onChange: (s) => states.push(s) });
    await settle();
    expect(ask.mock.calls.map((c) => c[0])).toEqual(['how much did I spend on food', 'and on rent']);
    expect(spoken.map((s) => s.text)).toEqual(['Answer to how much did I spend on food.', 'Answer to and on rent.']);
    expect(listened).toHaveLength(3);
    expect(last()).toMatchObject({ phase: 'idle', ended: 'silence' });
    expect(states.some((s) => s.phase === 'thinking')).toBe(true);
    expect(states.some((s) => s.phase === 'speaking')).toBe(true);
  });

  it('ends on "stop" without sending it', async () => {
    const { engine } = fakeEngine([{ kind: 'heard', text: 'रुको' }]);
    const ask = vi.fn();
    startConversation({ engine, lang: () => 'hi-IN', ask, onChange: (s) => states.push(s) });
    await settle();
    expect(ask).not.toHaveBeenCalled();
    expect(last()).toMatchObject({ phase: 'idle', ended: 'stop-word' });
  });

  it('ends quietly when the question was not sent (consent, busy)', async () => {
    const { engine } = fakeEngine([{ kind: 'heard', text: 'hello' }]);
    startConversation({ engine, lang: () => 'en-IN', ask: async () => null, onChange: (s) => states.push(s) });
    await settle();
    expect(last().ended).toBe('not-sent');
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('reads a failed answer, then stops instead of looping on failures', async () => {
    const { engine, spoken } = fakeEngine([{ kind: 'heard', text: 'hello' }, { kind: 'heard', text: 'again' }]);
    startConversation({
      engine, lang: () => 'en-IN',
      ask: async () => ({ spoken: 'FinatriX AI is unavailable.', failed: true }),
      onChange: (s) => states.push(s),
    });
    await settle();
    expect(spoken).toHaveLength(1);
    expect(last().ended).toBe('failed-answer');
  });

  it('keeps going, silently, where the phone has no voice for the reply', async () => {
    const { engine } = fakeEngine([{ kind: 'heard', text: 'ପ୍ରଶ୍ନ' }, { kind: 'silence' }], 'unsupported-language');
    startConversation({
      engine, lang: () => 'or-IN',
      ask: async () => ({ spoken: 'ଉତ୍ତର', failed: false }),
      onChange: (s) => states.push(s),
    });
    await settle();
    expect(last()).toMatchObject({ ended: 'silence', muted: 'or-IN' });
  });

  it('passes on why listening failed', async () => {
    for (const kind of ['denied', 'unsupported-language', 'unavailable'] as const) {
      states = [];
      const { engine } = fakeEngine([{ kind }]);
      startConversation({ engine, lang: () => 'en-IN', ask: vi.fn(), onChange: (s) => states.push(s) });
      await settle();
      expect(last().ended).toBe(kind);
    }
  });

  it('stops listening and speaking at once when told to', async () => {
    const { engine } = fakeEngine([]);
    const c = startConversation({ engine, lang: () => 'en-IN', ask: vi.fn(), onChange: (s) => states.push(s) });
    await settle();
    expect(last().phase).toBe('listening');
    c.stop('hidden');
    await settle();
    expect(engine.cancelListening).toHaveBeenCalled();
    expect(engine.cancelSpeaking).toHaveBeenCalled();
    expect(last()).toMatchObject({ phase: 'idle', ended: 'hidden' });
  });

  it('never lets a stuck recogniser hold the microphone', async () => {
    vi.useFakeTimers();
    try {
      const { engine } = fakeEngine([]);
      startConversation({ engine, lang: () => 'en-IN', ask: vi.fn(), onChange: (s) => states.push(s) });
      await settle();
      expect(last().phase).toBe('listening');
      await vi.advanceTimersByTimeAsync(LISTEN_LIMIT_MS);
      await settle();
      expect(engine.cancelListening).toHaveBeenCalled();
      expect(last()).toMatchObject({ phase: 'idle', ended: 'silence' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts the turn again in a newly chosen language', async () => {
    const { engine, listened } = fakeEngine([]);
    let lang: 'en-IN' | 'te-IN' = 'en-IN';
    const c = startConversation({ engine, lang: () => lang, ask: vi.fn(), onChange: (s) => states.push(s) });
    await settle();
    lang = 'te-IN';
    c.relisten();
    await settle();
    expect(listened).toEqual(['en-IN', 'te-IN']);
    expect(last().phase).toBe('listening');
  });
});

describe('engines', () => {
  it('map browser recogniser errors to outcomes', () => {
    expect(outcomeForError('no-speech')).toEqual({ kind: 'silence' });
    expect(outcomeForError('not-allowed')).toEqual({ kind: 'denied' });
    expect(outcomeForError('language-not-supported')).toEqual({ kind: 'unsupported-language' });
    expect(outcomeForError('network')).toEqual({ kind: 'unavailable' });
    expect(outcomeForError(null)).toEqual({ kind: 'silence' });
  });

  it('pick an installed voice for the language, never another language', () => {
    const v = (lang: string, localService = false) => ({ lang, localService, name: lang }) as SpeechSynthesisVoice;
    expect(pickVoice([v('en-US'), v('hi-IN')], 'hi-IN')?.lang).toBe('hi-IN');
    expect(pickVoice([v('en-US'), v('en-GB', true)], 'en-IN')?.lang).toBe('en-GB');
    expect(pickVoice([v('ta_IN')], 'ta-IN')?.lang).toBe('ta_IN');
    expect(pickVoice([v('en-US'), v('hi-IN')], 'or-IN')).toBeNull();
  });

  it('check every native answer, treating anything odd as unavailable', () => {
    expect(toListenOutcome({ outcome: 'heard', text: ' hi ' })).toEqual({ kind: 'heard', text: 'hi' });
    expect(toListenOutcome({ outcome: 'heard', text: '' })).toEqual({ kind: 'silence' });
    expect(toListenOutcome({ outcome: 'denied' })).toEqual({ kind: 'denied' });
    expect(toListenOutcome({ outcome: 'weird' })).toEqual({ kind: 'unavailable' });
    expect(toListenOutcome(null)).toEqual({ kind: 'unavailable' });
  });

  it('the browser engine hears one utterance and ends itself after the pause', async () => {
    class FakeRecognition {
      static last: FakeRecognition;
      lang = ''; continuous = true; interimResults = false; maxAlternatives = 0;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      constructor() { FakeRecognition.last = this; }
      start() {}
      abort() { this.onerror?.({ error: 'aborted' }); this.onend?.(); }
    }
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
    try {
      const engine = webVoiceEngine();
      const partials: string[] = [];
      const heard = engine.listen('hi-IN', (t) => partials.push(t));
      const rec = FakeRecognition.last;
      expect(rec).toMatchObject({ lang: 'hi-IN', continuous: false, interimResults: true });
      rec.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: false, length: 1, 0: { transcript: 'खाने पर' } } } });
      rec.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: 'खाने पर कितना' } } } });
      rec.onend?.();
      await expect(heard).resolves.toEqual({ kind: 'heard', text: 'खाने पर कितना' });
      expect(partials).toEqual(['खाने पर', 'खाने पर कितना']);

      const cancelled = engine.listen('en-IN', () => {});
      engine.cancelListening();
      await expect(cancelled).resolves.toEqual({ kind: 'aborted' });
    } finally {
      delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    }
  });
});
