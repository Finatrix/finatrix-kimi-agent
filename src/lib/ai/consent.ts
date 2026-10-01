/**
 * Explicit permission to send data to a third-party AI provider.
 *
 * Every FinatriX AI request leaves the device: the edge function forwards the
 * prompt to OpenRouter, which passes it to the AI model that answers. A question
 * carries figures from the user's tools; a statement import carries merchant and
 * payee names. App Review Guideline 5.1.2(i) requires an app to disclose where
 * personal data goes "including with third-party AI, and obtain explicit
 * permission before doing so" — a footnote under the composer is disclosure, not
 * permission.
 *
 * So permission is a stored, revocable yes, asked for at the moment it matters
 * and enforced in the transport (`requestCompletion`), not in each screen: no
 * future caller can forget to ask.
 *
 * Per device, like the conversation itself, and like the conversation it is
 * cleared with the browser's storage. Withdrawn from Settings → Privacy.
 */
import { useEffect, useState } from 'react';

const KEY = 'fx_ai_consent';
const EVENT = 'fx:ai-consent';

/** Who receives the data, in the words every consent surface uses. */
export const AI_RECIPIENT =
  'OpenRouter, an AI routing service, and the third-party AI model it sends your request to';

export function hasAiConsent(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    // Storage blocked: nothing can be remembered, so nothing was agreed to.
    return false;
  }
}

export function setAiConsent(granted: boolean): void {
  try {
    if (granted) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* Storage blocked — the permission lasts as long as this answer does. */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

/** The current answer, kept in step across every component that shows it. */
export function useAiConsent(): [boolean, (granted: boolean) => void] {
  const [granted, setGranted] = useState(hasAiConsent);
  useEffect(() => {
    const sync = () => setGranted(hasAiConsent());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return [granted, setAiConsent];
}
