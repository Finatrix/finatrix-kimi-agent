import { useCallback, useEffect, useState } from 'react';

/**
 * ⌘K / Ctrl+K, and the open state behind it.
 *
 * Lives in a hook because both shells — the money workspace and Careers — offer
 * the same palette, and a shortcut that works on one half of a product is worse
 * than no shortcut at all: it teaches a reflex that then fails.
 *
 * The listener sits on `window` so it fires from any control, and prevents the
 * default so it never reaches the browser's own Ctrl+K (focus the address bar's
 * search field).
 */
export function useCommandPalette(): {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
} {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey) || e.altKey) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return {
    open,
    openPalette: useCallback(() => setOpen(true), []),
    closePalette: useCallback(() => setOpen(false), []),
  };
}
