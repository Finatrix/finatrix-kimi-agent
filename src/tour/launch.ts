/**
 * The product tour's public surface for the rest of the app. Import-free on
 * purpose, so a Settings button, the command palette or the landing page can
 * reach the tour without pulling a byte of it into their own chunk.
 *
 *   import { openTourHub } from '../../tour/launch';
 *   <button onClick={openTourHub}>Full tutorial</button>
 *
 * Inside the tools shell, `TourGate` (mounted once by ToolsLayout) listens for
 * these events and lazy-loads the tour. Outside it — the landing page — there
 * is nothing listening, so the entry point is a link into the shell carrying
 * `TOUR_LINK_STATE`; the gate picks the request up when the shell mounts.
 */

/** Window event the mounted gate listens for. `detail` is a `TourRequest`. */
export const TOUR_EVENT = 'fx:tour';

export type TourRequest =
  /** The "Full tutorial" screen: every chapter, progress, feature checklist. */
  | { kind: 'hub' }
  /** Every chapter in order, optionally starting at one. */
  | { kind: 'full'; from?: string }
  /** One chapter, optionally starting at a step (by step id). */
  | { kind: 'chapter'; id: string; step?: string }
  /** The chapter for whatever page this is; the hub when there is none. */
  | { kind: 'page'; path: string }
  /** The polite first-session offer (raised by the gate itself). */
  | { kind: 'offer' };

function send(request: TourRequest): void {
  try {
    window.dispatchEvent(new CustomEvent<TourRequest>(TOUR_EVENT, { detail: request }));
  } catch {
    /* no window (SSR / worker) — nothing to open into */
  }
}

/** Open the "Full tutorial" hub. */
export function openTourHub(): void {
  send({ kind: 'hub' });
}

/** Start the full tour (every chapter in order). */
export function startFullTour(from?: string): void {
  send({ kind: 'full', from });
}

/** Tour one chapter, e.g. `startChapterTour('budget')`. */
export function startChapterTour(id: string, step?: string): void {
  send({ kind: 'chapter', id, step });
}

/** Tour the page at `path` (the shell's "Tour this page" button). */
export function tourThisPage(path: string): void {
  send({ kind: 'page', path });
}

/**
 * Router state for a link INTO the tools shell that should open the tour on
 * arrival — the landing page's "Full tutorial" button:
 *
 *   <Link to="/tools/dashboard" state={TOUR_LINK_STATE}>…</Link>
 *
 * State rather than a query string: it never reaches the address bar, a
 * shared URL or a crawler, and a reload does not reopen the tour.
 */
export const TOUR_LINK_STATE = { fxTour: 'hub' } as const;

/** The request a navigation's router state carries, if any. */
export function tourRequestFromState(state: unknown): TourRequest | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as { fxTour?: unknown }).fxTour;
  if (value === 'hub') return { kind: 'hub' };
  if (value === 'full') return { kind: 'full' };
  return null;
}

/** Set on <html> while any part of the tour is on screen. */
export const TOUR_OPEN_ATTR = 'data-fx-tour';

/** True while the tour (hub, offer, intro or spotlight) is showing. */
export function isTourOpen(): boolean {
  try {
    return document.documentElement.hasAttribute(TOUR_OPEN_ATTR);
  } catch {
    return false;
  }
}
