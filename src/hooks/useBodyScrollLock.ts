import { useEffect } from 'react';

/**
 * Reference-counted body scroll lock.
 *
 * Overlays (drawers, modals) each held their own `prev = body.style.overflow`
 * snapshot and restored it on close. That is order-dependent: if two overlays
 * overlap and close in non-LIFO order (e.g. the mobile drawer is force-closed
 * by a viewport resize while a modal is still open), the last closer restores
 * a stale `'hidden'` and the page is left frozen with nothing on screen.
 * Counting active locks makes lock/unlock correct under any interleaving.
 */
let locks = 0;

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    locks += 1;
    if (locks === 1) document.body.style.overflow = 'hidden';
    return () => {
      locks -= 1;
      if (locks === 0) document.body.style.overflow = '';
    };
  }, [active]);
}
