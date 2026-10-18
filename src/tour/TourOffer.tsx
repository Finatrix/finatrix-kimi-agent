import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import './tour.css';

/**
 * The polite first-session offer: a small card on the dashboard asking
 * whether the person would like the tour. Three plain answers, no dark
 * patterns — "Maybe later" snoozes for three days (at most twice more) and
 * "Don't remind me again" is permanent (the hub can turn it back on).
 *
 * Non-modal on purpose: it does not take focus or block the page. It is a
 * labelled dialog region at the end of the document, announced once through
 * a polite live region, and Escape inside it means "Maybe later".
 */
export default function TourOffer({ minutes, reduced, paused, onYes, onLater, onNever }: {
  /** The whole tour's honest length, from the registry. */
  minutes: number;
  reduced: boolean;
  paused: boolean;
  onYes: () => void;
  onLater: () => void;
  onNever: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // A live region only speaks about changes, so it mounts empty and is filled
  // a moment later.
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setAnnounce('A guided tour is available. Its buttons are at the end of the page.'), 400);
    return () => window.clearTimeout(t);
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onLater();
    }
  };
  const length = minutes <= 1 ? 'about a minute' : `about ${minutes} minutes`;
  return createPortal(
    <div
      ref={rootRef}
      className="fx-tools fx-scope tour-offer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-offer-title"
      aria-describedby="tour-offer-body"
      data-reduced={reduced ? '' : undefined}
      data-paused={paused ? '' : undefined}
      onKeyDown={onKeyDown}
    >
      <div className="tour-offer-top">
        <span className="tour-offer-orb" aria-hidden="true" />
        <div>
          <h2 id="tour-offer-title">Want a quick tour of everything FinatriX can do?</h2>
          <p id="tour-offer-body">
            Short chapters, {length} in all. Each one points at the real buttons on the real page. Skip any part or stop whenever you like.
          </p>
        </div>
      </div>
      <div className="tour-offer-actions">
        <button type="button" className="tour-btn tour-primary" onClick={onYes}>Yes, show me</button>
        <button type="button" className="tour-btn tour-ghost" onClick={onLater}>Maybe later</button>
        <button type="button" className="tour-link" onClick={onNever}>Don’t remind me again</button>
      </div>
      <p className="tour-sr" aria-live="polite">{announce}</p>
    </div>,
    document.body,
  );
}
