import { useCallback, useEffect, useRef, useState } from 'react';
import { startConversation, IDLE, type Conversation, type VoiceEnd, type VoiceReply, type VoiceSnapshot } from './conversation';
import { deviceCanListen, loadVoiceEngine, type VoiceEngine } from './engine';
import { loadVoiceLang, saveVoiceLang, type VoiceLangCode } from './languages';

export interface VoiceControls {
  /** Whether to show the mic button at all. */
  canListen: boolean;
  lang: VoiceLangCode;
  setLang: (code: VoiceLangCode) => void;
  state: VoiceSnapshot;
  active: boolean;
  /** Call from the tap itself: browsers only allow speech after a gesture. */
  start: () => void;
  stop: (reason?: VoiceEnd) => void;
  /** Forget the last "why it ended" line. */
  dismiss: () => void;
}

/**
 * The hands-free conversation for one open chat panel. It ends when the panel
 * closes and whenever the page is hidden (another tab, the home screen, the
 * phone locking), because it must never listen in the background.
 */
export function useVoiceConversation(ask: (question: string) => Promise<VoiceReply | null>): VoiceControls {
  const [canListen] = useState(deviceCanListen);
  const [lang, setLangState] = useState(loadVoiceLang);
  const [state, setState] = useState<VoiceSnapshot>(IDLE);

  const askRef = useRef(ask);
  const langRef = useRef(lang);
  useEffect(() => {
    askRef.current = ask;
    langRef.current = lang;
  });

  const engineRef = useRef<VoiceEngine | null>(null);
  const convo = useRef<Conversation | null>(null);

  // Load the engine while the panel is open, so the tap can prime it synchronously.
  useEffect(() => {
    if (!canListen) return;
    let live = true;
    void loadVoiceEngine().then((e) => { if (live) engineRef.current = e; }).catch(() => {});
    return () => { live = false; };
  }, [canListen]);

  // A start waiting for the engine to load, which a stop must cancel.
  const waiting = useRef(false);

  const stop = useCallback((reason: VoiceEnd = 'user') => {
    if (waiting.current) {
      waiting.current = false;
      setState({ ...IDLE, ended: reason });
    }
    convo.current?.stop(reason);
    convo.current = null;
  }, []);

  const begin = useCallback((engine: VoiceEngine) => {
    convo.current?.stop('user');
    const c = startConversation({
      engine,
      lang: () => langRef.current,
      ask: (q) => askRef.current(q),
      onChange: (s) => {
        setState(s);
        if (s.phase === 'idle' && convo.current === c) convo.current = null;
      },
    });
    convo.current = c;
  }, []);

  const start = useCallback(() => {
    const ready = engineRef.current;
    if (ready) {
      ready.prime();
      begin(ready);
      return;
    }
    waiting.current = true;
    setState({ ...IDLE, phase: 'listening' });
    void loadVoiceEngine()
      .then((e) => {
        engineRef.current = e;
        if (!waiting.current) return;
        waiting.current = false;
        begin(e);
      })
      .catch(() => {
        if (!waiting.current) return;
        waiting.current = false;
        setState({ ...IDLE, ended: 'unavailable' });
      });
  }, [begin]);

  const setLang = useCallback((code: VoiceLangCode) => {
    saveVoiceLang(code);
    langRef.current = code;
    setLangState(code);
    convo.current?.relisten();
  }, []);

  const dismiss = useCallback(() => setState((s) => (s.phase === 'idle' ? IDLE : s)), []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop('hidden');
    };
    const onPageHide = () => stop('hidden');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      stop('closed');
    };
  }, [stop]);

  return { canListen, lang, setLang, state, active: state.phase !== 'idle', start, stop, dismiss };
}
