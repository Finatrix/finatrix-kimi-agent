import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { MarketCurrencyNotice } from './MarketNote';

/** Tool page header: colored chip + headline + subhead (matches .page-head). */
export function PageHead({
  chip,
  chipColor,
  chipBg,
  icon,
  title,
  children,
  chipPadTop,
  marketNotice = false,
  tour,
}: {
  chip: string;
  chipColor: string;
  chipBg: string;
  icon: IconName;
  title: string;
  children: ReactNode;
  chipPadTop?: number;
  /** Tools that read the market's rules: flag a market/currency mismatch under the head. */
  marketNotice?: boolean;
  /** Product-tour anchor (`data-tour`), e.g. "networth-head". */
  tour?: string;
}) {
  return (
    <div className="page-head" style={chipPadTop ? { paddingTop: chipPadTop } : undefined} data-tour={tour}>
      <span className="tool-chip" style={{ background: chipBg, color: chipColor }}>
        <Icon name={icon} size={14} style={{ marginRight: 5 }} />
        {chip}
      </span>
      <h1>{title}</h1>
      <p>{children}</p>
      {marketNotice && <MarketCurrencyNotice />}
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
  tour,
}: {
  summary?: string;
  children: ReactNode;
  /** Product-tour anchor (`data-tour`), e.g. "calendar-method". */
  tour?: string;
}) {
  return (
    <details className="fx-method fx-method-card" data-tour={tour}>
      <summary>{summary}</summary>
      <p>{children}</p>
    </details>
  );
}
