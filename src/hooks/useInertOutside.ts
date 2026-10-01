import { useLayoutEffect, type RefObject } from 'react';

/**
 * Make everything outside a modal dialog `inert` while it is open.
 *
 * `aria-modal="true"` asserts that the page behind a dialog is out of reach,
 * and the focus traps in this codebase make that true for the Tab key. Screen
 * readers on phones do not move with Tab. TalkBack walks the accessibility
 * tree with swipes, and Android's WebView does not prune that tree for
 * `aria-modal` — measured on the app with TalkBack running: with the AI panel
 * open, swiping went on past its last control into the settings page hidden
 * behind it. `inert` removes that content for every assistive technology,
 * every engine and every input method at once (WAI-ARIA APG, Dialog; WCAG
 * 1.3.1 and 2.4.3).
 *
 * Only SIBLINGS along the path from the dialog up to <body> are made inert,
 * never an ancestor, so the overlay the dialog sits in stays live. Three kinds
 * of sibling are left alone:
 *  - already `inert` or `aria-hidden="true"` — already out of the tree, and a
 *    backdrop is exactly this: making it inert would also stop it receiving
 *    the tap that closes the dialog, because `inert` blocks pointer events;
 *  - live regions (`aria-live`, `role=status|alert|log`) — so a toast raised
 *    from inside the dialog is still announced;
 *  - script, style and template elements.
 * Only what this call changed is restored, so nested dialogs unwind cleanly.
 */
export function inertOutside(dialog: HTMLElement): () => void {
  const changed: HTMLElement[] = [];
  let node: HTMLElement = dialog;
  while (node.parentElement && node !== document.body) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue;
      if (/^(SCRIPT|STYLE|TEMPLATE|LINK)$/.test(sibling.tagName)) continue;
      if (sibling.hasAttribute('inert') || sibling.getAttribute('aria-hidden') === 'true') continue;
      if (sibling.hasAttribute('aria-live') || /^(status|alert|log)$/.test(sibling.getAttribute('role') ?? '')) continue;
      sibling.setAttribute('inert', '');
      changed.push(sibling);
    }
    node = node.parentElement;
  }
  return () => {
    for (const element of changed) element.removeAttribute('inert');
  };
}

/**
 * `inertOutside` for the lifetime of an open dialog.
 *
 * A LAYOUT effect on purpose. Dialogs hand focus back to their opener as they
 * close, and `focus()` on an element inside an inert subtree silently does
 * nothing. React runs every layout-effect cleanup during the commit, before any
 * passive-effect cleanup, so the page is live again by the time a dialog's
 * `useEffect` cleanup restores focus — whatever order the hooks were written
 * in. (A close handler that focuses synchronously, before the dialog has even
 * unmounted, must wait for the commit instead; see CommandPalette's `close`.)
 */
export function useInertOutside(ref: RefObject<HTMLElement | null>, active = true): void {
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!active || !dialog) return;
    return inertOutside(dialog);
  }, [ref, active]);
}
