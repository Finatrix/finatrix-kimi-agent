import { useLayoutEffect, type RefObject } from 'react';

/**
 * SVG text never wraps or clips, so a label that is wider than its card just
 * runs past the edge. The illustrations therefore mark each label with the
 * width it has (`data-fit`, in the illustration's own units) and, for text a
 * script rewrites such as count-ups, the final string to measure
 * (`data-sample`). A label that would overflow is scaled down to fit; one that
 * already fits is left alone. Currency symbols and grouping change the length
 * of every figure, so nothing here can assume how wide a string will be.
 */
const MIN_SCALE = 0.62;

export function fitSvgText(root: Element): void {
  root.querySelectorAll<SVGTextElement>('text[data-fit]').forEach((el) => {
    const max = Number(el.dataset.fit);
    if (!(max > 0)) return;
    el.style.removeProperty('font-size');
    const base = parseFloat(getComputedStyle(el).fontSize);
    const kept = el.textContent;
    const sample = el.dataset.sample;
    if (sample) el.textContent = sample;
    let width = 0;
    try { width = el.getComputedTextLength(); } catch { width = 0; }
    if (sample) el.textContent = kept;
    if (width > max && base > 0) {
      el.style.fontSize = `${(base * Math.max(max / width, MIN_SCALE)).toFixed(2)}px`;
    }
  });
}

/** Fit once on mount, and again when web fonts settle (they change glyph widths). */
export function useFitSvgText(ref: RefObject<SVGSVGElement | null>): void {
  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    fitSvgText(svg);
    let live = true;
    void document.fonts?.ready.then(() => { if (live) fitSvgText(svg); });
    return () => { live = false; };
  }, [ref]);
}
