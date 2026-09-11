/**
 * Keep a right-anchored dropdown inside the viewport.
 *
 * THE BUG THIS EXISTS TO KILL
 * ---------------------------
 * A panel anchored with `right: 0` grows leftwards, so its width is only safe
 * if the anchor sits at the right edge of the screen. The notification bell
 * does not: it comes before the currency select, the theme toggle and the
 * account menu, roughly 15% of the way in from the right on a phone. A `92vw`
 * panel hung off it therefore started 7vw off the LEFT edge of the screen — the
 * heading, the icons and the left half of every message were simply not there.
 *
 * CSS cannot express "as wide as the room actually left of me", because that
 * distance depends on where the anchor landed once the header had laid itself
 * out. So it is measured.
 *
 * WHY NOT `position: fixed`
 * -------------------------
 * The tools header sets `backdrop-filter`, which makes it a containing block
 * for fixed descendants — a fixed panel inside it is positioned against the
 * header rather than the viewport, so the same overflow comes back wearing a
 * different hat. Measuring works wherever the anchor is, and assumes nothing
 * about what any ancestor is doing.
 *
 * WHEN IT MEASURES
 * ----------------
 * `measurePanel()` is called by the caller at the moment it opens the panel — an
 * event handler, where the anchor is already on screen and its box is final.
 * A ResizeObserver then covers the drift while the panel is open, because the
 * anchor also moves for reasons no event fires for: a web font landing, the
 * currency select rendering its widest option, an unread badge appearing.
 *
 * The observer is deliberately NOT the first measurement. It delivers nothing
 * for a document that is not being rendered — a hidden or backgrounded tab —
 * and a panel that opened unmeasured there would stay unmeasured until
 * something happened to resize it. Measuring on the click needs no such luck.
 *
 * WHY IT ALSO SHIFTS, AND ONLY ON A PHONE
 * ---------------------------------------
 * Clamping alone stops the overflow but leaves the panel as narrow as the
 * anchor happens to be far from the left edge — on a 375px screen the bell
 * leaves 225px, which is a cramped column for messages that are sentences.
 * The 140px BETWEEN the bell and the right edge of the screen is free, so on a
 * phone the panel is allowed to hang past its anchor and use it, which buys
 * back the full width of the screen.
 *
 * Only on a phone. On a desktop there is plenty of room to the left, and a
 * panel floated out to the corner would no longer look attached to the control
 * that opened it — the alignment is doing real work there.
 *
 * Returns a ref for the anchor, the style to spread onto the panel (empty while
 * closed or unmeasured, which leaves the stylesheet in charge), and the measure
 * function to call as the panel opens.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Breathing room between the panel's far edge and the edge of the screen. */
const VIEWPORT_MARGIN = 10;

/**
 * Below this the header is a crowded row and the panel is allowed to hang past
 * its anchor. Matches the width at which the tools header drops the currency
 * select — the same point at which that row stops having space to spare.
 */
const PHONE_MAX_WIDTH = 560;

/** What the panel needs on it. Empty until the anchor has been measured. */
export interface AnchoredPanelStyle {
  maxWidth?: number;
  right?: number;
}

export function useAnchoredPanelWidth<T extends HTMLElement>(open: boolean) {
  const anchorRef = useRef<T>(null);
  const [style, setStyle] = useState<AnchoredPanelStyle>({});

  const measurePanel = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const { right } = el.getBoundingClientRect();
    const viewport = window.innerWidth;
    // A viewport of zero is not a very narrow screen, it is a document that is
    // not being laid out — a hidden tab, a headless capture. Every number taken
    // from it would be fiction, so nothing is set and the stylesheet stays in
    // charge until there is something real to measure.
    if (viewport <= 0) return;

    // How far past the anchor the panel may hang, so its own right edge lands
    // at the edge of the screen. `right: -shift` on a right-anchored panel.
    const shift = viewport <= PHONE_MAX_WIDTH
      ? Math.max(0, Math.round(viewport - VIEWPORT_MARGIN - right))
      : 0;
    const room = Math.round(right + shift - VIEWPORT_MARGIN);
    setStyle(room > 0 ? { maxWidth: room, ...(shift ? { right: -shift } : {}) } : {});
  }, []);

  useEffect(() => {
    const el = anchorRef.current;
    if (!open || !el) return;

    // `resize` alone would miss a reflow that moves the anchor without changing
    // the window; the observer alone misses a document that is not rendering.
    // Together they cover both, and both are idempotent.
    window.addEventListener('resize', measurePanel);
    window.addEventListener('orientationchange', measurePanel);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measurePanel) : null;
    if (observer) {
      observer.observe(el);
      observer.observe(document.documentElement);
    }
    return () => {
      window.removeEventListener('resize', measurePanel);
      window.removeEventListener('orientationchange', measurePanel);
      observer?.disconnect();
    };
  }, [open, measurePanel]);

  return { anchorRef, panelStyle: open ? style : {}, measurePanel };
}
