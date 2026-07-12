import { useEffect, useState } from 'react';
import { useBodyScrollLock } from './useBodyScrollLock';

/**
 * State for the <768px navigation drawer shared by the Tools and Careers
 * shells. Locks body scroll while the drawer is open, and force-closes the
 * drawer whenever the viewport is (or becomes) desktop-width — there the
 * drawer is display:none, so an orphaned scroll-lock would silently freeze
 * the page with no visible way to recover.
 */
export function useMobileDrawer(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);

  useBodyScrollLock(open);

  // Close on any crossing into the ≥768px range (and reconcile once on mount).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return [open, setOpen];
}
