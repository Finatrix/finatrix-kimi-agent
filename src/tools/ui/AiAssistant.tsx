import {
  Suspense, createContext, lazy, useCallback, useContext, useMemo, useState,
} from 'react';
import type { AiFocus } from '../ai/focus';

/**
 * The FinatriX AI entry point.
 *
 * FinatriX AI is not only a floating panel — every screen that shows a figure
 * can open it already pointed at that figure. That requires one piece of state
 * shared across the whole money-tools shell, which is what `AiProvider` holds:
 * whether the assistant is open, and what it is open *about*.
 *
 * The split is deliberate:
 *
 *  - **`AiProvider`** wraps the shell, owns the state, and renders the panel. It
 *    must be an ancestor of every page, because any page may open the panel.
 *  - **`AiLauncher`** is only the floating button. It sits at the end of the
 *    shell so it paints above the page without needing a stacking hack.
 *  - **`useAskAi`** is what a category row or a transaction calls.
 *
 * The conversation surface — with the markdown renderer, the prompt layer and
 * the response validator — is a separate chunk fetched on first open, so the
 * assistant still costs nothing to people who never use it. The panel unmounts
 * on close; its transcript lives in storage, not in component state.
 */

const AiPanel = lazy(() => import('./AiPanel'));

const PANEL_ID = 'fx-ai-panel';

interface AiContextValue {
  /** Open the assistant, optionally pointed at what the user is looking at. */
  open: (focus?: AiFocus | null) => void;
  close: () => void;
  isOpen: boolean;
  /**
   * False before the cloud seed lands. Buttons render but do nothing rather
   * than opening an assistant that would read a half-empty store and report
   * figures the page is not showing.
   */
  enabled: boolean;
}

const AiCtx = createContext<AiContextValue | null>(null);

/**
 * Access the assistant from anywhere inside the money tools.
 *
 * Returns null outside the provider so a component can be rendered in isolation
 * — in a test, or on a route that has no assistant — without exploding. Callers
 * that must know use `enabled`.
 */
// Same pattern as ToastProvider/useToast and CurrencyProvider/useCurrency: the
// hook ships beside its provider so callers have one import, at the cost of a
// fast-refresh boundary in this one file.
// eslint-disable-next-line react-refresh/only-export-components
export function useAskAi(): AiContextValue | null {
  return useContext(AiCtx);
}

export function AiProvider({ enabled = true, children }: {
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setOpen] = useState(false);
  const [focus, setFocus] = useState<AiFocus | null>(null);
  // Bumped on every open so the panel can re-prime itself when the user clicks
  // a second ✨ button while it is already open — without that, opening
  // "Groceries" from behind an open panel would silently do nothing.
  const [openedAt, setOpenedAt] = useState(0);

  const open = useCallback((next: AiFocus | null = null) => {
    if (!enabled) return;
    setFocus(next);
    setOpen(true);
    setOpenedAt((n) => n + 1);
  }, [enabled]);

  const close = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, close, isOpen, enabled }),
    [open, close, isOpen, enabled],
  );

  return (
    <AiCtx.Provider value={value}>
      {children}
      {isOpen && (
        // No visible fallback: the chunk is small and a flash of placeholder
        // where a dialog is about to appear reads as a glitch. The trigger keeps
        // focus until the panel mounts and takes it.
        <Suspense fallback={null}>
          <AiPanel id={PANEL_ID} focus={focus} openedAt={openedAt} onClose={close} />
        </Suspense>
      )}
    </AiCtx.Provider>
  );
}

/** The floating trigger. Opens the assistant with no particular subject. */
export function AiLauncher() {
  const ai = useAskAi();
  if (!ai) return null;

  return (
    <>
      <button
        type="button"
        className="fx-ai-fab"
        onClick={() => ai.open()}
        aria-haspopup="dialog"
        aria-expanded={ai.isOpen}
        aria-controls={ai.isOpen ? PANEL_ID : undefined}
        aria-label="Open FinatriX AI"
        title="FinatriX AI"
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
          <path d="M18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
        </svg>
        <span className="fx-ai-fab-label">Ask AI</span>
      </button>

      <style>{FAB_STYLES}</style>
    </>
  );
}

const FAB_STYLES = `
.fx-tools .fx-ai-fab{position:fixed;right:16px;
  bottom:calc(18px + var(--fx-bottomnav-h,0px) + env(safe-area-inset-bottom));
  z-index:310;display:inline-flex;align-items:center;gap:8px;height:46px;padding:0 16px;
  border-radius:980px;border:1px solid #B8962E;background:var(--gold);color:#1a1400;
  font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;
  box-shadow:0 10px 28px -10px rgba(212,175,55,.6);
  transition:transform .15s var(--ease-out),box-shadow .15s var(--ease-out),background .2s ease;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;}
.fx-tools .fx-ai-fab:hover{transform:translateY(-2px);background:#E0BC4B;box-shadow:0 14px 34px -12px rgba(212,175,55,.7);}
.fx-tools .fx-ai-fab:active{transform:scale(.97);}
/* Below the sheet's breakpoint the label would crowd the thumb zone the bottom
   nav already occupies, so the trigger becomes a round icon button. */
@media(max-width:520px){
  .fx-tools .fx-ai-fab{width:46px;padding:0;justify-content:center;}
  .fx-tools .fx-ai-fab-label{display:none;}
}
@media (prefers-reduced-motion:reduce){
  .fx-tools .fx-ai-fab{transition:none;}
  .fx-tools .fx-ai-fab:hover,.fx-tools .fx-ai-fab:active{transform:none;}
}
@media print{.fx-tools .fx-ai-fab{display:none;}}
`;
