import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { inertOutside } from '../hooks/useInertOutside';
import { isPinned } from './dom';
import { holeFor, layoutFor, placeCard, scrollDelta, visibleRegion, type Box, type CardLayout } from './geometry';
import type { TourChapter, TourStep } from './types';

/**
 * The live coach-mark: a dimmed page with a cut-out around a REAL control, a
 * pulsing gold frame on it, and a coach card that says what it is and why it
 * helps.
 *
 * Built to stay out of the way of the page it explains:
 *  - The dim is four panels around the hole, moved by transform only — the
 *    hole glides from one control to the next on the compositor, and nothing
 *    in the page re-lays out. The gold frame is four corner brackets, also
 *    transform-only, so it never distorts the way a scaled ring would.
 *  - Mounted once per chapter and kept: steps change its props, never its
 *    DOM, which is what lets the hole glide instead of blinking.
 *  - Re-measured on resize, scroll, a ResizeObserver on the target, the card
 *    and the document, and a slow poll — so a late image or an expanding
 *    section never leaves the frame pointing at empty space.
 *  - By default the spotlit control is look-only: the page is `inert` and the
 *    card is a modal dialog. "Try it" makes JUST that control live (focus
 *    moves into it; Tab cycles between it and the card); Escape hands back.
 *
 * Positions are written straight to the DOM through refs, so scrolling or
 * resizing never re-renders React.
 */

export interface SpotlightProps {
  chapter: TourChapter;
  step: TourStep;
  /** The resolved element, or null for a step with no target (centred card). */
  target: HTMLElement | null;
  /** 0-based position among the steps being shown, and their count. */
  index: number;
  total: number;
  isLast: boolean;
  nextLabel: string;
  reduced: boolean;
  paused: boolean;
  fmt: (n: number) => string;
  code: string;
  onNext: () => void;
  onBack: () => void;
  onSkipChapter: () => void;
  onExit: () => void;
  haptic: () => void;
}

const GLIDE_MS = 560;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Everything focusable inside `el` that is actually rendered. */
function focusables(el: Element | null): HTMLElement[] {
  if (!el) return [];
  const sel = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
  const list = Array.from(el.querySelectorAll<HTMLElement>(sel));
  if (el instanceof HTMLElement && el.matches(sel)) list.unshift(el);
  return list.filter((n) => typeof n.checkVisibility !== 'function' || n.checkVisibility({ visibilityProperty: true }));
}

/** A px length a CSS custom property / env() resolves to, measured with a probe. */
function probeHeight(probe: HTMLElement | null): number {
  return probe ? probe.getBoundingClientRect().height : 0;
}

function readScrollOffset(): number {
  try {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scroll-offset'));
    return Number.isFinite(v) ? v : 60;
  } catch {
    return 60;
  }
}

