import { useEffect, useRef, type CSSProperties } from 'react';
import { easeOutExpo, type SceneClock } from './motion';

/**
 * Drawing helpers shared by every film-style illustration: the first-run
 * intro's four scenes (art.tsx) and the product tour's chapter intros
 * (src/tour/chapters). One vocabulary, so a tour chapter moves and reads like
 * the intro it follows.
 */

/** Stagger delay (ms) for a CSS entrance keyed off `--d` (walkthrough.css). */
export const d = (ms: number): CSSProperties => ({ ['--d' as string]: ms } as CSSProperties);

/** A point on a circle, clockwise from 12 o'clock, in degrees. */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

/** An SVG arc path from `a0` to `a1` degrees (clockwise from 12 o'clock). */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * A rounded rectangle with a circular socket cut through it (even-odd fill).
 * Surfaces the orb has to show through — the scene layer paints above it —
 * get one of these, so the orb reads as sitting IN the field or card.
 */
export function socketed(x: number, y: number, w: number, h: number, r: number, cx: number, cy: number, cr: number): string {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`
    + `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
    + `M${cx - cr} ${cy}a${cr} ${cr} 0 1 0 ${cr * 2} 0a${cr} ${cr} 0 1 0 ${-cr * 2} 0Z`;
}

/** Count a text node up from zero on the scene clock. */
export function useCountUp(clock: SceneClock, at: number, dur: number, to: number, fmt: (n: number) => string) {
  const ref = useRef<SVGTextElement>(null);
  // Callers often pass an inline formatter; keep the latest in a ref so a new
  // function identity each render doesn't restart (and freeze) the count.
  const fmtRef = useRef(fmt);
  useEffect(() => { fmtRef.current = fmt; });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!clock.instant) el.textContent = fmtRef.current(0);
    clock.tween(at, dur, (p) => { el.textContent = fmtRef.current(to * p); }, easeOutExpo);
  }, [clock, at, dur, to]);
  return ref;
}
