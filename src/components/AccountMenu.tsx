/**
 * Desktop account dropdown shared by the Tools and Careers shells.
 * Disclosure-menu behaviour per WAI-APG: Escape closes and returns focus to
 * the trigger, arrow keys move between items, outside clicks close, and the
 * trigger exposes aria-expanded. Menu items are provided by the caller so
 * each shell keeps its own destinations.
 */

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router';

export interface AccountMenuItem {
  label: string;
  /** Route to navigate to; omit for action-only items (e.g. sign out). */
  to?: string;
  onClick?: () => void;
  danger?: boolean;
}

const ITEM_CLASS = 'px-4 py-2.5 text-[13px] text-left hover:bg-hairline-2';

export function AccountMenu({ name, items }: { name: string; items: AccountMenuItem[] }) {
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
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
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
      // Wait for the menu to mount, then move focus into it.
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
        // Menus dismiss on Tab; let focus continue naturally from the trigger.
        close(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className="hidden md:block relative">
      <button
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink hover:text-accent-text transition-colors"
      >
        {name} ▾
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="fx-menu-pop absolute right-0 top-[calc(100%+8px)] min-w-[180px] bg-surface-2 border border-hairline rounded-lg py-1 flex flex-col z-30 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
        >
          {items.map((item) =>
            item.to ? (
              <Link
                key={item.label}
                to={item.to}
                role="menuitem"
                onClick={() => { setOpen(false); item.onClick?.(); }}
                className={`${ITEM_CLASS} ${item.danger ? 'text-[#E0726B]' : 'text-ink'}`}
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                role="menuitem"
                onClick={() => { setOpen(false); item.onClick?.(); }}
                className={`${ITEM_CLASS} ${item.danger ? 'text-[#E0726B]' : 'text-ink'}`}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
