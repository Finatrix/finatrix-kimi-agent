import {
  Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState,
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

/**
 * Session-scoped memory for whether the launcher is minimised.
 *
 * sessionStorage, deliberately, not localStorage: collapsing the launcher is a
 * "not right now, I'm working" gesture about the current sitting, not a
 * standing preference about the product. A tab opened tomorrow starts from the
 * default again — and because the value never leaves the tab it is not part of
 * the synced cloud payload.
 */
const FAB_KEY = 'fx_ai_fab';
/** Below this the bottom nav already owns the thumb zone, so we start collapsed. */
const COLLAPSE_BY_DEFAULT_BELOW = 768;

function readCollapsed(): boolean {
  try {
    const saved = sessionStorage.getItem(FAB_KEY);
    if (saved === 'collapsed') return true;
    if (saved === 'expanded') return false;
  } catch {
    // Private mode / storage disabled — fall through to the width default.
  }
  return typeof window !== 'undefined' && window.innerWidth < COLLAPSE_BY_DEFAULT_BELOW;
}

/**
 * The floating trigger.
 *
 * Two states, one component. Expanded it is the labelled gold pill with an
 * attached minimise control; collapsed it is the same pill reduced to its
 * sparkle mark. They share a fill, a radius, an elevation and a focus ring, so
 * minimising reads as the same object getting out of the way rather than as a
 * different widget appearing.
 *
 * The minimise control is inside the pill, sharing its border, rather than
 * floating beside it as a separate chip — a detached ✕ is the thing that makes
 * a launcher look like a third-party chat bubble bolted onto the page.
 */
export function AiLauncher() {
  const ai = useAskAi();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const askRef = useRef<HTMLButtonElement>(null);
  const showRef = useRef<HTMLButtonElement>(null);
  // Focus only follows a state change the user actually made. Without this the
  // launcher would steal focus from the page on first paint.
  const userToggled = useRef(false);

  useEffect(() => {
    if (!userToggled.current) return;
    userToggled.current = false;
    // Collapsing removes the button that had focus; without this the focus ring
    // lands on <body> and a keyboard user has to tab from the top of the page.
    (collapsed ? showRef : askRef).current?.focus();
  }, [collapsed]);

  const toggle = useCallback((next: boolean) => {
    userToggled.current = true;
    setCollapsed(next);
    try {
      sessionStorage.setItem(FAB_KEY, next ? 'collapsed' : 'expanded');
    } catch {
      // Non-fatal: the launcher still toggles, it just won't be remembered.
    }
  }, []);

  if (!ai) return null;

  return (
    <>
      <div className="fx-ai-dock">
        {collapsed ? (
          <button
            key="collapsed"
            ref={showRef}
            type="button"
            className="fx-ai-fab is-collapsed"
            onClick={() => toggle(false)}
            aria-expanded={false}
            aria-label="Show FinatriX AI"
            title="Show FinatriX AI"
          >
            <AiSparkle />
          </button>
        ) : (
          <div key="expanded" className="fx-ai-fab">
            <button
              ref={askRef}
              type="button"
              className="fx-ai-fab-ask"
              onClick={() => ai.open()}
              aria-haspopup="dialog"
              aria-expanded={ai.isOpen}
              aria-controls={ai.isOpen ? PANEL_ID : undefined}
              aria-label="Open FinatriX AI"
              title="FinatriX AI"
            >
              <AiSparkle />
              <span className="fx-ai-fab-label">Ask AI</span>
            </button>
            <button
              type="button"
              className="fx-ai-fab-min"
              onClick={() => toggle(true)}
              aria-label="Minimise FinatriX AI"
              title="Minimise"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 12h12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <style>{FAB_STYLES}</style>
    </>
  );
}

/** The FinatriX AI mark. Same glyph in both launcher states. */
function AiSparkle() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
      <path d="M18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </svg>
  );
}

const FAB_STYLES = `
/* The dock is the only fixed element. Anchoring it bottom-right and letting the
   pill size itself inside means swapping between the expanded and collapsed
   states changes nothing about the document — no reflow, no layout shift, and
   the pill always grows leftward from the same corner. */
.fx-tools .fx-ai-dock{position:fixed;right:16px;
  bottom:calc(18px + var(--fx-bottomnav-h,0px) + env(safe-area-inset-bottom));
  z-index:var(--z-fab);display:flex;justify-content:flex-end;}
.fx-tools .fx-ai-fab{display:inline-flex;align-items:center;height:var(--ctl-h-lg);
  border-radius:var(--ctl-pill);border:var(--ctl-bw) solid var(--fab-border);background:var(--gold);color:#1a1400;
  font-family:inherit;font-size:13px;font-weight:600;
  /* Elevation is the one thing that differs between themes: a gold glow is
     luminous on obsidian and invisible on cream, so on light the same lift is
     carried by a warm neutral shadow. Fill, border, radius, type and geometry
     are identical, so it stays one component in both. */
  box-shadow:var(--fab-shadow);
  transition:box-shadow var(--ctl-trans),background-color 200ms ease,transform var(--ctl-trans);
  animation:fxFabIn 220ms var(--ease-out) backwards;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;}
.fx-tools .fx-ai-fab:hover{background:#E0BC4B;box-shadow:var(--fab-shadow-hover);}

/* Both segments are transparent buttons inside the gold pill so the pill keeps
   a single border, a single elevation and a single silhouette. */
.fx-tools .fx-ai-fab-ask,.fx-tools .fx-ai-fab-min{display:inline-flex;align-items:center;justify-content:center;
  height:100%;background:none;border:none;color:inherit;font:inherit;cursor:pointer;
  border-radius:var(--ctl-pill);transition:transform var(--ctl-trans),background-color var(--ctl-trans);
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;}
.fx-tools .fx-ai-fab-ask{gap:8px;padding:0 6px 0 16px;}
.fx-tools .fx-ai-fab-ask:active{transform:scale(.97);}
/* The minimise control. Sized to clear the WCAG 2.2 (2.5.8) 24px target, and
   separated by a hairline of deeper gold rather than by a gap, so it reads as
   a facet of the pill instead of a second button parked next to it. */
.fx-tools .fx-ai-fab-min{width:34px;margin-right:5px;border-radius:50%;
  position:relative;color:color-mix(in srgb,#1a1400 78%,transparent);}
.fx-tools .fx-ai-fab-min::before{content:"";position:absolute;left:-1px;top:50%;transform:translateY(-50%);
  width:1px;height:20px;background:color-mix(in srgb,#1a1400 22%,transparent);}
.fx-tools .fx-ai-fab-min:hover{background:color-mix(in srgb,#1a1400 12%,transparent);color:#1a1400;}
.fx-tools .fx-ai-fab-min:active{transform:scale(.92);}

/* Collapsed: the same pill reduced to its mark. A circle at the lg rung, so it
   keeps the expanded state's height and its position never shifts. */
.fx-tools .fx-ai-fab.is-collapsed{width:var(--ctl-h-lg);padding:0;justify-content:center;cursor:pointer;}
.fx-tools .fx-ai-fab.is-collapsed:active{transform:scale(.94);}

/* Focus lands on the inner buttons, so the ring is drawn just outside the pill
   to stay visible against the gold fill. */
.fx-tools .fx-ai-fab-ask:focus-visible,.fx-tools .fx-ai-fab-min:focus-visible,
.fx-tools .fx-ai-fab.is-collapsed:focus-visible{outline:2px solid var(--ink);outline-offset:3px;}

@keyframes fxFabIn{from{opacity:0;transform:scale(.86);}to{opacity:1;transform:none;}}

/* The label is what makes the expanded pill worth expanding, so unlike before
   it survives down to the smallest screens — the collapsed state, not a
   breakpoint, is now how the launcher gets out of the way. */
@media(max-width:380px){
  .fx-tools .fx-ai-dock{right:12px;}
  .fx-tools .fx-ai-fab-ask{padding-left:13px;}
}
@media (prefers-reduced-motion:reduce){
  .fx-tools .fx-ai-fab{transition:none;animation:none;}
  .fx-tools .fx-ai-fab:hover,.fx-tools .fx-ai-fab-ask:active,
  .fx-tools .fx-ai-fab-min:active,.fx-tools .fx-ai-fab.is-collapsed:active{transform:none;}
}
@media print{.fx-tools .fx-ai-dock{display:none;}}
`;
