/**
 * One shape for every way FinatriX can hear and speak.
 *
 *  - In the iPhone and Android apps: the in-repo `FxVoice` plugin, which uses
 *    the phone's own recogniser and voices (nativeEngine.ts). Android's web view
 *    has no speech recognition at all, so native is the only way there.
 *  - On the web: the browser's SpeechRecognition and speechSynthesis
 *    (webEngine.ts). Firefox has no recognition, so it gets no mic button.
 *
 * Engines never throw. Every way a turn can end is an outcome the panel can
 * explain, so one missing language never breaks the chat.
 */
import { isNativeApp } from '../../native/platform';
import type { VoiceLangCode } from './languages';

export type ListenOutcome =
  | { kind: 'heard'; text: string }
  /** Nothing was said before the recogniser gave up: the "pause" that ends hands-free. */
  | { kind: 'silence' }
  /** The microphone or speech permission was refused. */
  | { kind: 'denied' }
  /** This phone or browser cannot recognise the chosen language. */
  | { kind: 'unsupported-language' }
  /** No recogniser, no network for one that needs it, or the microphone is busy. */
  | { kind: 'unavailable' }
  /** Stopped by the app. */
  | { kind: 'aborted' };

export type SpeakOutcome = 'done' | 'interrupted' | 'unsupported-language' | 'unavailable';

export interface VoiceEngine {
  /** Whether this device can listen at all. Synchronous, so the mic button never flickers in. */
  canListen(): boolean;
  /**
   * Call synchronously inside the tap that starts voice. Some browsers only
   * let a page speak or listen after a user gesture, and the first reply is
   * read long after the tap.
   */
  prime(): void;
  listen(lang: VoiceLangCode, onPartial: (text: string) => void): Promise<ListenOutcome>;
  cancelListening(): void;
  speak(text: string, lang: VoiceLangCode): Promise<SpeakOutcome>;
  cancelSpeaking(): void;
}

let engine: Promise<VoiceEngine> | null = null;

/** The engine for this device, loaded on first use so the chat pays nothing until the mic is tapped. */
export function loadVoiceEngine(): Promise<VoiceEngine> {
  engine ??= isNativeApp()
    ? import('./nativeEngine').then((m) => m.nativeVoiceEngine())
    : import('./webEngine').then((m) => m.webVoiceEngine());
  return engine;
}

/**
 * Whether to offer the mic at all, without loading an engine. The apps always
 * can (the plugin ships in the same build as this code); a browser can if it
 * has SpeechRecognition.
 */
export function deviceCanListen(): boolean {
  if (isNativeApp()) return true;
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return typeof w.SpeechRecognition === 'function' || typeof w.webkitSpeechRecognition === 'function';
}
