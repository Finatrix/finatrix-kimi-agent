import type { ComponentPropsWithRef, ReactNode } from 'react';

/**
 * Button primitive — the one place button *variants* are defined.
 *
 * Composition-first by design: a variant contributes its canonical class, and
 * any `className` you pass is appended verbatim. This lets existing call sites
 * migrate with byte-identical output (`fx-btn-gold …` → `<Button variant="gold" …>`)
 * while giving one home to evolve button styling. Always renders a real
 * `<button>` with an explicit `type` (default "button", never an accidental
 * form submit) and inherits the global token-driven focus-visible ring.
 */
export type ButtonVariant = 'gold' | 'ghost' | 'subtle' | 'plain';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  gold: 'fx-btn-gold',
  ghost: 'fx-btn-ghost',
  subtle: 'text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors',
  plain: '',
};

/**
 * `ComponentPropsWithRef` rather than `ButtonHTMLAttributes`, so `ref` is part
 * of the surface. React 19 passes `ref` to a function component as an ordinary
 * prop, so it simply rides through the spread below — but the old type omitted
 * it, which made a button that cannot be focused programmatically. That is not
 * a stylistic limit: a dialog has to be able to move focus to its primary
 * action when it opens, and the workaround was a `[data-autofocus]` attribute
 * and a `querySelector`, i.e. a second, weaker ref system.
 */
export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  children?: ReactNode;
}

export default function Button({
  variant = 'gold',
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const classes = [VARIANT_CLASS[variant], className].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
