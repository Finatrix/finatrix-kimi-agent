import { useEffect, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

/** The slot the tools shell renders under its breadcrumb row (ToolsLayout). */
export const INVITE_SLOT_ID = 'fx-tour-slot';
const PAGE_SLOT_ATTR = 'data-invite-slot';
const INVITING_CLASS = 'fx-inviting';

/**
 * Where a page wants invitations: below its main card rather than above it, so
 * the page's own primary action stays first. Pages without one get the shell's
 * slot at the top of the content.
 */
export function InviteSlot() {
  return <div {...{ [PAGE_SLOT_ATTR]: '' }} />;
}

/**
 * A first-visit invitation — to the one-minute intro, or to a tour of the
 * page — drawn as a card in the page flow at the top of the content.
 *
 * Both used to open over the page on first load: the intro full-screen, the
 * tour offer as a card floating over the bottom of the screen. Either way the
 * first thing a new person met was something to dismiss before the product
 * (Apple HIG, onboarding.md › Best practices: get people to the content fast,
 * keep teaching optional). In the flow, it pushes nothing out of reach and
 * needs no answer for the page to work.
 *
 * Not a dialog: it takes no focus and traps none. A polite live message says
 * it arrived, since it appears a moment after the page.
 */
export function InlineInvite({ title, body, yesLabel, onYes, onLater, onNever }: {
  title: string;
  body: string;
  yesLabel: string;
  onYes: () => void;
  onLater: () => void;
  /** Offered only where "never" means something (the tour can be opted out of). */
  onNever?: () => void;
}) {
  // Resolved on every render, not once: a page can offer a place below its
  // main card (`data-invite-slot`, see InviteSlot), with the shell's slot above
  // the content as the fallback. Both callers re-render on navigation, so the
  // card follows the page it belongs to. Without either it floats at the bottom.
  const slot = document.querySelector<HTMLElement>(`[${PAGE_SLOT_ATTR}]`) ?? document.getElementById(INVITE_SLOT_ID);
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setAnnounce(`${title} Offered on this page.`), 400);
    return () => window.clearTimeout(t);
  }, [title]);
  // One tour entry point at a time: while a card is offered, the shell's
  // "Tour this page" pill steps aside (tools.css), and it returns once the
  // card is answered or dismissed.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(INVITING_CLASS);
    return () => {
      if (!document.querySelector('.fx-invite')) root.classList.remove(INVITING_CLASS);
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onLater();
    }
  };

  return createPortal(
    <section className={`fx-tools fx-scope fx-invite${slot ? '' : ' is-floating'}`} aria-labelledby="fx-invite-title" onKeyDown={onKeyDown}>
      <span className="fx-invite-mark" aria-hidden="true" />
      <div className="fx-invite-text">
        <h2 id="fx-invite-title">{title}</h2>
        <p>{body}</p>
      </div>
      <div className="fx-invite-actions">
        {/* Neutral, not gold: the page under it has its own primary action,
            and one screen gets one gold button. */}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onYes}>{yesLabel}</button>
        <button type="button" className="fx-invite-text-btn" onClick={onLater}>Not now</button>
        {onNever && <button type="button" className="fx-invite-text-btn fx-invite-never" onClick={onNever}>Don’t show this again</button>}
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>
    </section>,
    slot ?? document.body,
  );
}
