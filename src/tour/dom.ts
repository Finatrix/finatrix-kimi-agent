import type { TourEnv, TourHookContext, TourNeed, TourStep } from './types';

/**
 * DOM helpers for the spotlight engine: finding the real element a step points
 * at, waiting for it to mount, and deciding whether a step applies at all.
 */

/**
 * Is this element actually on screen (not `display: none`, not inside a
 * closed `<details>` or a `hidden` region)?
 *
 * `checkVisibility` answers that directly. Where it is missing (jsdom, older
 * engines) the answer is "assume visible" — the same rule as useDialogFocus,
 * because wrongly skipping a real step is worse than pointing at a hidden one.
 */
export function isShown(el: Element): boolean {
  if (!el.isConnected) return false;
  if (el.closest('[hidden]')) return false;
  const fn = (el as HTMLElement).checkVisibility;
  if (typeof fn === 'function') {
    try {
      return fn.call(el, { visibilityProperty: true });
    } catch {
      return true;
    }
  }
  return true;
}

/** First element matching `selector` that is on screen. Several can match (desktop nav and phone nav share an anchor). */
export function findShown(selector: string, root: ParentNode = document): HTMLElement | null {
  let list: NodeListOf<HTMLElement>;
  try {
    list = root.querySelectorAll<HTMLElement>(selector);
  } catch {
    return null; // an invalid selector is a missing target, never a crash
  }
  for (const el of Array.from(list)) if (isShown(el)) return el;
  return null;
}

/**
 * Resolve once `selector` matches something on screen, or with null after
 * `ms`. Polls on animation frames (cheap; stops the moment it resolves) and
 * gives up early when `signal` aborts. Lazy routes and conditional sections
 * mount a few frames after navigation, so a single query would miss them.
 */
export function waitForShown(selector: string, ms = 1500, signal?: AbortSignal): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const found = findShown(selector);
    if (found || ms <= 0) { resolve(found); return; }
    const deadline = Date.now() + ms;
    let raf = 0;
    let timer = 0;
    const done = (el: HTMLElement | null) => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(el);
    };
    const onAbort = () => done(null);
    signal?.addEventListener('abort', onAbort);
    const tick = () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      const el = findShown(selector);
      if (el) { done(el); return; }
      if (Date.now() >= deadline) { done(null); return; }
      // Whichever comes first: the next frame, or — in a hidden tab, where
      // rAF is throttled to nothing — a timer that keeps the wait honest.
      raf = requestAnimationFrame(tick);
      timer = window.setTimeout(tick, 120);
    };
    tick();
  });
}

export function meetsNeeds(needs: readonly TourNeed[] | undefined, env: TourEnv): boolean {
  if (!needs) return true;
  return needs.every((n) => {
    switch (n) {
      case 'web': return !env.native;
      case 'native': return env.native;
      case 'signedIn': return env.signedIn;
      case 'signedOut': return !env.signedIn;
      case 'data': return env.hasData;
      case 'noData': return !env.hasData;
      case 'wide': return env.wide;
      case 'narrow': return !env.wide;
      default: return false;
    }
  });
}

/**
 * The steps a chapter will show, decided up front so "n of N" is honest.
 *
 * Kept: steps whose needs hold AND that either have no target (a centred card),
 * have a `before` hook (which may be what makes the target appear), or whose
 * target is already on screen. A step dropped here is never mentioned; a kept
 * step whose target still fails to appear at its turn is dropped then, also
 * silently.
 */
export function planSteps(
  steps: readonly TourStep[],
  env: TourEnv,
  present: (selector: string) => boolean,
): TourStep[] {
  return steps.filter((s) => {
    if (!meetsNeeds(s.needs, env)) return false;
    if (!s.target || s.before || s.route) return true;
    return present(s.target);
  });
}

/** True when the element (or an ancestor) is fixed or sticky — it moves with the viewport, so never scroll for it. */
export function isPinned(el: Element): boolean {
  for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
    const pos = getComputedStyle(node).position;
    if (pos === 'fixed' || pos === 'sticky') return true;
  }
  return false;
}

/** The hook helpers a step's before/after receive. */
export function hookContext(env: TourEnv): TourHookContext {
  return {
    env,
    query: (selector) => findShown(selector),
    click: (selector) => {
      const el = findShown(selector);
      if (!el) return false;
      el.click();
      return true;
    },
    expand: (selector) => {
      let el: Element | null;
      try { el = document.querySelector(selector); } catch { el = null; }
      if (!el) return false;
      if (el instanceof HTMLDetailsElement) {
        if (!el.open) el.open = true;
        return true;
      }
      const toggle = el.matches('[aria-expanded]') ? el : el.querySelector('[aria-expanded]');
      if (toggle instanceof HTMLElement && toggle.getAttribute('aria-expanded') === 'false') {
        toggle.click();
        return true;
      }
      return false;
    },
    reveal: (selector) => {
      let el: Element | null;
      try { el = document.querySelector(selector); } catch { el = null; }
      let opened = false;
      for (let node = el?.parentElement ?? null; node && node !== document.body; node = node.parentElement) {
        if (node instanceof HTMLDetailsElement && !node.open) {
          node.open = true;
          opened = true;
        } else if (node.hidden && node.id) {
          const id = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(node.id) : node.id.replace(/["\\]/g, '\\$&');
          let toggle: HTMLElement | null = null;
          try { toggle = document.querySelector<HTMLElement>(`[aria-controls="${id}"][aria-expanded="false"]`); } catch { toggle = null; }
          if (toggle) {
            toggle.click();
            opened = true;
          }
        }
      }
      return opened;
    },
    waitFor: (selector, ms) => waitForShown(selector, ms),
  };
}
