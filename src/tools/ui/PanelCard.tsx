import type { ReactNode } from 'react';
import { Toggle } from './Toggle';

/**
 * A card whose heading carries its own on/off switch.
 *
 * WHY THIS REPLACED A MENU
 * ------------------------
 * These panels were first made switchable through a "Panels" dropdown in the
 * toolbar: one button, four checkboxes, two taps to reach, and nothing on the
 * page itself to say that anything could be hidden. It also cost a control in a
 * row that had no width to spare — adding it put 23px of horizontal scroll on
 * the whole tool at 320px.
 *
 * The switch now sits in the heading of the thing it governs. The affordance is
 * where the content is, the state is legible without opening anything, and
 * turning a section off is one tap from that section.
 *
 * THE HEADING NEVER LEAVES
 * ------------------------
 * Switching a panel off collapses its BODY, not the card. The title and the
 * switch stay, so a hidden panel is still visible as a line the user can bring
 * back — rather than vanishing and leaving them to remember it exists and go
 * looking for where it went.
 */
export interface PanelCardProps {
  title: string;
  /** One line under the title. Shown whether the panel is on or off. */
  subtitle?: string;
  on: boolean;
  onToggle: (next: boolean) => void;
  /** Rendered in the header, before the switch — a grade pill, a count. */
  badge?: ReactNode;
  /** The body. Rendered only while `on`. */
  children: ReactNode;
  /** Extra classes on the card, for callers with their own layout hooks. */
  className?: string;
}

export function PanelCard({
  title, subtitle, on, onToggle, badge, children, className,
}: PanelCardProps) {
  return (
    <div className={`card fx-panelcard${on ? '' : ' is-off'}${className ? ` ${className}` : ''}`}>
      <style>{PANEL_CARD_STYLES}</style>
      <div className="fx-panelcard-hd">
        <div className="fx-panelcard-titles">
          <div className="fx-panelcard-title">{title}</div>
          {subtitle && <p className="fx-panelcard-sub">{subtitle}</p>}
        </div>
        <div className="fx-panelcard-actions">
          {badge}
          <Toggle
            checked={on}
            onChange={onToggle}
            // Names the SECTION, not the state: a screen reader announces the
            // state itself, so "Spending insights, switch, on" is the whole
            // sentence and "Show spending insights, on" would repeat it.
            label={title}
          />
        </div>
      </div>
      {on && <div className="fx-panelcard-body">{children}</div>}
    </div>
  );
}

const PANEL_CARD_STYLES = `
.fx-tools .fx-panelcard-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
.fx-tools .fx-panelcard-titles{min-width:0;}
.fx-tools .fx-panelcard-title{font-size:14px;font-weight:700;letter-spacing:-.01em;color:var(--ink);}
.fx-tools .fx-panelcard-sub{font-size:11.5px;color:var(--ink3);line-height:1.5;margin:3px 0 0;}
.fx-tools .fx-panelcard-actions{display:flex;align-items:center;gap:10px;flex-shrink:0;}
.fx-tools .fx-panelcard-body{margin-top:14px;}
/* Switched off, the card shrinks to its heading. The padding tightens so a row
   of dormant panels reads as a compact list of things you could turn on, rather
   than as a column of empty cards. */
.fx-tools .fx-panelcard.is-off{padding-top:14px;padding-bottom:14px;}
.fx-tools .fx-panelcard.is-off .fx-panelcard-title{color:var(--ink2);font-weight:600;}
`;

export default PanelCard;