export default function Spotlight(props: SpotlightProps) {
  const { chapter, step, target, index, total, isLast, nextLabel, reduced, paused, fmt, code } = props;
  // Try it belongs to one step: keyed by the step's id, so moving on resets it
  // without an effect.
  const [tryStep, setTryStep] = useState<string | null>(null);
  const tryIt = tryStep === step.id;
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const doneTryRef = useRef<HTMLButtonElement>(null);
  const safeTopRef = useRef<HTMLDivElement>(null);
  const panels = useRef<Array<HTMLDivElement | null>>([]);
  const corners = useRef<Array<HTMLSpanElement | null>>([]);
  const holeRef = useRef<HTMLDivElement>(null);
  const glideUntil = useRef(0);
  const lastHole = useRef<Box | null>(null);
  const propsRef = useRef(props);
  useLayoutEffect(() => { propsRef.current = props; });

  // Look-only steps lock the page in place; Try it hands scrolling back.
  useBodyScrollLock(!tryIt);

  /* ── Placement ─────────────────────────────────────────────────────── */

  const place = useCallback((glide: boolean) => {
    const root = rootRef.current;
    const card = cardRef.current;
    if (!root || !card) return;
    const vw = root.clientWidth || window.innerWidth;
    const vh = root.clientHeight || window.innerHeight;
    const layout: CardLayout = layoutFor(vw, vh);
    if (root.dataset.layout !== layout) root.dataset.layout = layout;
    if (glide && !reduced) {
      glideUntil.current = performance.now() + GLIDE_MS;
      root.setAttribute('data-glide', '');
    } else if (performance.now() > glideUntil.current) {
      root.removeAttribute('data-glide');
    }

    const el = propsRef.current.target;
    const rect = el && el.isConnected ? el.getBoundingClientRect() : null;
    const hole = rect && rect.width + rect.height > 0 ? holeFor({ x: rect.left, y: rect.top, w: rect.width, h: rect.height }, vw, vh) : null;
    lastHole.current = hole;
    root.toggleAttribute('data-nohole', !hole);

    // The four dim panels, each a full-viewport sheet moved (and, for the two
    // beside the hole, squashed vertically) so together they frame the hole.
    const h = hole ?? { x: vw / 2, y: vh / 2, w: 0, h: 0 };
    const [top, bottom, left, right] = panels.current;
    const sy = vh > 0 ? h.h / vh : 0;
    if (top) top.style.transform = `translate3d(0, ${h.y - vh}px, 0)`;
    if (bottom) bottom.style.transform = `translate3d(0, ${h.y + h.h}px, 0)`;
    if (left) left.style.transform = `translate3d(${h.x - vw}px, ${h.y}px, 0) scaleY(${sy})`;
    if (right) right.style.transform = `translate3d(${h.x + h.w}px, ${h.y}px, 0) scaleY(${sy})`;
    const blocker = holeRef.current;
    if (blocker) {
      blocker.style.transform = `translate3d(${h.x}px, ${h.y}px, 0)`;
      blocker.style.width = `${h.w}px`;
      blocker.style.height = `${h.h}px`;
    }
    // Corner brackets sit 3px outside the hole; 18px is their own size.
    const C = 18;
    const o = 3;
    const pts = [
      [h.x - o, h.y - o], [h.x + h.w + o - C, h.y - o],
      [h.x - o, h.y + h.h + o - C], [h.x + h.w + o - C, h.y + h.h + o - C],
    ];
    corners.current.forEach((c, i) => {
      if (c) c.style.transform = `translate3d(${pts[i][0]}px, ${pts[i][1]}px, 0)`;
    });

    // The card.
    if (layout === 'float') {
      const spot = placeCard(hole, { w: card.offsetWidth, h: card.offsetHeight }, vw, vh, propsRef.current.step.placement ?? 'auto');
      card.style.transform = `translate3d(${spot.x}px, ${spot.y}px, 0)`;
      card.dataset.side = spot.side;
    } else {
      card.style.transform = '';
      delete card.dataset.side;
    }
  }, [reduced]);

  /** Bring the target into the part of the screen the card leaves free. */
  const reveal = useCallback(() => {
    const root = rootRef.current;
    const card = cardRef.current;
    const el = propsRef.current.target;
    if (!root || !card || !el || !el.isConnected || isPinned(el)) return;
    const vw = root.clientWidth || window.innerWidth;
    const vh = root.clientHeight || window.innerHeight;
    const layout = layoutFor(vw, vh);
    root.dataset.layout = layout;
    const cardBox = { w: card.offsetWidth, h: card.offsetHeight };
    const region = visibleRegion(layout, vw, vh, readScrollOffset() + probeHeight(safeTopRef.current), cardBox);
    const r = el.getBoundingClientRect();
    const delta = scrollDelta({ x: r.left, y: r.top, w: r.width, h: r.height }, region, layout === 'float' ? cardBox.h + 14 : 0);
    if (delta !== 0) {
      // Explicitly instant: html is `scroll-behavior: smooth`, and a glide
      // here would fight the spotlight's own.
      window.scrollTo({ top: window.scrollY + delta, left: window.scrollX, behavior: 'instant' });
    }
  }, []);

  // New step: bring the target into view, then glide to it.
  useLayoutEffect(() => {
    reveal();
    place(lastHole.current !== null || index > 0);
    // Focus the primary action so Enter continues and the dialog is announced.
    nextRef.current?.focus({ preventScroll: true });
    // The card's own entrance changes its height a frame later; settle once more.
    const raf = requestAnimationFrame(() => place(false));
    return () => cancelAnimationFrame(raf);
  }, [step.id, target, index, place, reveal]);

  // Keep the hole pinned to the target as the page moves or resizes.
  useEffect(() => {
    if (paused) return;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; place(false); });
    };
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.visualViewport?.addEventListener('resize', schedule);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(schedule);
      if (target) ro.observe(target);
      if (cardRef.current) ro.observe(cardRef.current);
      ro.observe(document.body);
    }
    // A slow poll for moves nothing above reports (content shifting above the
    // target without changing its size or the document's).
    const poll = window.setInterval(schedule, 400);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.visualViewport?.removeEventListener('resize', schedule);
      ro?.disconnect();
      window.clearInterval(poll);
    };
  }, [paused, place, target]);

  /* ── Focus, inertness, keys ───────────────────────────────────────── */

  // Look-only: everything but the card is inert. Try it: everything but the
  // target and the tour itself is inert, so assistive tech reaches exactly
  // the two things on offer.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const card = cardRef.current;
    if (!root || !card) return;
    if (tryIt && target) {
      const undo = inertOutside(target);
      root.removeAttribute('inert');
      return undo;
    }
    return inertOutside(card);
  }, [tryIt, target]);

  // Try it: hand focus to the control; back out: focus returns to the card.
  useEffect(() => {
    if (!tryIt) return;
    const first = focusables(target)[0];
    (first ?? doneTryRef.current)?.focus({ preventScroll: true });
  }, [tryIt, target]);

  const endTry = useCallback(() => {
    setTryStep(null);
    requestAnimationFrame(() => nextRef.current?.focus({ preventScroll: true }));
  }, []);

  // Tab cycles within what is live; Escape from inside the control ends Try it.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const card = cardRef.current;
      if (!card) return;
      if (e.key === 'Escape' && tryIt && !card.contains(document.activeElement)) {
        e.preventDefault();
        endTry();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = tryIt ? [...focusables(target), ...focusables(card)] : focusables(card);
      if (nodes.length === 0) { e.preventDefault(); return; }
      const i = nodes.indexOf(document.activeElement as HTMLElement);
      if (i === -1) {
        e.preventDefault();
        (e.shiftKey ? nodes[nodes.length - 1] : nodes[0]).focus();
      } else if (e.shiftKey && i === 0) {
        e.preventDefault();
        nodes[nodes.length - 1].focus();
      } else if (!e.shiftKey && i === nodes.length - 1) {
        e.preventDefault();
        nodes[0].focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tryIt, target, endTry]);

  const onCardKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const p = propsRef.current;
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        if (tryIt) { endTry(); return; }
        // Android BACK arrives as a synthetic Escape (native/bridge.ts): it
        // steps back (from the first step, to the chapter's intro, whose own
        // BACK then leaves). A real Escape key always exits.
        if (!e.nativeEvent.isTrusted) p.onBack();
        else p.onExit();
        break;
      case 'ArrowRight':
      case 'PageDown':
        if (tryIt) return;
        e.preventDefault();
        p.onNext();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        if (tryIt) return;
        e.preventDefault();
        p.onBack();
        break;
    }
  };

  /* ── Render ───────────────────────────────────────────────────────── */

  const Output = step.output;
  const words = step.title.split(' ');
  const hasTry = !!step.hint && !!target;

  return createPortal(
    <div
      ref={rootRef}
      className="fx-tools fx-scope tour-spot"
      data-try={tryIt ? '' : undefined}
      data-reduced={reduced ? '' : undefined}
      data-paused={paused ? '' : undefined}
    >
      {/* Resolves env(safe-area-inset-top) to pixels for the maths. */}
      <div ref={safeTopRef} className="tour-probe" aria-hidden="true" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} ref={(el) => { panels.current[i] = el; }} className="tour-dim" aria-hidden="true" />
      ))}
      <div ref={holeRef} className="tour-hole" aria-hidden="true" />
      {[0, 1, 2, 3].map((i) => (
        <span key={i} ref={(el) => { corners.current[i] = el; }} className={`tour-corner tour-corner-${i}`} aria-hidden="true"><i /></span>
      ))}

      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-modal={tryIt ? 'false' : 'true'}
        aria-labelledby="tour-step-title"
        aria-describedby="tour-step-body"
        onKeyDown={onCardKey}
      >
        <div className="tour-card-top">
          <span className="tour-eyebrow">{chapter.title}</span>
          <span className="tour-count" aria-hidden="true">{pad2(index + 1)}<span> / {pad2(total)}</span></span>
        </div>
        <div className="tour-progress" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < index ? 'is-past' : i === index ? 'is-current' : undefined} />
          ))}
        </div>
        <div key={step.id} className="tour-card-body">
          <h2 className="tour-title" id="tour-step-title">
            <span className="tour-sr">{step.title}</span>
            <span aria-hidden="true">
              {words.map((w, i) => (
                <span key={i}>
                  {i > 0 && ' '}
                  <span className="tour-word"><span style={{ ['--d' as string]: 40 + i * 45 } as CSSProperties}>{w}</span></span>
                </span>
              ))}
            </span>
          </h2>
          <p className="tour-body" id="tour-step-body">{step.body}</p>
          {step.hint && (
            <p className={`tour-hint${tryIt ? ' is-on' : ''}`}>
              <b>Try it:</b> {step.hint}
            </p>
          )}
          {Output && (
            <figure className="tour-output">
              <figcaption>Illustrative example · not your data</figcaption>
              <Output fmt={fmt} code={code} />
            </figure>
          )}
        </div>
        <div className="tour-actions">
          {index > 0 ? (
            <button type="button" className="tour-btn tour-ghost" onClick={props.onBack} disabled={tryIt}>Back</button>
          ) : <span className="tour-spacer" />}
          <div className="tour-actions-main">
            {hasTry && (tryIt ? (
              <button ref={doneTryRef} type="button" className="tour-btn tour-ghost" onClick={endTry}>Done trying</button>
            ) : (
              <button type="button" className="tour-btn tour-ghost" onClick={() => { setTryStep(step.id); props.haptic(); }}>Try it</button>
            ))}
            <button ref={nextRef} type="button" className="tour-btn tour-primary" onClick={props.onNext}>
              <span>{nextLabel}</span>
              {!isLast && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <div className="tour-card-foot">
          <button type="button" className="tour-link" onClick={props.onSkipChapter}>Skip chapter</button>
          <span aria-hidden="true">·</span>
          <button type="button" className="tour-link" onClick={props.onExit}>Exit tour</button>
        </div>
      </div>

      <p className="tour-sr" aria-live="polite" aria-atomic="true">
        {`${chapter.title}, step ${index + 1} of ${total}. ${step.title}. ${step.body}${tryIt ? ' The highlighted control is now usable. Press Escape when you are done.' : ''}`}
      </p>
    </div>,
    document.body,
  );
}
