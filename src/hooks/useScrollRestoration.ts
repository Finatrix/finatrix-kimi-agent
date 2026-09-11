import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';

/**
 * Scroll management for the whole single-page app.
 *
 * `BrowserRouter` + `<Routes>` — as opposed to a data router — ships no scroll
 * handling at all. React Router changes the URL, React swaps the tree, and the
 * viewport simply keeps whatever offset it had. Measured before this existed:
 * from the landing page at y=2000, clicking "Pricing" landed on /pricing still
 * at y=2000, two thirds of the way down a page the visitor had never seen.
 * Every internal link on the site did that, which is most of what "the site
 * doesn't flow" means.
 *
 * The rules, in priority order:
 *
 *   1. A fragment (`/learn/tax/deductions#how-it-works`) scrolls to that
 *      element. Smoothly — unless the reader asked for reduced motion. The CSS
 *      override in index.css cannot cancel a `behavior: 'smooth'` passed from
 *      script, so the check has to happen here as well.
 *   2. Back / forward (a POP) returns to the offset that entry was left at.
 *   3. Anything else starts at the top, instantly. A smooth glide across three
 *      thousand pixels is not polish, it is a wait.
 *
 * `history.scrollRestoration` is switched to "manual" because the browser's own
 * restore fires before a `lazy()` route has mounted — while the document is
 * still one Suspense fallback tall — and clamps the offset to nearly zero. That
 * also means reloads are ours to handle: see RELOAD_KEY below.
 *
 * Every restore retries across a few frames for the same reason: at the moment
 * the location changes, the element to scroll to (or the height to scroll into)
 * usually does not exist yet.
 */

/** Where the offset of the page being left behind survives a reload. */
const RELOAD_KEY = 'fx:scroll';

/**
 * How long a restore keeps retrying while a lazy route chunk mounts.
 *
 * Generous on purpose. Every route on this site is a `lazy()` import, so a
 * restore has to outlast a chunk fetch on a bad connection — measured at over
 * 1.2s for /pricing on a cold dev server, which is what a phone on 3G looks
 * like. The ceiling is only ever reached when the page never grows tall enough,
 * and any touch, wheel, key or pointer press cancels it long before then, so a
 * reader who has started reading is never yanked.
 */
const SETTLE_MS = 3000;

/** Anything the reader does that means "stop moving the page for me". */
const TAKEOVER = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * Offsets for this session's history entries, keyed by `location.key`.
 *
 * Module scope rather than a ref: the map has to outlive any component, and
 * writing it on every scroll frame has to stay a single `Map.set`. It is not
 * persisted — React Router mints fresh keys on a document load, so a stored
 * copy could never be matched up again. Reloads are handled by URL instead.
 */
const positions = new Map<string, number>();

function currentUrl(): string {
  return window.location.pathname + window.location.search;
}

/** Remembers the offset for the page being unloaded, so a reload lands on it. */
function persistForReload(y: number): void {
  try {
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ url: currentUrl(), y }));
  } catch {
    // Private mode, a full quota, a blocked cookie jar: scroll position is a
    // convenience, never a reason to throw during teardown.
  }
}

/**
 * The reload offset — once, for the entry the document opened on.
 *
 * `pagehide` also fires when the tab is closed or the reader leaves for another
 * site, so the record can outlive its usefulness. Spending it on the first
 * restore only means a later visit to the same URL in the same tab starts at
 * the top, as a fresh navigation should.
 */
let reloadOffsetSpent = false;

/** The reload offset, but only if it belongs to the URL actually being shown. */
function readReloadOffset(): number {
  if (reloadOffsetSpent) return 0;
  reloadOffsetSpent = true;
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    if (!raw) return 0;
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return 0;
    const { url, y } = saved as { url?: unknown; y?: unknown };
    return url === currentUrl() && typeof y === 'number' ? y : 0;
  } catch {
    return 0;
  }
}

function motionOk(): boolean {
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Runs `attempt` every frame until it reports success or the window closes, and
 * stops the moment the reader takes over. Returns its own canceller.
 */
function settle(attempt: () => boolean): () => void {
  const deadline = performance.now() + SETTLE_MS;
  let frame = 0;
  let cancelled = false;

  const stop = () => {
    if (cancelled) return;
    cancelled = true;
    cancelAnimationFrame(frame);
    for (const type of TAKEOVER) window.removeEventListener(type, stop);
  };

  // A reader who has already started scrolling must never be yanked back by a
  // restore that was still waiting for a chunk to arrive.
  for (const type of TAKEOVER) window.addEventListener(type, stop, { passive: true });

  const tick = () => {
    if (cancelled) return;
    if (attempt() || performance.now() > deadline) {
      stop();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return stop;
}

export function useScrollRestoration(): void {
  const { key, hash } = useLocation();
  const navigationType = useNavigationType();

  // Whichever entry is on screen. Held in a ref so the scroll listener below is
  // bound once for the life of the app rather than on every navigation.
  //
  // Updated in a layout effect declared BEFORE the restore below, so the two
  // run in that order: the new key is in place before anything scrolls, and a
  // scroll event — which the browser cannot dispatch until after layout effects
  // have run — is never filed against the entry that was just left.
  const keyRef = useRef(key);
  useLayoutEffect(() => {
    keyRef.current = key;
  }, [key]);

  // Remember where the reader is, continuously.
  //
  // The offset cannot simply be read at navigation time instead: by then React
  // has swapped in the new route's Suspense fallback, the document is one
  // screen tall, and the browser has already clamped `scrollY` — the outgoing
  // position is gone. One `Map.set` per scroll frame is the cheapest correct
  // answer, and this is the app's only scroll listener.
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    const remember = () => positions.set(keyRef.current, window.scrollY);
    const leave = () => persistForReload(window.scrollY);
    window.addEventListener('scroll', remember, { passive: true });
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('scroll', remember);
      window.removeEventListener('pagehide', leave);
    };
  }, []);

  // A layout effect, not a passive one: this runs before the browser paints, so
  // the new route is never shown at the old page's offset first.
  useLayoutEffect(() => {
    if (hash) {
      let id = hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        // A pasted link may contain an incomplete percent escape. Keep its
        // literal fragment; an invalid anchor must never crash the route.
      }
      return settle(() => {
        const target = id ? document.getElementById(id) : null;
        if (!target) return false;
        target.scrollIntoView({ block: 'start', behavior: motionOk() ? 'smooth' : 'auto' });
        return true;
      });
    }

    if (navigationType === 'POP') {
      // On the first entry of a document load there is nothing in the map yet;
      // the reload record stands in for it, so refreshing keeps your place.
      const y = positions.get(key) ?? readReloadOffset();
      if (y > 0) {
        return settle(() => {
          // Wait until the page is actually tall enough, or the scroll is
          // clamped and the reader lands somewhere arbitrary.
          if (document.documentElement.scrollHeight - window.innerHeight < y) return false;
          window.scrollTo({ top: y, left: 0, behavior: 'instant' });
          return true;
        });
      }
    }

    // Explicitly instant: `html { scroll-behavior: smooth }` would otherwise
    // animate a whole page height on every single navigation.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    return undefined;
  }, [key, hash, navigationType]);
}
