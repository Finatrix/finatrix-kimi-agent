/**
 * A modal sheet: centred dialog on desktop, bottom sheet on phones, or a
 * right-hand side panel (`side`). Portalled to <body> so no transformed
 * ancestor can trap its fixed positioning, with a focus trap, Escape to close,
 * focus returned to the opener, and the shared reference-counted scroll lock.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { CxIcon } from './icons';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
  side = false,
  dismissable = true,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  side?: boolean;
  /** False for a question that must be answered with a button (no Escape, no scrim click). */
  dismissable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Read through a ref so a parent passing a fresh arrow each render does not
  // re-run the effect (which would bounce focus out and back in).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const head = items[0]!;
      const tail = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, dismissable]);

  if (!open) return null;
  return createPortal(
    <div className="fx-tools fx-scope cx">
      <div className="cx-scrim" onClick={dismissable ? onClose : undefined} aria-hidden="true" />
      <div
        ref={ref}
        className={`cx-sheet ${side ? 'cx-sheet-side' : 'cx-sheet-center'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="cx-sheet-head">
          <h2 id={titleId}>{title}</h2>
          {dismissable && (
            <button type="button" className="cx-icon-btn" onClick={onClose} aria-label="Close">
              <CxIcon name="close" />
            </button>
          )}
        </div>
        <div className="cx-sheet-body">{children}</div>
        {footer && <div className="cx-sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
