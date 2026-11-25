import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

/** Roles a menu's focusable items can carry (WAI-APG menu button). */
const ITEM_SELECTOR = '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]';

/**
 * Menu-button behaviour per WAI-APG, shared by every header dropdown (the
 * account menu and the appearance menu): Escape closes and returns focus to
 * the trigger, the arrow keys, Home and End move between items, Tab leaves,
 * and a press outside closes. Callers render the markup; this owns the state
 * and the keyboard.
 */
export function useMenuButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const moveFocus = (delta: 1 | -1, edge?: 'first' | 'last') => {
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    if (!els.length) return;
    if (edge) {
      els[edge === 'first' ? 0 : els.length - 1].focus();
      return;
    }
    const i = els.indexOf(document.activeElement as HTMLElement);
    els[i < 0 ? (delta > 0 ? 0 : els.length - 1) : (i + delta + els.length) % els.length].focus();
  };

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => moveFocus(1, e.key === 'ArrowUp' ? 'last' : 'first'));
    } else if (e.key === 'Escape' && open) {
      close(true);
    }
  };

  const onMenuKeyDown = (e: ReactKeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.stopPropagation();
        close(true);
        break;
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(-1);
        break;
      case 'Home':
        e.preventDefault();
        moveFocus(1, 'first');
        break;
      case 'End':
        e.preventDefault();
        moveFocus(1, 'last');
        break;
      case 'Tab':
        close(false);
        break;
    }
  };

  const toggle = () => setOpen((o) => !o);

  // Refs and handlers are returned as separate fields, not bundled into prop
  // objects: the React Compiler treats reading a ref out of an object during
  // render as reading the ref itself.
  return { open, setOpen, close, toggle, rootRef, triggerRef, menuRef, onTriggerKeyDown, onMenuKeyDown };
}
