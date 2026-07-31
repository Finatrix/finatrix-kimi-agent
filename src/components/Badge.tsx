import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Badge / chip primitive — a small status or metadata label.
 *
 * `tone` sets the colour intent from the design tokens; `className` is appended
 * verbatim so existing chips can migrate without visual change. Decorative by
 * default; pass `role="status"` etc. via props when the badge conveys live
 * state to assistive tech.
 */
export type BadgeTone = 'neutral' | 'gold' | 'success' | 'info' | 'warn' | 'danger';

const TONE_STYLE: Record<BadgeTone, { color: string; bg: string }> = {
  neutral: { color: 'var(--ink-2)', bg: 'rgba(255,255,255,0.06)' },
  // hsl(...): --accent is raw HSL channels for Tailwind — see styles/tokens.css.
  gold: { color: 'hsl(var(--accent))', bg: 'var(--accent-bg)' },
  success: { color: 'var(--status-success)', bg: 'rgba(52,210,122,0.12)' },
  info: { color: 'var(--status-info)', bg: 'rgba(77,155,255,0.12)' },
  warn: { color: 'var(--status-warn)', bg: 'rgba(232,131,61,0.12)' },
  danger: { color: 'var(--status-danger)', bg: 'rgba(255,90,82,0.12)' },
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children?: ReactNode;
}

export default function Badge({ tone = 'neutral', className = '', style, children, ...rest }: BadgeProps) {
  const t = TONE_STYLE[tone];
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] ' +
        'uppercase tracking-[0.1em] ' +
        className
      }
      style={{ color: t.color, background: t.bg, ...style }}
      {...rest}
    >
      {children}
    </span>
  );
}
