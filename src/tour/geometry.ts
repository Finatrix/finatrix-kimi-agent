import type { Placement } from './types';

/**
 * Pure placement maths for the spotlight: where the hole goes, how far to
 * scroll so the target is in view, and where the coach card sits. No DOM, so
 * it is tested directly (src/test/tour.engine.test.ts).
 */

export interface Box { x: number; y: number; w: number; h: number }

/**
 * Three ways to show the coach card:
 *  - `sheet`: phones — a bottom sheet, the target scrolled into the space above;
 *  - `side`:  short landscape screens — a column down the right edge;
 *  - `float`: everything else — beside the target.
 */
export type CardLayout = 'float' | 'sheet' | 'side';

export function layoutFor(vw: number, vh: number): CardLayout {
  if (vw < 640) return 'sheet';
  if (vh < 520) return 'side';
  return 'float';
}

/** Breathing room between the target and the edge of the hole. */
export const HOLE_PAD = 8;
/** Gap between the hole and a floating card, and the card's margin to the viewport. */
const GAP = 14;
const MARGIN = 12;

/** The padded hole for a target, clamped to the viewport so it never runs off screen. */
export function holeFor(rect: Box, vw: number, vh: number, pad = HOLE_PAD): Box {
  const x0 = Math.max(2, rect.x - pad);
  const y0 = Math.max(2, rect.y - pad);
  const x1 = Math.min(vw - 2, rect.x + rect.w + pad);
  const y1 = Math.min(vh - 2, rect.y + rect.h + pad);
  return { x: Math.round(x0), y: Math.round(y0), w: Math.max(0, Math.round(x1 - x0)), h: Math.max(0, Math.round(y1 - y0)) };
}

/** Where on screen a target should end up so it is not under the header or the card. */
export function visibleRegion(layout: CardLayout, vw: number, vh: number, topInset: number, card: { w: number; h: number }): Box {
  const top = topInset;
  if (layout === 'sheet') return { x: 0, y: top, w: vw, h: Math.max(80, vh - card.h - top) };
  if (layout === 'side') return { x: 0, y: top, w: Math.max(80, vw - card.w - GAP), h: Math.max(80, vh - top) };
  return { x: 0, y: top, w: vw, h: Math.max(80, vh - top) };
}

/**
 * How far to scroll (positive = down) so `rect` sits inside `region`. Zero
 * when it already does. A target taller than the region is aligned to its
 * top; otherwise it is centred, leaving room for a floating card below when
 * `roomBelow` fits — so the card can sit beside the thing it describes.
 */
export function scrollDelta(rect: Box, region: Box, roomBelow = 0, margin = 16): number {
  const top = region.y + margin;
  const bottom = region.y + region.h - margin;
  const span = bottom - top;
  if (rect.y >= top && rect.y + rect.h <= bottom && (roomBelow <= 0 || rect.y + rect.h + roomBelow <= bottom || rect.y - roomBelow >= top)) return 0;
  if (rect.h >= span) return Math.round(rect.y - top);
  const want = roomBelow > 0 && rect.h + roomBelow <= span
    ? top + (span - rect.h - roomBelow) / 2
    : top + (span - rect.h) / 2;
  return Math.round(rect.y - want);
}

export interface CardSpot { x: number; y: number; side: Placement | 'over' }

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Where a floating card goes: the preferred side when it fits, then the
 * others in a fixed order, and when nothing fits (a target the size of the
 * screen) a corner away from the target's centre.
 */
export function placeCard(hole: Box | null, card: { w: number; h: number }, vw: number, vh: number, prefer: Placement = 'auto'): CardSpot {
  if (!hole) return { x: Math.round((vw - card.w) / 2), y: Math.round((vh - card.h) / 2), side: 'over' };
  // The card paints above the app header, so it may use that space too.
  const minY = MARGIN;
  const order: Placement[] = prefer === 'auto' || prefer === 'bottom'
    ? ['bottom', 'top', 'right', 'left']
    : prefer === 'top' ? ['top', 'bottom', 'right', 'left']
      : prefer === 'right' ? ['right', 'left', 'bottom', 'top']
        : ['left', 'right', 'bottom', 'top'];
  const cx = clamp(hole.x + hole.w / 2 - card.w / 2, MARGIN, vw - card.w - MARGIN);
  const cy = clamp(hole.y + hole.h / 2 - card.h / 2, minY, vh - card.h - MARGIN);
  for (const side of order) {
    if (side === 'bottom') {
      const y = hole.y + hole.h + GAP;
      if (y + card.h <= vh - MARGIN) return { x: Math.round(cx), y: Math.round(y), side };
    } else if (side === 'top') {
      const y = hole.y - GAP - card.h;
      if (y >= minY) return { x: Math.round(cx), y: Math.round(y), side };
    } else if (side === 'right') {
      const x = hole.x + hole.w + GAP;
      if (x + card.w <= vw - MARGIN) return { x: Math.round(x), y: Math.round(cy), side };
    } else {
      const x = hole.x - GAP - card.w;
      if (x >= MARGIN) return { x: Math.round(x), y: Math.round(cy), side };
    }
  }
  const onRight = hole.x + hole.w / 2 > vw / 2;
  return {
    x: Math.round(onRight ? MARGIN : vw - card.w - MARGIN),
    y: Math.round(vh - card.h - MARGIN),
    side: 'over',
  };
}
