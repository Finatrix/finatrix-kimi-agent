import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useInertOutside } from '../../hooks/useInertOutside';
import { useSheetDrag } from '../../hooks/useSheetDrag';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * A modal sheet for the tools: a centred dialog on desktop, a bottom sheet on
 * phones (pull the header down to close).
 *
 * Mount it only while open. It is portalled to <body> inside `fx-tools
 * fx-scope`, so no transformed ancestor can capture its fixed position and the
 * tools' colour tokens still apply. Focus moves in on open, is trapped, and goes
 * back to the opener on close; Escape and the backdrop close it; the page
 * behind is inert and does not scroll.
 */
export function ToolSheet({
  title, description, onClose, children, footer, initialFocus,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Sticky actions at the bottom of the sheet. */
  footer?: ReactNode;
  /** Selector for the element to focus first; defaults to the first control. */
  initialFocus?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useBodyScrollLock(true);
  useInertOutside(cardRef);
  useSheetDrag(cardRef, headRef, onClose);

  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    const first = (initialFocus && card?.querySelector<HTMLElement>(initialFocus))
      || card?.querySelector<HTMLElement>(`.fx-sheet-body ${FOCUSABLE.split(',').join(', .fx-sheet-body ')}`)
      || card;
    first?.focus({ preventScroll: true });
    return () => {
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
    // Mount-only: re-running would yank focus while the user types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const card = cardRef.current;
      if (!card) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const head = items[0];
      const tail = items[items.length - 1];
      if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  return createPortal(
    <div className="fx-tools fx-scope">
      <style>{SHEET_STYLES}</style>
      <div
        className="fx-sheet-overlay"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          ref={cardRef}
          className="fx-sheet-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
        >
          <div ref={headRef} className="fx-sheet-head">
            <span className="fx-sheet-grab" aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <h2 id={titleId} className="fx-sheet-title">{title}</h2>
              {description && <p id={descId} className="note" style={{ margin: '4px 0 0' }}>{description}</p>}
            </div>
            <button type="button" className="fx-sheet-close" onClick={onClose} aria-label="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div className="fx-sheet-body">{children}</div>
          {footer && <div className="fx-sheet-foot">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const SHEET_STYLES = `
.fx-sheet-overlay{position:fixed;inset:0;z-index:var(--z-modal);display:flex;align-items:center;justify-content:center;
  padding:20px;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  animation:fxSheetFade .2s ease both;}
.fx-sheet-card{position:relative;display:flex;flex-direction:column;width:100%;max-width:520px;max-height:min(92dvh,860px);
  background:var(--card-solid,var(--card));border:1px solid var(--hair2);border-radius:22px;
  box-shadow:0 40px 90px -30px rgba(0,0,0,.7);animation:fxSheetIn 300ms cubic-bezier(0.23,1,0.32,1) both;outline:none;}
.fx-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px 22px 12px;position:relative;}
.fx-sheet-title{font-size:17px;font-weight:700;margin:0;letter-spacing:-.01em;}
.fx-sheet-grab{display:none;}
.fx-sheet-close{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:var(--ctl-h-md,38px);height:var(--ctl-h-md,38px);
  border-radius:10px;border:1px solid var(--hair2);background:var(--fill-03);color:var(--ink);cursor:pointer;transition:background .15s;}
@media (hover: hover) and (pointer: fine){.fx-sheet-close:hover{background:var(--fill-06);}}
.fx-sheet-body{padding:4px 22px 18px;overflow-y:auto;overscroll-behavior:contain;}
.fx-sheet-foot{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;padding:12px 22px calc(16px + var(--fx-safe-bottom,0px));
  border-top:1px solid var(--hair2);}
.fx-sheet-foot .btn{width:auto;}
@keyframes fxSheetFade{from{opacity:0}to{opacity:1}}
@keyframes fxSheetIn{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}
@keyframes fxSheetUp{from{transform:translateY(100%)}to{transform:none}}
@media (max-width:560px){
  .fx-sheet-overlay{padding:0;align-items:flex-end;}
  .fx-sheet-card{max-width:none;max-height:94dvh;border-radius:22px 22px 0 0;animation:fxSheetUp .3s cubic-bezier(0.23,1,0.32,1) both;}
  .fx-sheet-head{touch-action:none;padding-top:22px;cursor:grab;}
  .fx-sheet-grab{display:block;position:absolute;top:8px;left:50%;width:36px;height:5px;margin-left:-18px;border-radius:3px;background:var(--hair);}
}
@media (prefers-reduced-motion:reduce){.fx-sheet-overlay,.fx-sheet-card{animation:none !important;}}
`;
