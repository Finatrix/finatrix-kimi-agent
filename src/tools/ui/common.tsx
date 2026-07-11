import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** Tool page header: colored chip + headline + subhead (matches .page-head). */
export function PageHead({
  chip,
  chipColor,
  chipBg,
  icon,
  title,
  children,
  chipPadTop,
}: {
  chip: string;
  chipColor: string;
  chipBg: string;
  icon: IconName;
  title: string;
  children: ReactNode;
  chipPadTop?: number;
}) {
  return (
    <div className="page-head" style={chipPadTop ? { paddingTop: chipPadTop } : undefined}>
      <span className="tool-chip" style={{ background: chipBg, color: chipColor }}>
        <Icon name={icon} size={14} style={{ marginRight: 5 }} />
        {chip}
      </span>
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
  );
}

/** Footer line used at the bottom of every tool. */
export function ToolFoot({ children }: { children: ReactNode }) {
  return <div className="foot">{children}</div>;
}

/**
 * Methodology / transparency disclosure — a reusable "how this is calculated"
 * note (progressive-disclosure `<details>`). Reinforces trust and the
 * educational mission consistently across tools without repeating markup.
 */
export function MethodologyNote({
  summary = 'How this is calculated',
  children,
}: {
  summary?: string;
  children: ReactNode;
}) {
  return (
    <details className="fx-method fx-method-card">
      <summary>{summary}</summary>
      <p>{children}</p>
    </details>
  );
}
