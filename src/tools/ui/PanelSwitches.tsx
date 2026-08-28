import { useId, useState } from 'react';
import { Icon } from './Icon';
import { PANEL_LABELS, type PanelKey, type PanelPrefs } from '../lib/panelPrefs';

/**
 * The switch row that decides which analytical panels a screen shows.
 *
 * Collapsed to a single "Panels" button by default: it is a control for
 * controls, and putting four permanent toggles above the content would be
 * adding to the clutter it exists to remove. The button says how many of the
 * panels are on, so the state is legible without opening it.
 *
 * Real checkboxes rather than styled buttons with `aria-pressed`. A group of
 * independent on/off choices is exactly what a checkbox group is, it comes with
 * the right keyboard behaviour and announcement for free, and `fieldset` +
 * `legend` gives the group a name without inventing one.
 */
export function PanelSwitches({ prefs, onToggle }: {
  prefs: PanelPrefs;
  onToggle: (key: PanelKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `${useId()}-panels`;
  const on = PANEL_LABELS.filter((p) => prefs[p.key]).length;

  return (
    <div className="fx-panels">
      <style>{PANEL_STYLES}</style>
      <button
        type="button"
        className="btn btn-ghost btn-sm fx-panels-btn"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="layers" size={14} />
        Panels
        <span className="fx-panels-count">{on}/{PANEL_LABELS.length}</span>
      </button>

      {open && (
        <fieldset id={panelId} className="fx-panels-menu">
          <legend className="fx-panels-legend">Show on this screen</legend>
          {PANEL_LABELS.map((p) => (
            <label key={p.key} className="fx-panels-row">
              <input
                type="checkbox"
                checked={prefs[p.key]}
                onChange={() => onToggle(p.key)}
              />
              <span className="fx-panels-copy">
                <span className="fx-panels-l">{p.label}</span>
                <span className="fx-panels-h">{p.hint}</span>
              </span>
            </label>
          ))}
          <p className="fx-panels-note">
            Remembered on this device only — a panel you hide on your phone stays visible on a
            bigger screen.
          </p>
        </fieldset>
      )}
    </div>
  );
}

const PANEL_STYLES = `
.fx-tools .fx-panels{position:relative;}
.fx-tools .fx-panels-btn{width:auto;gap:6px;}
.fx-tools .fx-panels-count{font-size:10.5px;font-weight:700;color:var(--ink3);font-variant-numeric:tabular-nums;}
.fx-tools .fx-panels-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:var(--z-dropdown);
  width:min(92vw,290px);padding:12px 14px 10px;margin:0;border:1px solid var(--hair);
  border-radius:var(--ctl-r-lg);background:var(--card-solid,var(--card));
  box-shadow:0 22px 54px -20px rgba(0,0,0,.6);animation:fxMenuIn 160ms var(--ease-out) both;
  transform-origin:top right;}
.fx-tools .fx-panels-legend{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  color:var(--ink3);padding:0;margin-bottom:8px;}
.fx-tools .fx-panels-row{display:flex;align-items:flex-start;gap:10px;padding:7px 0;cursor:pointer;}
.fx-tools .fx-panels-row input{margin-top:2px;width:16px;height:16px;flex-shrink:0;accent-color:var(--gold);cursor:pointer;}
.fx-tools .fx-panels-copy{min-width:0;}
.fx-tools .fx-panels-l{display:block;font-size:13px;font-weight:600;color:var(--ink);}
.fx-tools .fx-panels-h{display:block;font-size:11px;color:var(--ink3);line-height:1.45;margin-top:1px;}
.fx-tools .fx-panels-note{font-size:11px;color:var(--ink3);line-height:1.5;margin:8px 0 0;
  padding-top:8px;border-top:1px solid var(--hair2);}
@media (prefers-reduced-motion:reduce){ .fx-tools .fx-panels-menu{animation:none;} }
`;

export default PanelSwitches;
