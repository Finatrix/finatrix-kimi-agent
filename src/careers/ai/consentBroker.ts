/**
 * Asks for AI permission at the moment a Careers action needs it, instead of
 * failing with "go to Settings first".
 *
 * The transport (`src/lib/ai/transport.ts`) still refuses every request until
 * the stored permission is yes — that stays the single enforcement point. This
 * broker only lets the Careers adapter pause, show the question (the
 * `AiConsentPrompt` mounted by the Careers shell), and carry on if the answer is
 * yes. With no prompt mounted (tests, other surfaces) it answers no at once,
 * so behaviour there is exactly what it was.
 */
import { hasAiConsent } from '../../lib/ai/consent';

type Asker = () => Promise<boolean>;

let asker: Asker | null = null;
let pending: Promise<boolean> | null = null;

/** Registered by the mounted prompt; returns the unregister function. */
export function registerAiConsentAsker(fn: Asker): () => void {
  asker = fn;
  return () => {
    if (asker === fn) asker = null;
  };
}

/** True when permission is (now) given. Concurrent callers share one question. */
export async function ensureAiConsent(): Promise<boolean> {
  if (hasAiConsent()) return true;
  if (!asker) return false;
  if (!pending) {
    pending = asker().finally(() => {
      pending = null;
    });
  }
  return pending;
}
