import { useId } from 'react';

/**
 * The switch that turns a panel on and off, in the FinatriX gold.
 *
 * WHY A SWITCH AND NOT A MENU
 * ---------------------------
 * These started life inside a "Panels" dropdown — one control, four checkboxes,
 * two taps to reach and no indication from the page itself that anything was
 * hideable. A switch beside the heading it governs is the opposite of that: the
 * affordance is where the thing is, the state is visible without opening
 * anything, and turning a section off is one tap from the section.
 *
 * GOLD GLASS, IN BOTH THEMES
 * --------------------------
 * The "on" track is a gold gradient under a translucent sheen, with a soft glow
 * beneath it; the knob is a floating white puck. Every value is a token or a
 * `color-mix` over one, so the same component reads correctly on the obsidian
 * dark canvas and on the cream light one — the gold is theme-constant by design
 * (see styles/tokens.css), and only the *off* track and its border move with
 * the theme.
 *
 * IT IS A REAL CHECKBOX
 * ---------------------
 * A visually-hidden checkbox input inside a label element, not a div carrying
 * `role="switch"`. That gives the correct role, the correct announcement, Space
 * to operate it, form semantics and the focus ring for free. The input itself
 * is a one-pixel sliver in the corner, so the visible ring is drawn on the
 * track next to it with an adjacent-sibling selector — which is also how the
 * "on" gold is painted. A hand-rolled div would need every one of those
 * behaviours written and tested by hand.
 *
 * The accessible name is the heading it sits beside, passed in as `label`. It
 * is deliberately not "on/off": a screen reader already announces the state, so
 * naming it "on" would produce "on, on, switch".
 */
export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** What this switch governs — becomes the accessible name. */
  label: string;
  /** `sm` for a card heading, `md` where it stands alone. */
  size?: 'sm' | 'md';
  /** Visible text beside the switch. Most callers have a heading already. */
  children?: React.ReactNode;
  className?: string;
}

export function Toggle({
  checked, onChange, label, size = 'sm', children, className,
}: ToggleProps) {
  const id = useId();
  return (
    <label
      className={`fx-tgl fx-tgl-${size}${className ? ` ${className}` : ''}`}
      htmlFor={id}
    >
      <style>{TOGGLE_STYLES}</style>
      <input
        id={id}
        type="checkbox"
        className="fx-tgl-input"
        checked={checked}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="fx-tgl-track" aria-hidden="true">
        <span className="fx-tgl-knob" />
      </span>
      {children && <span className="fx-tgl-text">{children}</span>}
    </label>
  );
}

const TOGGLE_STYLES = `
.fx-tools .fx-tgl{display:inline-flex;align-items:center;gap:9px;cursor:pointer;flex-shrink:0;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;}
/* Visually hidden, never display:none — a hidden input is not focusable and
   the switch would be unreachable from the keyboard. */
.fx-tools .fx-tgl-input{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0;}

.fx-tools .fx-tgl-track{position:relative;display:inline-block;flex-shrink:0;
  border-radius:var(--ctl-pill);
  /* OFF: a quiet glass capsule that belongs to the theme. */
  background:var(--fill-06);
  border:1px solid var(--hair);
  box-shadow:inset 0 1px 2px rgba(0,0,0,.16);
  transition:background var(--ctl-trans),border-color var(--ctl-trans),box-shadow var(--ctl-trans);}
.fx-tools .fx-tgl-sm .fx-tgl-track{width:40px;height:23px;}
.fx-tools .fx-tgl-md .fx-tgl-track{width:48px;height:28px;}

.fx-tools .fx-tgl-knob{position:absolute;top:50%;left:2px;transform:translateY(-50%);
  border-radius:50%;background:#FFFFFF;
  box-shadow:0 1px 3px rgba(0,0,0,.32),0 0 0 .5px rgba(0,0,0,.06);
  transition:transform var(--ctl-trans),box-shadow var(--ctl-trans);}
.fx-tools .fx-tgl-sm .fx-tgl-knob{width:17px;height:17px;}
.fx-tools .fx-tgl-md .fx-tgl-knob{width:21px;height:21px;}

/* ON — the gold. A gradient track, a translucent sheen along the top edge, and
   a soft glow underneath so the capsule reads as lit rather than filled. Gold
   is theme-constant, so this half looks identical in both themes. */
.fx-tools .fx-tgl-input:checked + .fx-tgl-track{
  background:linear-gradient(180deg,#E9CE73,#D4AF37 62%,#BE9A2C);
  border-color:#B8962E;
  box-shadow:0 2px 10px -2px rgba(212,175,55,.55),
             inset 0 1px 0 rgba(255,255,255,.45),
             inset 0 -1px 2px rgba(0,0,0,.14);}
.fx-tools .fx-tgl-input:checked + .fx-tgl-track .fx-tgl-knob{
  box-shadow:0 1px 4px rgba(120,92,10,.42),0 0 0 .5px rgba(120,92,10,.12);}
.fx-tools .fx-tgl-sm .fx-tgl-input:checked + .fx-tgl-track .fx-tgl-knob{transform:translateY(-50%) translateX(17px);}
.fx-tools .fx-tgl-md .fx-tgl-input:checked + .fx-tgl-track .fx-tgl-knob{transform:translateY(-50%) translateX(20px);}

.fx-tools .fx-tgl:hover .fx-tgl-track{border-color:var(--gold);}
.fx-tools .fx-tgl:active .fx-tgl-knob{width:20px;}
.fx-tools .fx-tgl-md:active .fx-tgl-knob{width:24px;}
/* The ring is drawn on the TRACK, because that is the thing that looks like
   the control — the input it belongs to is a pixel in the corner. */
.fx-tools .fx-tgl-input:focus-visible + .fx-tgl-track{outline:2px solid var(--gold);outline-offset:3px;}

.fx-tools .fx-tgl-text{font-size:12px;font-weight:600;color:var(--ink2);}
.fx-tools .fx-tgl-input:checked ~ .fx-tgl-text{color:var(--ink);}

@media (prefers-reduced-motion:reduce){
  .fx-tools .fx-tgl-track,.fx-tools .fx-tgl-knob{transition:none;}
  .fx-tools .fx-tgl:active .fx-tgl-knob{width:auto;}
}
@media print{.fx-tools .fx-tgl{display:none;}}
`;

export default Toggle;
