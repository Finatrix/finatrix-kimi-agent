import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';

/**
 * Secondary information, one press away — and out of the way until then.
 *
 * WHY THIS EXISTS
 * ---------------
 * A tool page is Inputs → Result → What next. Everything else on it — how the
 * answer was worked out, a worked example, the FAQ, the caveats that only
 * matter to someone checking our arithmetic — is valuable, and on a phone it
 * was also 50–85% of every page: measured at 375px, the education block alone
 * ran 3,500–6,500px under results that fit in two screens. This collapses that
 * kind of content by default without deleting a word of it.
 *
 * WHY A BUTTON, NOT `<details>`
 * -----------------------------
 * The WAI-ARIA disclosure pattern: a real `<button>` with `aria-expanded` and
 * `aria-controls`. `<summary>` would be less code, but its expanded state is
 * not reliably announced by VoiceOver on the older iOS releases this app still
 * supports, and the visible "Show… / Hide…" label below needs React to own the
 * state anyway. The label carries the state for sighted users and
 * `aria-expanded` carries it for assistive technology, so neither depends on
 * the chevron.
 *
 * COLLAPSED MEANS GONE FROM THE LAYOUT
 * ------------------------------------
 * The region is rendered with the `hidden` attribute rather than unmounted:
 * `display: none` takes no space and leaves the accessibility tree, while the
 * content stays in the DOM for search engines, keeps any state a reader set
 * inside it, and costs nothing to show again. The stylesheet re-asserts
 * `display: none` for `[hidden]` so a layout class can never resurrect it as
 * an empty box.
 *
 * A LINK INTO A CLOSED SECTION OPENS IT
 * -------------------------------------
 * `/tools/budget#methodology` must land on the method, not on a hidden node
 * that `scrollIntoView` silently ignores. When the URL fragment names an
 * element inside the region, the region opens before paint and the target is
 * scrolled to once it can actually be seen.
 */

export interface DisclosureProps {
  /** Visible text while collapsed, e.g. "Show calculation & details". */
  showLabel: string;
  /** Visible text while expanded, e.g. "Hide calculation & details". */
  hideLabel: string;
  children: ReactNode;
  /** Secondary information is collapsed unless a caller has a reason. */
  defaultOpen?: boolean;
  /**
   * `block` is a full-width row, for a section that stands on its own (the
   * education block under a tool). `inline` is a quiet text control, for
   * supporting detail inside a card.
   */
  variant?: 'block' | 'inline';
  /** Called with the new state after every user toggle. */
  onToggle?: (open: boolean) => void;
  className?: string;
}

function Chevron() {
  return (
    <svg
      className="fx-disclosure-chev"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** The element a URL fragment names, if it lives inside `region`. */
function fragmentTargetWithin(region: HTMLElement | null, hash: string): HTMLElement | null {
  if (!region || hash.length < 2) return null;
  let id = hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    // A malformed escape is matched literally, the same as the scroll manager.
  }
  const target = document.getElementById(id);
  return target && region.contains(target) ? target : null;
}

export function Disclosure({
  showLabel,
  hideLabel,
  children,
  defaultOpen = false,
  variant = 'block',
  onToggle,
  className,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  const regionRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<HTMLElement | null>(null);
  const { hash } = useLocation();

  // Before paint, so a deep link never shows the closed state first.
  useLayoutEffect(() => {
    const target = fragmentTargetWithin(regionRef.current, hash);
    if (!target) return;
    pendingScroll.current = target;
    // Whether the fragment names something in here is a DOM question with no
    // answer until after commit; a layout effect settles it before paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the committed DOM, runs before paint
    setOpen(true);
  }, [hash]);

  // The scroll manager may already have tried this target while it was
  // hidden — a no-op it reports as success — so finish the job once visible.
  useEffect(() => {
    const target = pendingScroll.current;
    if (!open || !target) return;
    pendingScroll.current = null;
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'instant' });
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    onToggle?.(next);
  };

  return (
    <div
      className={`fx-disclosure fx-disclosure-${variant}${className ? ` ${className}` : ''}`}
      data-open={open || undefined}
    >
      <button
        type="button"
        className="fx-disclosure-toggle"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={toggle}
      >
        <span>{open ? hideLabel : showLabel}</span>
        <Chevron />
      </button>
      <div id={regionId} ref={regionRef} className="fx-disclosure-region" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
