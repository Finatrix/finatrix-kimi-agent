import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The longest a reveal may sit blank after it is already on screen.
 *
 * Callers stagger a grid by passing `delay={i * 60}`, which reads fine for the
 * first row and then stops being a stagger: each item watches for its OWN
 * intersection, so the tenth card starts its delay when the tenth card appears,
 * not when the first one did. On the landing page that meant 480ms of waiting
 * plus a 700ms fade — 1.18 SECONDS of empty card, in the same row as cards that
 * had already finished. 180ms keeps the first three beats of any stagger and
 * turns the rest into a single wave, so a row never fades in raggedly. Clamped
 * here rather than at each call site, where the next grid would get it wrong
 * again.
 */
const MAX_DELAY_MS = 180;

/**
 * Reveals children with a subtle rise/fade the first time they scroll into view.
 * Uses IntersectionObserver (no scroll listener) and degrades to instantly
 * visible under prefers-reduced-motion (handled in CSS via .fx-reveal).
 */
export default function Reveal({
  children,
  className = '',
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'li';
}) {
  const ref = useRef<HTMLDivElement>(null);
  // No observer (a very old webview, some in-app browsers): start visible.
  // Hidden-until-observed with no observer would be hidden forever.
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // Threshold 0 with the bottom edge pulled in, rather than "12% visible".
    // A ratio threshold can never be reached by an element taller than about
    // eight viewports — 12% of it cannot fit on screen at once — so a long
    // wrapped section on a phone stayed at opacity 0 for good. This fires when
    // the element's top crosses the lower 92% of the viewport, whatever its
    // height, which is the same moment for anything short.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setSeen(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`fx-reveal ${seen ? 'is-in' : ''} ${className}`}
      style={{ transitionDelay: `${Math.min(Math.max(delay, 0), MAX_DELAY_MS)}ms` }}
    >
      {children}
    </Tag>
  );
}
