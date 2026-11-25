/**
 * The browser's own speech features. Chrome, Edge and Safari recognise speech;
 * Firefox does not, and gets no mic button (engine.ts `deviceCanListen`).
 *
 * Privacy: Chrome sends the audio to Google to be recognised, and Safari to
 * Apple. FinatriX never receives audio, only the text that comes back; the
 * consent card and the privacy policy say so.
 */
import type { ListenOutcome, SpeakOutcome, VoiceEngine } from './engine';
import type { VoiceLangCode } from './languages';
import { speechChunks } from './speechText';

/* The parts of the Web Speech API used here. TypeScript's DOM types do not include recognition. */
interface RecognitionAlternative { transcript: string }
interface RecognitionResult { readonly isFinal: boolean; readonly length: number; [i: number]: RecognitionAlternative }
interface RecognitionEvent { readonly resultIndex: number; readonly results: { readonly length: number; [i: number]: RecognitionResult } }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** How each recogniser error ends a turn when nothing was heard. */
export function outcomeForError(error: string | null): ListenOutcome {
  switch (error) {
    case null:
    case 'no-speech':
      return { kind: 'silence' };
    case 'not-allowed':
    case 'service-not-allowed':
      return { kind: 'denied' };
    case 'language-not-supported':
      return { kind: 'unsupported-language' };
    case 'aborted':
      return { kind: 'aborted' };
    default:
      // 'network', 'audio-capture', 'bad-grammar' and anything new.
      return { kind: 'unavailable' };
  }
}

const tag = (lang: string) => lang.replace('_', '-').toLowerCase();

/** The best installed voice for a language: an exact match, else the same language in another region. */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], lang: VoiceLangCode): SpeechSynthesisVoice | null {
  const exact = voices.filter((v) => tag(v.lang) === tag(lang));
  const base = lang.slice(0, 2);
  const near = voices.filter((v) => tag(v.lang).split('-')[0] === base);
  const pool = exact.length ? exact : near;
  return pool.find((v) => v.localService) ?? pool[0] ?? null;
}

/** Chrome fills the voice list after the page loads; wait briefly for it. */
function voicesReady(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      synth.removeEventListener?.('voiceschanged', done);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, 1500);
    synth.addEventListener?.('voiceschanged', done);
  });
}

export function webVoiceEngine(): VoiceEngine {
  let current: Recognition | null = null;
  let abortedByApp = false;

  return {
    canListen: () => recognitionCtor() !== null,

    prime() {
      // An empty utterance inside the tap unlocks speech for the page (Safari).
      try {
        const synth = window.speechSynthesis;
        if (synth && typeof SpeechSynthesisUtterance === 'function') synth.speak(new SpeechSynthesisUtterance(''));
      } catch {
        /* no speech output here; replies stay on screen */
      }
    },

    listen(lang, onPartial) {
      const Ctor = recognitionCtor();
      if (!Ctor) return Promise.resolve({ kind: 'unavailable' });
      return new Promise<ListenOutcome>((resolve) => {
        let rec: Recognition;
        try {
          rec = new Ctor();
        } catch {
          resolve({ kind: 'unavailable' });
          return;
        }
        current = rec;
        abortedByApp = false;
        let finalText = '';
        let latest = '';
        let error: string | null = null;
        rec.lang = lang;
        // One utterance per turn: the recogniser ends itself after a pause,
        // which is what makes the conversation hands-free.
        rec.continuous = false;
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        rec.onresult = (e) => {
          let interim = '';
          finalText = '';
          for (let i = 0; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalText += r[0]?.transcript ?? '';
            else interim += r[0]?.transcript ?? '';
          }
          latest = `${finalText}${interim}`.trim();
          onPartial(latest);
        };
        rec.onerror = (e) => { error = e.error; };
        rec.onend = () => {
          if (current === rec) current = null;
          if (abortedByApp) { resolve({ kind: 'aborted' }); return; }
          const text = (finalText || latest).trim();
          resolve(text ? { kind: 'heard', text } : outcomeForError(error));
        };
        try {
          rec.start();
        } catch {
          current = null;
          resolve({ kind: 'unavailable' });
        }
      });
    },

    cancelListening() {
      abortedByApp = true;
      try { current?.abort(); } catch { /* already ended */ }
    },

    async speak(text, lang): Promise<SpeakOutcome> {
      const synth = typeof window === 'undefined' ? undefined : window.speechSynthesis;
      if (!synth || typeof SpeechSynthesisUtterance !== 'function') return 'unavailable';
      const voice = pickVoice(await voicesReady(synth), lang);
      // Without a voice for the language the browser reads it with an English
      // one, which is worse than silence: the answer stays on screen instead.
      if (!voice) return 'unsupported-language';
      const chunks = speechChunks(text);
      if (!chunks.length) return 'done';
      synth.cancel();
      return new Promise<SpeakOutcome>((resolve) => {
        let settled = false;
        const finish = (outcome: SpeakOutcome) => {
          if (settled) return;
          settled = true;
          clearTimeout(watchdog);
          resolve(outcome);
        };
        // Chrome sometimes never fires `end`. A conversation must not hang on
        // that, so a reply is over after roughly as long as it takes to say.
        const watchdog = setTimeout(() => finish('done'), 8000 + text.length * 110);
        chunks.forEach((chunk, i) => {
          const u = new SpeechSynthesisUtterance(chunk);
          u.voice = voice;
          u.lang = voice.lang;
          u.onerror = (e) => finish(e.error === 'interrupted' || e.error === 'canceled' ? 'interrupted' : 'unavailable');
          if (i === chunks.length - 1) u.onend = () => finish('done');
          synth.speak(u);
        });
      });
    },

    cancelSpeaking() {
      try { window.speechSynthesis?.cancel(); } catch { /* nothing speaking */ }
    },
  };
}
