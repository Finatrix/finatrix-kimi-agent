/**
 * "More" disclosure for the Careers primary nav.
 *
 * The tab bar is capped at seven destinations on purpose, but the ten sections
 * that did not make the cut were only reachable from a list inside *Settings*
 * or the command palette — so most users never found Offers, Tasks, Recruiters,
 * Assessments or the Knowledge Base at all. This puts every one of them two
 * clicks from anywhere without adding an eighth pill, and groups them by the
 * job the user is doing rather than by the phase that happened to ship them.
 *
 * Behaviour follows WAI-APG's menu button, matching AccountMenu so the two
 * disclosures in the app bar feel identical: Escape closes and returns focus to
 * the trigger, Up/Down/Home/End move between items, Tab dismisses, and an
 * outside pointer-down closes.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router';
import { CAREERS_SECTION_GROUPS } from '../constants';

export function SectionMenu({ activeId }: { activeId: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  /** The pill reads as selected while the user is on one of its destinations. */
  const holdsActive = CAREERS_SECTION_GROUPS.some((g) => g.items.some((i) => i.id === activeId));

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

  return (
    <div ref={rootRef} className="fx-more">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className={`fx-navpill${holdsActive ? ' on' : ''}`}
      >
        <span className="fx-navpill-dot" style={{ backgroundColor: '#D4AF37' }} aria-hidden="true" />
        More
        <span className="fx-more-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="More Careers sections"
          onKeyDown={onMenuKeyDown}
          className="fx-more-pop"
        >
          {CAREERS_SECTION_GROUPS.map((group) => (
            <div role="group" aria-labelledby={`${baseId}-${group.id}`} key={group.id} className="fx-more-group">
              <div id={`${baseId}-${group.id}`} className="fx-more-head" role="presentation">
                {group.name}
              </div>
              {group.items.map((item) => (
                <Link
                  key={item.id}
                  to={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  aria-current={activeId === item.id ? 'page' : undefined}
                  className={`fx-more-item${activeId === item.id ? ' on' : ''}`}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
