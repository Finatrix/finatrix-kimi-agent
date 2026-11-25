import type { ReactElement } from 'react';
import { useTheme, type ThemeMode } from '../context/ThemeContext';
import { useMenuButton } from '../hooks/useMenuButton';

/**
 * Appearance: Light, Dark or System.
 *
 * It replaced a two-state sun/moon switch. A switch can only pin a theme, so
 * one tap took the site off the device setting for good, and there was no way
 * back to "follow my phone" from the header (Apple HIG, dark-mode.md › Best
 * practices: respect the system appearance, and let an app-specific choice
 * include it). System is the default until the person picks something else.
 *
 * The trigger shows the current *choice* (a half-filled disc for System), and
 * its accessible name says what it is and what is chosen.
 */
const ICONS: Record<ThemeMode, ReactElement> = {
  light: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
  system: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
    </svg>
  ),
};

const OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'system', label: 'System' },
];

export default function AppearanceMenu({ className = '', tour }: { className?: string; /** Product-tour anchor (`data-tour`). */ tour?: string }) {
  const { mode, setMode } = useTheme();
  const { open, close, toggle, rootRef, triggerRef, menuRef, onTriggerKeyDown, onMenuKeyDown } = useMenuButton();
  const current = OPTIONS.find((o) => o.mode === mode)!;

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`} data-tour={tour}>
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={onTriggerKeyDown}
        aria-label={`Appearance: ${current.label}`}
        title={`Appearance: ${current.label}`}
        className="fx-icon-btn"
      >
        {ICONS[mode]}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKeyDown}
          aria-label="Appearance"
          className="fx-menu-pop fx-menu absolute right-0 top-[calc(100%+8px)] z-30 min-w-[176px]"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.mode}
              type="button"
              role="menuitemradio"
              aria-checked={o.mode === mode}
              onClick={() => {
                setMode(o.mode);
                close(true);
              }}
              className="fx-menu-item"
            >
              {ICONS[o.mode]}
              <span className="flex-1">{o.label}</span>
              {o.mode === mode && (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
