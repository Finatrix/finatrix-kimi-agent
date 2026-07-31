import { useCallback, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { AmountInput } from './AmountInput';
import { formulaAmount } from '../lib/formula';
import { monthLabel } from '../lib/month';
import { getJSON, setJSON } from '../lib/storage';
import {
  suggestBudgets, LOOKBACKS,
  type BudgetSuggestion, type Confidence, type Lookback,
} from '../lib/budgetSuggest';
import type { ExpenseItem } from '../lib/expense';
import type { BudgetVals, SectionedCats } from '../lib/budget';
import { SECTION_COLOR } from '../lib/sectionColors';

/**
 * Smart budget suggestions.
 *
 * Every number on this card is a proposal. Nothing is written until the user
 * presses Accept (or edits the figure and presses Apply) on that specific row —
 * there is no bulk auto-fill, no "we've updated your budget for you", and
 * dismissing a row leaves the existing allocation exactly as it was.
 *
 * The confidence badge is not decoration. A recommendation built from one month
 * of data and one built from a year of steady spending look the same on paper,
 * and presenting them identically would be the dishonest choice.
 */


const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence',
};
const CONFIDENCE_COLOR: Record<Confidence, string> = {
  high: 'var(--green)', medium: 'var(--gold)', low: 'var(--ink3)',
};

/**
 * Local-only view preference: which lookback the user last chose, and which
 * rows they have dismissed for a given month. Deliberately outside SYNC_KEYS —
 * "I don't want to see this row" is a property of this device's screen, not of
 * the user's financial data, and the cloud payload's shape stays untouched.
 */
const PREFS_KEY = 'fx_bb_suggest';
interface SuggestPrefs {
  lookback: Lookback;
  ignored: Record<string, string[]>;
}
const DEFAULT_PREFS: SuggestPrefs = { lookback: 6, ignored: {} };

function loadPrefs(): SuggestPrefs {
  const raw = getJSON<Partial<SuggestPrefs>>(PREFS_KEY, DEFAULT_PREFS);
  const lookback = LOOKBACKS.includes(raw.lookback as Lookback) ? (raw.lookback as Lookback) : 6;
  return { lookback, ignored: raw.ignored && typeof raw.ignored === 'object' ? raw.ignored : {} };
}

export interface BudgetSuggestionsProps {
  items: ExpenseItem[];
  /** The active (non-archived) category view — matches what the page renders. */
  cats: SectionedCats;
  vals: BudgetVals;
  month: string;
  cfmt: (n: number) => string;
  sym: string;
  /** Apply an amount to a category. The only way this card changes anything. */
  onApply: (key: string, amount: number) => void;
  /** Announce an applied change through the page's existing live region. */
  onAnnounce?: (message: string) => void;
}

