import { useCallback, useRef, useState, type RefObject } from 'react';
import { AmountInput } from './AmountInput';
import { evaluateFormula } from '../lib/formula';

/**
 * A money field whose owner keeps a NUMBER but whose user types a STRING.
 *
 * THE BUG THIS EXISTS TO FIX
 * --------------------------
 * Budget Builder held each allocation as a number and rendered it straight back
 * into the input:
 *
 *     value={vals[k] ? String(vals[k]) : ''}
 *     onChange={(e) => setVal(k, Math.max(0, Number(e.target.value) || 0))}
 *
 * On a `type="number"` input the browser reports `value === ''` for anything
 * that is not yet a valid number — and `"12."` is not. So the moment the user
 * pressed the decimal point, `Number('') || 0` produced `0`, the falsy check
 * blanked the field, and the digits they had already typed vanished. Decimals
 * were literally impossible to enter. It bit hardest on phones, where the
 * decimal key is the one people reach for on a numeric keypad, and where
 * re-typing a wiped field is most painful.
 *
 * The fix is the standard one for a controlled numeric input: while the field
 * has focus it renders the user's own **draft string**, unmodified, and commits
 * the parsed number alongside. `"12."` stays on screen as `"12."`, and the
 * owner receives `12` until the next keystroke makes it `12.5`. On blur the
 * draft is dropped and the field re-renders from the owner's number, which is
 * what normalises `007.50` to `7.5` and lets an external write (applying an
 * auto-budget, accepting a suggestion) show through immediately.
 *
 * It is `type="text"` with `inputMode="decimal"`, inherited from AmountInput —
 * the numeric keypad without the browser's value-sanitising, which is the whole
 * of what `type="number"` was contributing here. Arithmetic comes along for
 * free: `120/4` is a valid way to say 30 in a budget too, not just in the
 * expense ledger.
 */
export interface MoneyFieldProps {
  id: string;
  /** The committed value. Rendered whenever the field does not have focus. */
  value: number;
  /** Called on every keystroke with the parsed value. */
  onCommit: (value: number) => void;
  /** Currency symbol, for the arithmetic preview. */
  sym: string;
  className?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  placeholder?: string;
  ariaLabel?: string;
  /** Clamp negatives to zero. True for budgets, false for a ledger entry. */
  min0?: boolean;
}

/**
 * Render a committed number for editing.
 *
 * `0` renders as an empty field rather than "0": a budget row at zero is a row
 * the user has not filled in, and pre-filling it with a digit they have to
 * select and delete is a worse default than an empty box with a "0" placeholder.
 */
function display(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '';
  // Never exponential, never trailing zeros — `String(0.0000001)` is "1e-7",
  // which is not something anyone can edit.
  return String(Math.round(value * 100) / 100);
}

export function MoneyField({
  id, value, onCommit, sym, className = 'fi-sm', inputRef,
  placeholder = '0', ariaLabel, min0 = true,
}: MoneyFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  // Set while the field has focus. Kept in a ref rather than state because
  // nothing renders from it — it only decides whether blur should clear.
  const focused = useRef(false);

  const shown = draft ?? display(value);

  const handleChange = useCallback((raw: string) => {
    setDraft(raw);
    const trimmed = raw.trim();
    if (!trimmed) { onCommit(0); return; }
    const parsed = evaluateFormula(trimmed);
    // A half-typed expression ("12+", "(") parses as an error. Leaving the
    // committed value alone is right: the user has not finished saying what
    // they mean, and collapsing it to 0 mid-keystroke is the same class of bug
    // as the one this component exists to fix.
    if (!parsed.ok) return;
    onCommit(min0 ? Math.max(0, parsed.value) : parsed.value);
  }, [onCommit, min0]);

  return (
    <AmountInput
      id={id}
      className={className}
      inputRef={inputRef}
      sym={sym}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      value={shown}
      onChange={handleChange}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        // Drop the draft so the field re-renders from the committed number.
        setDraft(null);
      }}
    />
  );
}

/**
 * The same idea for a percentage: a draft string while focused, a number when
 * not, so `33.3` can be typed one character at a time.
 *
 * Separate from MoneyField rather than a mode on it because the two differ in
 * every visible way — no currency preview, no arithmetic, a hard 0–100 clamp
 * and a `%` suffix in the accessible name. One component with four flags would
 * be harder to read than two that each do one thing.
 */
export interface PercentFieldProps {
  id: string;
  /** The committed value as a string, because the owner stores it as one. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}

export function PercentField({ id, value, onChange, className = 'fi', ariaLabel }: PercentFieldProps) {
  return (
    <input
      id={id}
      className={className}
      // Text, not number: see the note at the top. `33.` must survive long
      // enough to become `33.3`.
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        // Digits and at most one decimal point. Everything else is silently
        // refused rather than accepted and then rejected on blur — there is no
        // valid percentage containing a letter, so there is nothing to explain.
        if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
        const n = Number(raw);
        // A partial entry ("", ".", "12.") has no number yet and is passed
        // through untouched; a complete one over 100 is clamped, because the
        // split is a share of income and 400% is never what was meant.
        if (raw === '' || raw === '.' || raw.endsWith('.') || !Number.isFinite(n)) {
          onChange(raw);
          return;
        }
        onChange(n > 100 ? '100' : raw);
      }}
      onBlur={(e) => {
        // Normalise on blur: "12." becomes "12", "" stays "".
        const raw = e.target.value.trim();
        if (!raw) return;
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(String(Math.min(100, Math.max(0, n))));
      }}
    />
  );
}
