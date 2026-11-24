/**
 * The hands-free loop: listen → ask → read the reply aloud → listen again.
 *
 * Decided 24 Nov 2026: once started it keeps going without taps, and stops
 * after a pause (a turn where nothing is said), when the user says "stop", or
 * when they tap Stop. It never listens in the background: the panel ends it
 * when the page is hidden or closed (useVoiceConversation.ts).
 *
 * No React here, so every path is testable with a fake engine.
 */
import type { VoiceEngine } from './engine';
import { isStopPhrase, speechLangFor, type VoiceLangCode } from './languages';

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

/** Why a conversation ended. Each one gets its own line in the panel, or none. */
export type VoiceEnd =
  | 'silence'
  | 'stop-word'
  | 'user'
  | 'closed'
  | 'hidden'
  | 'not-sent'
  | 'failed-answer'
  | 'denied'
  | 'unsupported-language'
  | 'unavailable';

export interface VoiceSnapshot {
  phase: VoicePhase;
  /** What the recogniser has heard so far this turn. */
  partial: string;
  ended: VoiceEnd | null;
  /** A reply could not be read aloud in this language; it stays on screen. */
  muted: VoiceLangCode | null;
}

export const IDLE: VoiceSnapshot = { phase: 'idle', partial: '', ended: null, muted: null };

export interface VoiceReply {
  /** The reply as it should be spoken (speechText.ts). */
  spoken: string;
  /** The assistant could not answer. Read the reason, then stop. */
  failed: boolean;
}

export interface ConversationOptions {
  engine: VoiceEngine;
  /** Read at every turn, so a language picked mid-conversation applies to the next turn. */
  lang: () => VoiceLangCode;
  /** Sends the question through the chat. `null` means it was not sent (the consent card, say). */
  ask: (question: string) => Promise<VoiceReply | null>;
  onChange: (snapshot: VoiceSnapshot) => void;
}

export interface Conversation {
  stop(reason: VoiceEnd): void;
  /** Throw away this turn's listening and start it again (a new language). */
  relisten(): void;
}

export function startConversation({ engine, lang, ask, onChange }: ConversationOptions): Conversation {
  let stopped = false;
  let restart = false;
  const state: VoiceSnapshot = { ...IDLE };
  const set = (patch: Partial<VoiceSnapshot>) => {
    Object.assign(state, patch);
    onChange({ ...state });
  };

  const end = (reason: VoiceEnd) => {
    if (stopped) return;
    stopped = true;
    engine.cancelListening();
    engine.cancelSpeaking();
    set({ phase: 'idle', partial: '', ended: reason });
  };

  const run = async () => {
    while (!stopped) {
      set({ phase: 'listening', partial: '', ended: null });
      const heard = await engine.listen(lang(), (text) => {
        if (!stopped) set({ partial: text });
      });
      if (stopped) return;

      if (heard.kind === 'aborted') {
        if (restart) {
          restart = false;
          continue;
        }
        end('user');
        return;
      }
      if (heard.kind !== 'heard') {
        end(heard.kind);
        return;
      }
      if (isStopPhrase(heard.text, lang())) {
        end('stop-word');
        return;
      }

      set({ phase: 'thinking', partial: heard.text });
      let reply: VoiceReply | null;
      try {
        reply = await ask(heard.text);
      } catch {
        reply = null;
      }
      if (stopped) return;
      if (!reply) {
        end('not-sent');
        return;
      }

      set({ phase: 'speaking', partial: '' });
      const voice = speechLangFor(reply.spoken, lang());
      const said = await engine.speak(reply.spoken, voice);
      if (stopped) return;
      if (said === 'unsupported-language' || said === 'unavailable') set({ muted: voice });
      if (reply.failed) {
        end('failed-answer');
        return;
      }
    }
  };
  void run();

  return {
    stop: end,
    relisten() {
      if (stopped || state.phase !== 'listening') return;
      restart = true;
      engine.cancelListening();
    },
  };
}
