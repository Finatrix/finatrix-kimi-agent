import { useEffect, type RefObject } from 'react';

/**
 * Keyboard focus behaviour for a modal dialog: trap it, then give it back.
 *
 * `aria-modal="true"` tells assistive technology that everything outside the
 * dialog is inert — but it is only an assertion. The browser still tabs
 * straight out of the dialog into the page behind it, so a keyboard or
 * screen-reader user lands on controls their AT has just been told do not
 * exist. The trap is what makes the assertion true (WAI-ARIA APG, Dialog).
 *
 * Restoring focus on close is the other half, and the more commonly missed one:
 * without it the caret falls back to `<body>` and the next Tab starts from the
 * top of the document, which for someone who opened the dialog from a control
 * halfway down a long page means finding their place again by hand every time.
 *
 * Deliberately narrow. It does NOT own Escape — dialogs differ on what Escape
 * should do (dismiss, back out of a nested confirmation, close a combobox
 * first) and a hook that guessed would be wrong somewhere. Callers keep their
 * own Escape handler.
 */

/**
 * Everything that can hold focus. Kept here, once: two components had
 * hand-rolled copies of this selector that had already drifted apart — one
 * excluded disabled inputs, the other did not, so a disabled field could become
 * the trap's boundary and Shift+Tab would stick on it.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Is this control actually rendered, and therefore actually focusable?
 *
 * Deliberately NOT `offsetParent !== null`, which is the usual shorthand and
 * the one two components here were already using. That property depends on
 * layout, so it is null in every environment that does not do layout — which
 * includes jsdom, where it silently reduces the trap to a single element and
 * makes Tab a no-op. A guard that cannot be tested is a guard nobody can trust.
 *
 * `checkVisibility` asks the question directly. Where it is unavailable the
 * answer is "assume visible": including a hidden control in the cycle is a
 * blemish, whereas excluding a visible one breaks the trap outright.
 */
function isRendered(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
  return typeof el.checkVisibility === 'function'
    ? el.checkVisibility({ visibilityProperty: true })
    : true;
}

/** Focusable descendants that are actually rendered, in document order. */
function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isRendered);
}

export interface DialogFocusOptions {
  /** The dialog element. Focus is confined to its subtree. */
  containerRef: RefObject<HTMLElement | null>;
  /** Whether the dialog is currently shown. */
  open: boolean;
  /**
   * What to focus when it opens. Defaults to the first focusable descendant —
   * or, when nothing is focusable, the container itself, so focus never stays
   * behind on the page the dialog is covering.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function useDialogFocus({ containerRef, open, initialFocusRef }: DialogFocusOptions): void {
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const returnTo = document.activeElement as HTMLElement | null;

    // Deferred by a frame: an opening dialog is frequently mid-animation, and
    // focusing a node the browser still considers hidden is a no-op that leaves
    // focus on the trigger with the dialog open in front of it.
    const raf = requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? focusableWithin(container)[0] ?? container;
      if (target === container && !container.hasAttribute('tabindex')) {
        // A container with nothing focusable in it still has to receive focus,
        // and only a focusable element can. `-1` keeps it out of the tab order.
        container.setAttribute('tabindex', '-1');
      }
      target.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const nodes = focusableWithin(container);
      if (nodes.length === 0) {
        // Nothing to move between — hold focus rather than letting Tab escape
        // to a page that is meant to be inert.
        event.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      // Also covers focus having escaped already (active is outside the
      // dialog), which is how a trap silently stops working after a re-render
      // removes the node that had focus.
      if (!container.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Capture phase, so the trap runs before any handler inside the dialog can
    // stop the event from propagating.
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown, true);
      // Only if the element is still in the document — a dialog opened from a
      // row that the dialog's own action then deleted has nothing to go back
      // to, and calling `focus()` on a detached node silently focuses `<body>`
      // anyway.
      if (returnTo && returnTo.isConnected) returnTo.focus();
    };
  }, [open, containerRef, initialFocusRef]);
}
