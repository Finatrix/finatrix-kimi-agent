import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useInertOutside } from '../../hooks/useInertOutside';
import { useCurrency } from '../CurrencyContext';
import { allCategories } from '../lib/budget';
import { loadCatViewFor } from '../lib/budgetCatsMonth';
import { loadExpenses } from '../lib/expense';
import type { CatMeta } from '../lib/expenseAnalytics';
import {
  buildMoneyStory, buildStoryCards, latestCompletedMonth, type MoneyStory,
} from '../lib/moneyStory';
import { renderStoryCard, resolveStoryPalette, shareStoryImage } from '../lib/moneyStoryImage';
import { onLocalWrite } from '../lib/storage';
import { Icon } from './Icon';
import { Toggle } from './Toggle';
import { useOptionalToast } from './Toast';
import './moneyStory.css';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** The story for the latest finished month with data, or null. Re-read when data changes. */
function useMoneyStory(): MoneyStory | null {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener('focus', bump);
    window.addEventListener('storage', bump);
    const off = onLocalWrite(bump);
    return () => {
      off();
      window.removeEventListener('focus', bump);
      window.removeEventListener('storage', bump);
    };
  }, []);
  return useMemo(() => {
    void version; // re-read trigger, not a value
    const items = loadExpenses();
    const month = latestCompletedMonth(items, new Date());
    if (!month) return null;
    const catMeta = new Map<string, CatMeta>();
    allCategories(loadCatViewFor(month).active).forEach((c) => catMeta.set(c.k, c));
    return buildMoneyStory(items, month, catMeta);
  }, [version]);
}

/** Dashboard row that opens the story. Renders nothing until a month has finished with data. */
export function MoneyStoryEntry() {
  const story = useMoneyStory();
  const [open, setOpen] = useState<MoneyStory | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (!story) return null;
  const monthWord = story.monthName.split(" ")[0];
  return (
    <>
      <section className="fx-story-entry" aria-labelledby="fx-story-entry-h">
        <div>
          <h2 id="fx-story-entry-h" className="fx-story-entry-h">Your {monthWord} story</h2>
          <p className="fx-story-entry-p">Five quick cards on where {monthWord} went. Shareable, with amounts hidden.</p>
        </div>
        <button ref={triggerRef} type="button" className="btn btn-sm fx-story-entry-btn" onClick={() => setOpen(story)}>
          View story
        </button>
      </section>
      {open && (
        <MoneyStorySheet
          story={open}
          onClose={() => {
            setOpen(null);
            // The button is still mounted; hand focus back after the sheet unmounts.
            requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
          }}
        />
      )}
    </>
  );
}

function MoneyStorySheet({ story, onClose }: { story: MoneyStory; onClose: () => void }) {
  const { cfmt } = useCurrency();
  const toast = useOptionalToast();
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [showAmounts, setShowAmounts] = useState(false);
  const [sharing, setSharing] = useState(false);

  useBodyScrollLock(true);
  useInertOutside(cardRef);

  // On screen the user sees their own figures; only the shared picture hides them.
  const cards = useMemo(() => buildStoryCards(story, cfmt), [story, cfmt]);
  const total = cards.length;

  const goTo = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(total - 1, i));
    // `html` is smooth-scrolling; programmatic scrolls pass `instant`.
    track.scrollTo({ left: next * track.clientWidth, behavior: 'instant' });
    setIndex(next);
  }, [total]);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  };

  // Focus the sheet on open; Escape closes; Tab stays inside; arrows page the cards.
  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.preventDefault(); onClose(); return; }
      if (ev.key === 'Tab') {
        const nodes = Array.from(cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!cardRef.current?.contains(active)) { ev.preventDefault(); first.focus(); }
        else if (ev.shiftKey && (active === first || active === cardRef.current)) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && active === last) { ev.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const onTrackKey = (ev: React.KeyboardEvent) => {
    if (ev.key === 'ArrowRight') { ev.preventDefault(); goTo(index + 1); }
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); goTo(index - 1); }
  };

  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      // Colours are resolved against the sheet so the picture matches the active theme.
      const palette = resolveStoryPalette(cardRef.current);
      const shareCards = buildStoryCards(story, showAmounts ? cfmt : null);
      const blob = await renderStoryCard(shareCards[index], palette, index, total);
      if (!blob) { toast.notify('Could not make the picture on this device.', 'error'); return; }
      const outcome = await shareStoryImage(blob, `finatrix-${story.month}-story-${index + 1}.png`, `My ${story.monthName} money story`);
      if (outcome === 'saved') toast.notify('Picture saved.', 'ok');
      else if (outcome === 'failed') toast.notify('Could not share the picture.', 'error');
    } finally {
      setSharing(false);
    }
  };

  return createPortal(
    <div className="fx-tools fx-scope">
      <div className="fx-story-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={cardRef} className="fx-story-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <div className="fx-story-head">
            <h2 id={titleId} className="fx-story-title">{story.monthName}</h2>
            <button type="button" className="fx-story-close" onClick={onClose} aria-label="Close story">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <div
            ref={trackRef}
            className="fx-story-track"
            role="region"
            aria-roledescription="carousel"
            aria-label={`${story.monthName} story`}
            tabIndex={0}
            onScroll={onScroll}
            onKeyDown={onTrackKey}
          >
            {cards.map((c, i) => (
              <article
                key={c.id}
                className={`fx-story-card is-${c.tone}`}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${total}`}
                aria-hidden={i === index ? undefined : true}
              >
                <p className="fx-story-kicker">{c.icon && <Icon name={c.icon} size={18} />}{c.kicker}</p>
                <p className="fx-story-headline">{c.headline}</p>
                <p className="fx-story-detail">{c.detail}</p>
              </article>
            ))}
          </div>

          <div className="fx-story-nav">
            <button type="button" className="fx-story-step" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous card">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <p className="fx-story-count" aria-live="polite">{index + 1} of {total}</p>
            <button type="button" className="fx-story-step" onClick={() => goTo(index + 1)} disabled={index === total - 1} aria-label="Next card">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </div>

          <div className="fx-story-share">
            <Toggle checked={showAmounts} onChange={setShowAmounts} label="Show amounts in the shared picture">
              Show amounts in the picture
            </Toggle>
            <button type="button" className="btn fx-story-share-btn" onClick={share} disabled={sharing}>
              {sharing ? 'Making picture…' : 'Share this card'}
            </button>
          </div>
          <p className="fx-story-note">
            {showAmounts ? 'The picture will include your amounts.' : 'The picture hides your amounts: only names and percentages.'}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
