import { useEffect, useRef, type RefObject } from 'react';

/** Below this width the transaction form is a bottom sheet rather than a dialog. */
const SHEET_QUERY = '(max-width: 560px)';
/** Pulled this far (px), or flicked this fast (px/ms), the sheet closes on release. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.11;

/**
 * Drag a bottom sheet down to dismiss it, from its grabber and header.
 *
 * The sheet follows the finger 1:1 downward and resists upward (it is already
 * fully open), with the transform written straight to the element so a drag
 * never re-renders the form. On release it either slides away — distance or a
 * quick flick, whichever comes first — or settles back (Apple HIG,
 * sheets.md › Best practices: support the swipe-down gesture to dismiss; Emil
 * Kowalski's velocity threshold). Only the handle area starts a drag, so the
 * form inside still scrolls normally.
 */
export function useSheetDrag(
  cardRef: RefObject<HTMLElement | null>,
  handleRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  /** When the surface is a bottom sheet (it is a centred dialog otherwise). */
  query: string = SHEET_QUERY,
  /** Whether the sheet is rendered; for sheets that mount before they open. */
  active = true,
) {
  // The latest callback, read at release time. Keeping it out of the effect's
  // dependencies matters: a parent re-render mid-drag (the press blurs a
  // field, which updates state) would otherwise tear the listeners down and
  // lose the gesture in progress.
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    if (!active) return;
    const card = cardRef.current;
    const handle = handleRef.current;
    if (!card || !handle || typeof window.matchMedia !== 'function') return;
    const sheet = window.matchMedia(query);
    let start: { y: number; t: number; lastY: number; lastT: number; v: number; id: number } | null = null;
    let dy = 0;

    // The `translate` property, not `transform`: it composes with whatever
    // transform a sheet already uses to position itself (the Wallet centres
    // itself with translateX(-50%)).
    const settle = (to: string, ms: number, ease: string) => {
      card.style.transition = `translate ${ms}ms ${ease}`;
      card.style.translate = to;
    };
    const onDown = (e: PointerEvent) => {
      if (!sheet.matches || e.button !== 0) return;
      // Leave the close button and any other control in the header alone.
      if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
      start = { y: e.clientY, t: e.timeStamp, lastY: e.clientY, lastT: e.timeStamp, v: 0, id: e.pointerId };
      dy = 0;
      card.style.transition = 'none';
      // Followed on the window, not only the handle: a finger leaves the
      // header within a few pixels, and pointer capture is not guaranteed to
      // hold on every engine.
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };
    const onMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const raw = e.clientY - start.y;
      dy = raw > 0 ? raw : raw * 0.2; // resists upward: it is already open
      const dt = Math.max(1, e.timeStamp - start.lastT);
      start.v = (e.clientY - start.lastY) / dt;
      start.lastY = e.clientY;
      start.lastT = e.timeStamp;
      card.style.translate = `0 ${dy}px`;
    };
    const stopFollowing = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    const onUp = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      stopFollowing();
      const flick = start.v >= DISMISS_VELOCITY && dy > 24;
      start = null;
      if (dy >= DISMISS_DISTANCE || flick) {
        settle('0 100%', 200, 'cubic-bezier(0.32, 0, 0.67, 0)');
        window.setTimeout(() => dismissRef.current(), 190);
      } else {
        settle('', 220, 'var(--ease-out)');
      }
    };

    handle.addEventListener('pointerdown', onDown);
    return () => {
      handle.removeEventListener('pointerdown', onDown);
      stopFollowing();
    };
  }, [cardRef, handleRef, query, active]);
}
