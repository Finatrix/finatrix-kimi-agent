/**
 * The web side of the in-repo `FxVoice` plugin:
 *   ios/App/App/FxVoicePlugin.swift          (SFSpeechRecognizer, AVSpeechSynthesizer)
 *   android/app/src/main/java/co/finatrix/app/VoicePlugin.java
 *                                            (SpeechRecognizer, TextToSpeech)
 *
 * Both halves answer the same calls with the same outcome words, so nothing
 * here branches on the platform. Each asks for the microphone (and on iPhone
 * speech recognition) itself, the first time `listen` is called.
 */
import { registerPlugin } from '@capacitor/core';
import type { ListenOutcome, SpeakOutcome, VoiceEngine } from './engine';

type NativeListen = 'heard' | 'silence' | 'denied' | 'unsupported-language' | 'unavailable' | 'aborted';

interface FxVoicePlugin {
  listen(options: { lang: string }): Promise<{ outcome: NativeListen; text?: string }>;
  stopListening(): Promise<void>;
  speak(options: { text: string; lang: string }): Promise<{ outcome: SpeakOutcome }>;
  stopSpeaking(): Promise<void>;
  addListener(event: 'partial', handler: (e: { text?: string }) => void): Promise<{ remove: () => Promise<void> }>;
}

const FxVoice = registerPlugin<FxVoicePlugin>('FxVoice');

const LISTEN: readonly NativeListen[] = ['heard', 'silence', 'denied', 'unsupported-language', 'unavailable', 'aborted'];
const SPEAK: readonly SpeakOutcome[] = ['done', 'interrupted', 'unsupported-language', 'unavailable'];

/** A plugin answer, checked: anything unexpected is "unavailable", never a crash. */
export function toListenOutcome(raw: { outcome?: unknown; text?: unknown } | null | undefined): ListenOutcome {
  const kind = LISTEN.includes(raw?.outcome as NativeListen) ? (raw!.outcome as NativeListen) : 'unavailable';
  if (kind !== 'heard') return { kind };
  const text = typeof raw?.text === 'string' ? raw.text.trim() : '';
  return text ? { kind: 'heard', text } : { kind: 'silence' };
}

export function nativeVoiceEngine(): VoiceEngine {
  let onPartial: ((text: string) => void) | null = null;
  let subscribed = false;

  const subscribe = () => {
    if (subscribed) return;
    subscribed = true;
    void FxVoice.addListener('partial', (e) => {
      if (typeof e?.text === 'string') onPartial?.(e.text);
    }).catch(() => { subscribed = false; });
  };

  return {
    canListen: () => true,
    // Native speech needs no gesture to start.
    prime: () => {},

    async listen(lang, partial) {
      subscribe();
      onPartial = partial;
      try {
        return toListenOutcome(await FxVoice.listen({ lang }));
      } catch {
        return { kind: 'unavailable' };
      } finally {
        onPartial = null;
      }
    },

    cancelListening() {
      void FxVoice.stopListening().catch(() => {});
    },

    async speak(text, lang) {
      try {
        const { outcome } = await FxVoice.speak({ text, lang });
        return SPEAK.includes(outcome) ? outcome : 'unavailable';
      } catch {
        return 'unavailable';
      }
    },

    cancelSpeaking() {
      void FxVoice.stopSpeaking().catch(() => {});
    },
  };
}
