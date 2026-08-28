import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The off-canvas navigation drawer (<768px) shared by the Tools and Careers
 * shells. Both shells previously inlined an identical overlay + panel; this is
 * the single implementation they now both render.
 *
 * Accessibility — the closed drawer must not exist for keyboard or assistive
 * tech. It stays mounted (so it can slide in and out), and `opacity-0` +
 * `pointer-events-none` only hide it visually: every link and button inside
 * remained tabbable and announced. `inert` removes the whole subtree from the
 * focus order and the accessibility tree; `aria-hidden` is kept alongside it
 * for engines that have not shipped `inert` yet. Neither is set while open.
 *
 * Behaviour while open: Escape closes, focus moves into the panel, and focus
 * returns to whatever opened it (the app-bar hamburger or the bottom-bar
 * "More" button) on close — the dialog contract those triggers advertise.
 */
export function MobileDrawer({
  id,
  open,
  onClose,
  label,
  children,
  footer,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  /** Accessible name for the drawer's navigation landmark. */
  label: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Latest onClose without re-running the open effect on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  /**
   * Tell the document a drawer is open, so the floating docks get out of the way.
   *
   * The AI launcher and the Wallet are `position: fixed` at `--z-fab` (310) and
   * portaled to `document.body`; this drawer sits at 40. So both pills painted
   * ON TOP of an open drawer — over its links, catching taps meant for the
   * navigation underneath. They are outside this component's subtree and
   * outside the shell's, so a class on `document.body` is the one channel that
   * reaches them (`tools.css` hides them under it).
   */
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('fx-drawer-open');
    return () => document.body.classList.remove('fx-drawer-open');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    opener.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Only reclaim focus if it is still inside the drawer we are closing —
      // a link click has already moved focus (or navigated) by now.
      if (panel?.contains(document.activeElement)) opener.current?.focus?.();
    };
  }, [open]);

  return (
    <div
      id={id}
      className={`md:hidden fixed inset-0 z-40 transition-opacity duration-300 ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      inert={!open}
      aria-hidden={!open || undefined}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <nav
        ref={panelRef}
        aria-label={label}
        className={`absolute top-0 left-0 h-full w-[82%] max-w-[320px] bg-surface-2 border-r border-hairline-2 flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-12 px-4 border-b border-hairline-2 shrink-0">
          <span className="font-mono text-[12px] uppercase tracking-[0.16em] text-ink">FinatriX</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="p-2 -mr-2 text-ink-3 hover:text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">{children}</div>
        {footer && <div className="border-t border-hairline-2 p-4 shrink-0">{footer}</div>}
      </nav>
    </div>
  );
}
