/**
 * The Careers AI permission question, asked once, at the moment an AI action
 * first needs it (see ai/consentBroker.ts). A yes is stored with the same
 * revocable setting the money tools use, and the waiting action carries on.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AI_RECIPIENT, setAiConsent } from '../../lib/ai/consent';
import { registerAiConsentAsker } from '../ai/consentBroker';
import { Sheet } from '../ui/Sheet';

export function AiConsentPrompt() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((granted: boolean) => void) | null>(null);

  useEffect(
    () =>
      registerAiConsentAsker(
        () =>
          new Promise<boolean>((resolve) => {
            resolver.current = resolve;
            setOpen(true);
          }),
      ),
    [],
  );

  const answer = useCallback((granted: boolean) => {
    if (granted) setAiConsent(true);
    setOpen(false);
    resolver.current?.(granted);
    resolver.current = null;
  }, []);

  return (
    <Sheet
      open={open}
      title="Use FinatriX AI for this?"
      onClose={() => answer(false)}
      footer={
        <>
          <button type="button" className="cx-btn cx-btn-quiet" onClick={() => answer(false)}>
            Not now
          </button>
          <button type="button" className="cx-btn cx-btn-primary" onClick={() => answer(true)}>
            Allow and continue
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        To analyse a resume, match it to jobs, tailor it or prepare you for interviews, FinatriX sends the text it
        needs to {AI_RECIPIENT}.
      </p>
      <p>
        That can include your resume text, job descriptions and your notes on an application. Contact details
        written in your resume, such as your name, email and phone number, are part of that text. Your account ID
        is never sent.
      </p>
      <p style={{ marginBottom: 0 }}>
        You can turn this off any time in Careers settings. Turning it off stops future requests; it does not recall
        ones already answered.
      </p>
    </Sheet>
  );
}
