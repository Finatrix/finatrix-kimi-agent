import { useCurrency } from '../CurrencyContext';

/**
 * The eye in the tools header: one tap turns every amount into "₹ ••••" and
 * takes the labels off charts, for a public place or a shared screen. Another
 * tap shows them again. Remembered on this device only (lib/hideAmounts.ts).
 *
 * A toggle button (`aria-pressed`) with a fixed name, so a screen reader says
 * "Hide amounts, toggle button, pressed" rather than a name that flips.
 */
export function HideAmountsButton({ className = '' }: { className?: string }) {
  const { hidden, setHidden } = useCurrency();
  return (
    <button
      type="button"
      className={`fx-icon-btn ${className}`.trim()}
      aria-pressed={hidden}
      aria-label="Hide amounts"
      title={hidden ? 'Show amounts' : 'Hide amounts'}
      data-testid="hide-amounts"
      onClick={() => setHidden(!hidden)}
    >
      {hidden ? (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 3l18 18" />
          <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c5.5 0 9 5.2 10 7-.5.9-1.6 2.6-3.2 4.1M6.6 6.6C4.4 8 2.9 10.4 2 12c1 1.8 4.5 7 10 7 1.9 0 3.6-.6 5-1.5" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </svg>
      ) : (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12c1-1.8 4.5-7 10-7s9 5.2 10 7c-1 1.8-4.5 7-10 7S3 13.8 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}
