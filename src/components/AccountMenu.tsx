/**
 * Account menu shared by the Tools and Careers shells: an avatar button that
 * opens Profile, Settings and Sign out. Menu-button behaviour (keyboard,
 * Escape, outside press) comes from useMenuButton. Items are provided by the
 * caller so each shell keeps its own destinations.
 *
 * It shows at every width. On a phone it used to be hidden in favour of the
 * slide-out drawer, which the bottom tab bar has replaced.
 */

import { Link } from 'react-router';
import { useMenuButton } from '../hooks/useMenuButton';

export interface AccountMenuItem {
  label: string;
  /** Route to navigate to; omit for action-only items (e.g. sign out). */
  to?: string;
  onClick?: () => void;
  danger?: boolean;
}

export function AccountMenu({ name, items, tour }: { name: string; items: AccountMenuItem[]; /** Product-tour anchor (`data-tour`). */ tour?: string }) {
  const { open, setOpen, toggle, rootRef, triggerRef, menuRef, onTriggerKeyDown, onMenuKeyDown } = useMenuButton();
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const itemClass = (danger?: boolean) => `fx-menu-item${danger ? ' is-danger' : ''}`;

  return (
    <div ref={rootRef} className="relative shrink-0" data-tour={tour}>
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        aria-label={`Account: ${name}`}
        title={name}
        className="fx-icon-btn fx-avatar-btn"
      >
        <span aria-hidden="true">{initial}</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
          aria-label={`Account: ${name}`}
          className="fx-menu-pop fx-menu absolute right-0 top-[calc(100%+8px)] z-30 min-w-[200px]"
        >
          {/* Hidden from the accessibility tree: a menu may only own menu
              items, and the menu's own name already carries this. */}
          <p className="fx-menu-heading" aria-hidden="true">{name}</p>
          {items.map((item) =>
            item.to ? (
              <Link
                key={item.label}
                to={item.to}
                role="menuitem"
                onClick={() => { setOpen(false); item.onClick?.(); }}
                className={itemClass(item.danger)}
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); item.onClick?.(); }}
                className={itemClass(item.danger)}
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
