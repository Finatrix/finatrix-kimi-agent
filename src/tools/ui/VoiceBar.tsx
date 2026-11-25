import type { VoiceControls } from '../../lib/voice/useVoiceConversation';
import type { VoiceEnd } from '../../lib/voice/conversation';
import { VOICE_LANGUAGES, isVoiceLangCode, voiceLanguage, type VoiceLangCode } from '../../lib/voice/languages';

/**
 * The strip above the chat composer while a voice conversation runs: what it is
 * doing, what it has heard, which language it listens in, and how to stop.
 * Styles live in the panel's stylesheet (AiPanel.tsx, `.fx-ai-voice*`).
 */

const PHASE_TEXT = {
  listening: 'Listening… say “stop” to finish',
  thinking: 'Getting your answer…',
  speaking: 'Reading the answer aloud…',
} as const;

function endText(reason: VoiceEnd, lang: VoiceLangCode): string | null {
  switch (reason) {
    case 'silence':
      return 'Voice ended after a pause. Tap the mic to talk again.';
    case 'stop-word':
      return 'Voice stopped.';
    case 'denied':
      return 'FinatriX can’t use the microphone. Allow it in your phone or browser settings, or type your question.';
    case 'unsupported-language':
      // Apple's recogniser has English and Hindi only (Nov 2026), while the
      // keyboard's own dictation covers far more: point there, not at a dead end.
      return `Voice input in ${voiceLanguage(lang).name} isn’t available on this device yet. Pick another language, or type — your keyboard’s mic may let you dictate in ${voiceLanguage(lang).name}.`;
    case 'unavailable':
      return 'Voice isn’t available right now. You can type your question instead.';
    default:
      // Stopped by a tap, closed, hidden, an answer that failed (its message is
      // already in the conversation) or held for consent: nothing to explain.
      return null;
  }
}

export function MicIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export function VoiceBar({ voice, id }: { voice: VoiceControls; id: string }) {
  const { state, active, lang } = voice;
  const ended = !active && state.ended ? endText(state.ended, lang) : null;
  const muted = state.muted ? voiceLanguage(state.muted).name : null;
  if (!active && !ended) return null;

  return (
    <div className="fx-ai-voice" role="group" aria-label="Voice conversation">
      <div className="fx-ai-voice-row">
        <p className="fx-ai-voice-status" role="status">
          {active ? (
            <>
              <span className={`fx-ai-voice-dot is-${state.phase}`} aria-hidden="true" />
              {state.phase === 'idle' ? '' : PHASE_TEXT[state.phase]}
            </>
          ) : ended}
        </p>
        {/* Reachable after an ending too: "not available in Tamil" must leave a way to pick another language. */}
        <label className="fx-sr-only" htmlFor={`${id}-voice-lang`}>Language you speak</label>
        <select
          id={`${id}-voice-lang`}
          className="fx-ai-voice-lang"
          value={lang}
          onChange={(e) => { if (isVoiceLangCode(e.target.value)) voice.setLang(e.target.value); }}
        >
          {VOICE_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} lang={l.code}>
              {l.own === l.name ? l.name : `${l.own} · ${l.name}`}
            </option>
          ))}
        </select>
      </div>
      {!active && (
        <button type="button" className="fx-ai-ghost fx-ai-voice-dismiss" onClick={voice.dismiss}>Dismiss</button>
      )}
      {active && state.partial && (
        <p className="fx-ai-voice-heard" lang={lang}>“{state.partial}”</p>
      )}
      {muted && (
        <p className="fx-ai-voice-note">Answers in {muted} can’t be read aloud on this device, so they stay on screen. Adding a {muted} voice in your phone’s speech settings turns this on.</p>
      )}
      {active && (
        <p className="fx-ai-voice-note">Your phone or browser’s speech service turns your voice into text. FinatriX never receives the audio.</p>
      )}
    </div>
  );
}
