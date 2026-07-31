import { useId, useState, type RefObject } from 'react';
import { evaluateFormula, isFormula } from '../lib/formula';

/**
 * A money field that also accepts arithmetic.
 *
 * Money is often a calculation before it is a number — a bill split four ways,
 * a receipt minus the returned item, three of the same thing. This input lets
 * the user type `120/4` and shows `= 30` under the field before anything is
 * saved, so the value they are committing to is never a surprise.
 *
 * It is deliberately `type="text"`: a `type="number"` field discards `120/4`
 * entirely (the browser reports an empty value), so there would be nothing left
 * to evaluate. `inputMode="decimal"` keeps the numeric keypad on mobile, which
 * is the part of `type="number"` that actually mattered here.
 *
 * Announcement policy — the preview only appears once an expression parses.
 * Half-typed input like `12+` renders nothing rather than an error, so the
 * polite live region never scolds someone mid-keystroke. A genuinely broken
 * expression is reported on blur, when the user has finished saying what they
 * meant.
 *
 * The component owns no value: the caller keeps the raw string and converts it
 * with `evaluateFormula` at submit time, so validation stays where the rest of
 * the form's validation already lives.
 */
export interface AmountInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Currency symbol, used to render the preview in the user's currency. */
  sym: string;
  /** Field styling hook — matches the surrounding form (`fi` or `fi-sm`). */
  className?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Rejected by the caller's own validation (e.g. an empty required field). */
  invalid?: boolean;
  /** Id of the caller's error message, merged into aria-describedby. */
  errorId?: string;
  placeholder?: string;
  required?: boolean;
  /** Accessible name, when there is no visible <label> pointing at this id. */
  ariaLabel?: string;
  onBlur?: () => void;
}

export function AmountInput({
  id, value, onChange, sym, className = 'fi', inputRef,
  invalid = false, errorId, placeholder = '0', required, ariaLabel, onBlur,
}: AmountInputProps) {
  // Set on blur only, so a partially typed formula is never an error yet.
  const [blurError, setBlurError] = useState<string | null>(null);
  const hintId = `${useId()}-amt-hint`;

  const trimmed = value.trim();
  const parsed = trimmed ? evaluateFormula(trimmed) : null;
  const showPreview = !!parsed?.ok && isFormula(trimmed);

  const describedBy = [errorId, showPreview || blurError ? hintId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        className={className}
        // See the note above: text + decimal keypad, not a number field.
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={invalid || !!blurError}
        aria-describedby={describedBy}
        value={value}
        onChange={(e) => {
          if (blurError) setBlurError(null);
          onChange(e.target.value);
        }}
        onBlur={() => {
          const r = trimmed ? evaluateFormula(trimmed) : null;
          setBlurError(r && !r.ok ? r.error : null);
          onBlur?.();
        }}
      />
      {(showPreview || blurError) && (
        <div
          id={hintId}
          className={`fx-amt-hint${blurError ? ' is-bad' : ''}`}
          role="status"
          aria-live="polite"
        >
          {blurError ?? `= ${sym}${formatPreview(parsed!.ok ? parsed!.value : 0)}`}
        </div>
      )}
    </>
  );
}

/**
 * Preview formatting is deliberately plain — grouped digits and at most two
 * decimals, with no currency-code lookup. It sits beside the field the user is
 * typing in, not in a report, and a locale-formatted figure here would compete
 * with the total it is about to become.
 */
function formatPreview(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