export function BudgetSuggestions({
  items, cats, vals, month, cfmt, sym, onApply, onAnnounce,
}: BudgetSuggestionsProps) {
  const [prefs, setPrefs] = useState<SuggestPrefs>(loadPrefs);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const savePrefs = useCallback((next: SuggestPrefs) => {
    setPrefs(next);
    setJSON(PREFS_KEY, next);
  }, []);

  const set = useMemo(
    () => suggestBudgets(items, cats, vals, month, prefs.lookback),
    [items, cats, vals, month, prefs.lookback],
  );

  const ignored = prefs.ignored[month] ?? [];
  const visible = set.suggestions.filter((s) => !ignored.includes(s.k));

  // Nothing to recommend — render nothing rather than an empty promise.
  if (set.suggestions.length === 0) return null;

  const setLookback = (lookback: Lookback) => savePrefs({ ...prefs, lookback });

  const ignore = (s: BudgetSuggestion) => {
    savePrefs({ ...prefs, ignored: { ...prefs.ignored, [month]: [...ignored, s.k] } });
    onAnnounce?.(`${s.label} suggestion dismissed. Its budget is unchanged.`);
  };

  const restoreAll = () => {
    const next = { ...prefs.ignored };
    delete next[month];
    savePrefs({ ...prefs, ignored: next });
    onAnnounce?.('Dismissed suggestions restored.');
  };

  const accept = (s: BudgetSuggestion, amount: number) => {
    onApply(s.k, amount);
    setEditing(null);
    onAnnounce?.(`${s.label} budget set to ${cfmt(amount)}.`);
  };

  const startEdit = (s: BudgetSuggestion) => {
    setEditing(s.k);
    setDraft(String(s.suggested));
  };

  return (
    <div className="card fx-sug">
      <style>{SUGGEST_STYLES}</style>

      <div className="bb-cardhd">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="zap" size={16} style={{ color: 'var(--gold)' }} />
            <div className="bb-cardtitle">Suggested from your spending</div>
          </div>
          <p className="note" style={{ marginTop: 4, marginBottom: 0 }}>
            {set.partial
              ? `Based on the ${describeMonths(set.monthsAvailable.length)} you've tracked so far — nothing changes until you accept it.`
              : `Averages from your last ${prefs.lookback} months — nothing changes until you accept it.`}
          </p>
        </div>
        <div className="fx-seg" role="group" aria-label="Months of history to average">
          {LOOKBACKS.map((lb) => (
            <button
              key={lb}
              type="button"
              className={prefs.lookback === lb ? 'on' : ''}
              aria-pressed={prefs.lookback === lb}
              onClick={() => setLookback(lb)}
            >
              {lb}m
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="note" style={{ margin: 0 }}>
          All suggestions dismissed for {monthLabel(month)}.{' '}
          <button type="button" className="fx-sug-link" onClick={restoreAll}>Show them again</button>
        </p>
      ) : (
        <ul className="fx-sug-list">
          {visible.map((s) => {
            const isEditing = editing === s.k;
            const editId = `bb-sug-edit-${s.k}`;
            return (
              <li key={s.k} className="fx-sug-row">
                <div className="fx-sug-head">
                  <Icon name={s.ic} size={16} style={{ color: SECTION_COLOR[s.section], flexShrink: 0 }} />
                  <span className="fx-sug-name">{s.label}</span>
                  <span
                    className="fx-sug-conf"
                    style={{ color: CONFIDENCE_COLOR[s.confidence] }}
                    title={s.confidenceReason}
                  >
                    {CONFIDENCE_LABEL[s.confidence]}
                  </span>
                </div>

                <div className="fx-sug-figs">
                  <Figure label="Suggested" value={cfmt(s.suggested)} strong />
                  <Figure label="Current" value={s.current > 0 ? cfmt(s.current) : 'Not set'} />
                  <Figure
                    label="Difference"
                    value={`${s.difference > 0 ? '+' : s.difference < 0 ? '−' : ''}${cfmt(Math.abs(s.difference))}`}
                    color={s.difference > 0 ? 'var(--orange)' : s.difference < 0 ? 'var(--green)' : undefined}
                  />
                </div>

                <details className="fx-sug-why">
                  <summary>Why this number?</summary>
                  <p>
                    Your average {s.label.toLowerCase()} spend over{' '}
                    {describeMonths(s.monthsUsed.length)} is <b>{cfmt(s.average)}</b>, so we suggest{' '}
                    <b>{cfmt(s.suggested)}</b>. {s.confidenceReason}
                  </p>
                  <ul className="fx-sug-hist">
                    {s.monthsUsed.map((m, i) => (
                      <li key={m}>
                        <span>{monthLabel(m)}</span>
                        <span>{cfmt(s.history[i])}</span>
                      </li>
                    ))}
                  </ul>
                </details>

                {isEditing ? (
                  <div className="fx-sug-edit">
                    <label className="fl" htmlFor={editId}>Your amount ({sym})</label>
                    <AmountInput
                      id={editId}
                      className="fi"
                      sym={sym}
                      value={draft}
                      onChange={setDraft}
                    />
                    <div className="fx-sug-actions">
                      <button
                        type="button"
                        className="fx-sug-btn primary"
                        onClick={() => accept(s, formulaAmount(draft))}
                      >
                        Apply
                      </button>
                      <button type="button" className="fx-sug-btn" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="fx-sug-actions">
                    <button
                      type="button"
                      className="fx-sug-btn primary"
                      onClick={() => accept(s, s.suggested)}
                      aria-label={`Accept ${cfmt(s.suggested)} as the ${s.label} budget`}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="fx-sug-btn"
                      onClick={() => startEdit(s)}
                      aria-label={`Edit the suggested ${s.label} budget before applying it`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="fx-sug-btn"
                      onClick={() => ignore(s)}
                      aria-label={`Ignore the ${s.label} suggestion and keep the current budget`}
                    >
                      Ignore
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Figure({ label, value, strong, color }: {
  label: string; value: string; strong?: boolean; color?: string;
}) {
  return (
    <div className="fx-sug-fig">
      <span className="fx-sug-fig-l">{label}</span>
      <span className="fx-sug-fig-v" style={{ fontWeight: strong ? 700 : 600, color }}>{value}</span>
    </div>
  );
}

function describeMonths(n: number): string {
  return `${n} month${n === 1 ? '' : 's'}`;
}

const SUGGEST_STYLES = `
.fx-tools .fx-sug-list{list-style:none;margin:0;padding:0;display:grid;gap:10px;}
.fx-tools .fx-sug-row{background:var(--well);border:1px solid var(--well-border);border-radius:var(--ctl-r-lg);padding:13px 14px;}
.fx-tools .fx-sug-head{display:flex;align-items:center;gap:9px;margin-bottom:10px;}
.fx-tools .fx-sug-name{flex:1;min-width:0;font-size:13.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fx-tools .fx-sug-conf{font-size:10.5px;font-weight:700;letter-spacing:.02em;flex-shrink:0;}
.fx-tools .fx-sug-figs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;}
.fx-tools .fx-sug-fig{display:flex;flex-direction:column;gap:2px;min-width:0;}
.fx-tools .fx-sug-fig-l{font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink3);}
.fx-tools .fx-sug-fig-v{font-size:15px;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fx-tools .fx-sug-why{margin-bottom:10px;}
.fx-tools .fx-sug-why > summary{font-size:11.5px;color:var(--ink3);cursor:pointer;font-weight:600;}
.fx-tools .fx-sug-why > summary:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:4px;}
.fx-tools .fx-sug-why p{font-size:12px;color:var(--ink2);line-height:1.55;margin:8px 0 8px;}
.fx-tools .fx-sug-hist{list-style:none;margin:0;padding:0;display:grid;gap:2px;}
.fx-tools .fx-sug-hist li{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;color:var(--ink2);
  font-variant-numeric:tabular-nums;padding:3px 0;border-bottom:1px solid var(--hair2);}
.fx-tools .fx-sug-hist li:last-child{border-bottom:none;}
.fx-tools .fx-sug-actions{display:flex;gap:6px;flex-wrap:wrap;}
.fx-tools .fx-sug-btn{display:inline-flex;align-items:center;justify-content:center;min-height:var(--ctl-h-sm);padding:0 16px;
  border-radius:var(--ctl-pill);border:var(--ctl-bw) solid var(--hair2);background:var(--card);
  color:var(--ink2);font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;
  transition:background-color var(--ctl-trans),color var(--ctl-trans),border-color var(--ctl-trans);}
.fx-tools .fx-sug-btn:hover{background:var(--fill-06);color:var(--ink);}
.fx-tools .fx-sug-btn.primary{background:var(--gold);border-color:var(--fab-border);color:#1a1400;}
.fx-tools .fx-sug-btn.primary:hover{background:#E0BC4B;}
.fx-tools .fx-sug-edit{display:grid;gap:8px;}
.fx-tools .fx-sug-link{background:none;border:none;padding:0;font:inherit;color:var(--gold);cursor:pointer;text-decoration:underline;}
@media(max-width:420px){
  .fx-tools .fx-sug-figs{grid-template-columns:1fr 1fr;}
  .fx-tools .fx-sug-btn{flex:1;}
}
@media (prefers-reduced-motion:reduce){.fx-tools .fx-sug-btn{transition:none;}}
`;
