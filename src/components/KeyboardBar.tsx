import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isNativeApp } from '../native/platform';

/**
 * A row of keys docked on top of the on-screen keyboard.
 *
 * Two problems, one bar. Amount fields ask for the decimal keypad
 * (`inputMode="decimal"`) because that is the right keyboard for money — but
 * that keypad has no `=`, `+`, `-`, `×`, `÷` or brackets, so the formulas the
 * fields accept (`=3+2`, `120/4`) could not be typed on a phone at all. And the
 * same keypad has no return key, while the apps hide the system's accessory
 * bar, so there was no obvious way to put the keyboard away.
 *
 * Formula fields opt in with `data-fx-formula`. In the apps the bar appears for
 * every text field, with "Done" alone, because nothing else offers one there;
 * in a mobile browser it appears for formula fields only, since Safari already
 * draws its own Done.
 *
 * Portalled to `body`: a fixed element inside a transformed ancestor is fixed
 * to that ancestor, not the viewport.
 */

/** Typed character and the label shown for it. `-`, `×`, `÷` are all accepted by the formula grammar. */
const FORMULA_KEYS: ReadonlyArray<readonly [string, string, string]> = [
  ['=', '=', 'Equals'],
  ['+', '+', 'Plus'],
  ['-', '−', 'Minus'],
  ['×', '×', 'Multiply'],
  ['÷', '÷', 'Divide'],
  ['(', '(', 'Open bracket'],
  [')', ')', 'Close bracket'],
];

const TEXT_TYPES = new Set(['text', 'search', 'email', 'password', 'number', 'tel', 'url', '']);

type Field = HTMLInputElement | HTMLTextAreaElement;

function editableField(target: EventTarget | null): Field | null {
  if (target instanceof HTMLTextAreaElement) return target.readOnly || target.disabled ? null : target;
  if (!(target instanceof HTMLInputElement)) return null;
  if (target.readOnly || target.disabled) return null;
  return TEXT_TYPES.has(target.type) ? target : null;
}

function isTouchDevice(): boolean {
  if (isNativeApp()) return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Insert at the caret through the element's native value setter, then fire
 * `input`. Assigning `el.value` directly is invisible to React's controlled
 * inputs — it tracks the last value it set and ignores an event that appears
 * to change nothing.
 */
function insertAtCaret(el: Field, text: string): void {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const next = `${el.value.slice(0, start)}${text}${el.value.slice(end)}`;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, next);
  else el.value = next;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  const caret = start + text.length;
  // After React has re-rendered the controlled value, which resets the caret.
  requestAnimationFrame(() => {
    try {
      el.setSelectionRange(caret, caret);
    } catch {
      /* some input types have no selection API */
    }
  });
}

export default function KeyboardBar() {
  const [field, setField] = useState<Field | null>(null);
  const [offset, setOffset] = useState(0);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isTouchDevice()) return;
    const native = isNativeApp();

    const onFocusIn = (e: FocusEvent) => {
      const el = editableField(e.target);
      setField(el && (native || el.hasAttribute('data-fx-formula')) ? el : null);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (barRef.current?.contains(e.relatedTarget as Node | null)) return;
      if (!editableField(e.relatedTarget)) setField(null);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  // A field that is unmounted while focused — a sheet closing — fires no
  // `focusout`, which would leave the bar up over nothing.
  useEffect(() => {
    if (!field) return;
    const observer = new MutationObserver(() => {
      if (!field.isConnected) setField(null);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [field]);

  // Sit on top of the keyboard. Where the keyboard shrinks the layout viewport
  // (the apps) this resolves to 0; where it only shrinks the visual viewport
  // (mobile Safari) it is the keyboard's height.
  useEffect(() => {
    if (!field) return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    root.classList.add('fx-kbbar-open');
    const measure = () => {
      setOffset(vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0);
    };
    measure();
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    return () => {
      root.classList.remove('fx-kbbar-open');
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
  }, [field]);

  if (!field) return null;
  const formula = field.hasAttribute('data-fx-formula');

  return createPortal(
    <div
      ref={barRef}
      className="fx-tools fx-scope fx-kbbar"
      role="toolbar"
      aria-label={formula ? 'Formula keys' : 'Keyboard'}
      style={{ bottom: offset }}
      // Keep focus (and so the keyboard) on the field while a key is pressed.
      onPointerDown={(e) => e.preventDefault()}
    >
      {formula && (
        <div className="fx-kbbar-keys">
          {FORMULA_KEYS.map(([char, label, name]) => (
            <button
              key={char}
              type="button"
              className="fx-kbbar-key"
              aria-label={name}
              tabIndex={-1}
              onClick={() => insertAtCaret(field, char)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="fx-kbbar-done" tabIndex={-1} onClick={() => field.blur()}>
        Done
      </button>
    </div>,
    document.body,
  );
}
