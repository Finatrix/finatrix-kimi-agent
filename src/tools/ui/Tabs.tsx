import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Accessible tab bar implementing the WAI-ARIA Tabs pattern:
 *  - a single roving tab stop (only the active tab is in the Tab order),
 *  - Arrow / Home / End move between tabs and follow selection,
 *  - real <button> elements (never anchors) so Enter/Space activate natively.
 *
 * Two visual variants share this one behaviour:
 *  - "tools" (default): the pill bar used across the finance tools (.fx-tabs).
 *  - "nav": the segmented bar used across FinatriX Careers (.nav / .on).
 *
 * When `idBase` is provided each tab is wired to its panel via aria-controls,
 * and the caller renders a matching element:
 *   role="tabpanel" id={`${idBase}-panel-${key}`} aria-labelledby={`${idBase}-tab-${key}`}
 * Panels that contain their own focusable content need no tabindex (per APG).
 * Omit `idBase` for filter/segmented controls whose "panel" is a live region
 * rather than a discrete tabpanel — the roving keyboard behaviour still applies.
 */
export interface TabItem<K extends string> {
  key: K;
  label: string;
  icon?: IconName;
}

interface Props<K extends string> {
  items: ReadonlyArray<TabItem<K>>;
  active: K;
  onChange: (key: K) => void;
  /** Accessible name for the tablist. */
  label: string;
  /** Visual style. 'tools' = fx-tabs pill bar (default); 'nav' = careers segmented bar. */
  variant?: 'tools' | 'nav';
  /** When set, wire aria-controls/ids so the caller can render matching panels. */
  idBase?: string;
  /** Extra container style (e.g. flex-wrap for wide careers bars). */
  style?: CSSProperties;
}

export function Tabs<K extends string>({
  items, active, onChange, label, variant = 'tools', idBase, style,
}: Props<K>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.key === active);
    if (i < 0) return;
    let next = i;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown': next = (i + 1) % items.length; break;
      case 'ArrowLeft':
      case 'ArrowUp': next = (i - 1 + items.length) % items.length; break;
      case 'Home': next = 0; break;
      case 'End': next = items.length - 1; break;
      default: return;
    }
    e.preventDefault();
    const key = items[next].key;
    onChange(key);
    refs.current[key]?.focus();
  };

  const containerClass = variant === 'nav' ? 'nav' : 'fx-tabs';

  return (
    <div className={containerClass} role="tablist" aria-label={label} onKeyDown={onKeyDown} style={style}>
      {items.map((t) => {
        const on = t.key === active;
        const btnClass = variant === 'nav'
          ? (on ? 'on' : undefined)
          : `fx-tab${on ? ' active' : ''}`;
        return (
          <button
            key={t.key}
            ref={(el) => { refs.current[t.key] = el; }}
            id={idBase ? `${idBase}-tab-${t.key}` : undefined}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={idBase ? `${idBase}-panel-${t.key}` : undefined}
            tabIndex={on ? 0 : -1}
            className={btnClass}
            onClick={() => onChange(t.key)}
          >
            {t.icon && <Icon name={t.icon} size={15} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
