import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { SECTION_COLOR } from '../lib/sectionColors';
import { monthLabel } from '../lib/month';
import {
  AUTO_LOOKBACKS, buildAutoBudget, type AutoLookback, type AutoRow,
} from '../lib/budgetAuto';
import type { CatKey, SectionedCats } from '../lib/budget';
import type { ExpenseItem } from '../lib/expense';

/**
 * "Fill this in from my history."
 *
 * THE DIVISION OF LABOUR
 * ----------------------
 * The user decides the two things that are theirs to decide: how much money
 * there is, and how it splits across Needs, Wants and Savings. Those are
 * judgements about their life, and a forecast has no business making them —
 * which is why this card reads the envelopes off the plan above rather than
 * proposing its own.
 *
 * What it works out is the part that is genuinely arithmetic: given a fixed
 * envelope, how should it be divided between the categories inside it. That
 * answer is in the user's own history, and doing it by hand across twenty
 * categories is exactly the tedium software should absorb.
 *
 * NOTHING IS APPLIED WITHOUT A PRESS
 * ----------------------------------
 * The proposal is shown in full — the forecast, the proposal, the current
 * figure and the reasoning for every row — before anything can be written.
 * There is a per-row apply as well as apply-all, because half a good proposal
 * is still worth taking, and an all-or-nothing button makes people take none
 * of it.
 */
export interface AutoBudgetCardProps {
  items: readonly ExpenseItem[];
  cats: SectionedCats;
  /** The month being planned. */
  month: string;
  /** The three envelopes from the plan above — income × each percentage. */
  envelopes: Record<CatKey, number>;
  /** The month's current allocations. */
  vals: Record<string, number>;
  cfmt: (n: number) => string;
  /** Write one category's allocation. The only route from here to the budget. */
  onApply: (k: string, amount: number) => void;
  /** Announce what changed, into the page's live region. */
  onAnnounce: (message: string) => void;
}

const CONFIDENCE_LABEL: Record<AutoRow['confidence'], string> = {
  high: 'High confidence', medium: 'Some variation', low: 'Thin evidence',
};

export function AutoBudgetCard({
  items, cats, month, envelopes, vals, cfmt, onApply, onAnnounce,
}: AutoBudgetCardProps) {
  const [open, setOpen] = useState(false);
  const [lookback, setLookback] = useState<AutoLookback>(3);

  const totalEnvelope = envelopes.needs + envelopes.wants + envelopes.save;

  const proposal = useMemo(
    () => (open
      ? buildAutoBudget({ items, cats, month, envelopes, currentVals: vals, lookback })
      : null),
    [open, items, cats, month, envelopes, vals, lookback],
  );

  const applyAll = () => {
    if (!proposal) return;
    let n = 0;
    for (const row of proposal.rows) {
      if (row.amount !== row.current) { onApply(row.k, row.amount); n += 1; }
    }
    onAnnounce(n === 0
      ? 'The plan already matches the forecast — nothing changed.'
      : `Applied the forecast to ${n} ${n === 1 ? 'category' : 'categories'} for ${monthLabel(month)}.`);
  };

  return (
    <div className="card">
      <style>{AUTO_STYLES}</style>
      <div className="fx-auto-hd">
        <div>
          <div className="fx-auto-title">
            <Icon name="sparkle" size={15} style={{ color: 'var(--gold)' }} />
            Build it from my history
          </div>
          <p className="note" style={{ marginTop: 3 }}>
            You set the income and the Needs / Wants / Savings split. This works out how to divide each
            of those envelopes between your categories, from what you actually spend.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Close' : 'Forecast'}
        </button>
      </div>

      {open && totalEnvelope <= 0 && (
        <p className="fx-auto-empty">
          Add your income above first. Every allocation below it is a share of that figure, so there is
          nothing to divide until it is set.
        </p>
      )}

      {open && totalEnvelope > 0 && proposal?.empty !== false && (
        <p className="fx-auto-empty">
          There is no logged spending before {monthLabel(month)} to forecast from. Track a month in the
          Expense Tracker and this fills itself in.
        </p>
      )}

      {/* `totalEnvelope > 0` guards the table as well as the message above it.
          Without it a month with no income yet rendered BOTH — "add your income
          first" immediately above a full table proposing zero for every row. */}
      {open && totalEnvelope > 0 && proposal && !proposal.empty && (
        <>
          <div className="fx-auto-controls">
            <fieldset className="fx-auto-look">
              <legend className="fx-auto-legend">Read the last</legend>
              <div className="fx-seg" role="group" aria-label="Months of history to read">
                {AUTO_LOOKBACKS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={lookback === n ? 'on' : ''}
                    aria-pressed={lookback === n}
                    onClick={() => setLookback(n)}
                  >
                    {n} months
                  </button>
                ))}
              </div>
            </fieldset>
            {/* Which months, by name, not just how many. The window reaches
                past a gap to find real history — planning December in August
                reads the summer, not three empty months — so saying "3 months"
                without saying WHICH would quietly misdescribe the evidence. */}
            <span className="note">
              Reading {monthLabel(proposal.monthsUsed[0])}
              {proposal.monthsUsed.length > 1 && (
                <> to {monthLabel(proposal.monthsUsed[proposal.monthsUsed.length - 1])}</>
              )}
              {proposal.partial && ' — that is all the history there is'}.
            </span>
          </div>

          {proposal.sections.map((sec) => (
            <div key={sec.section} className="fx-auto-sec">
              <div className="fx-auto-sech" style={{ color: SECTION_COLOR[sec.section] }}>
                {sec.label}
                <span className="fx-auto-env">{cfmt(sec.envelope)}</span>
              </div>
              <p className="fx-auto-verdict">{sec.verdict}</p>

              {sec.rows.length > 0 && (
                <div className="fx-auto-tablewrap">
                  <table className="fx-auto-table">
                    <caption className="fx-sr-only">
                      Forecast, proposed allocation and current allocation for each {sec.label} category
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Category</th>
                        <th scope="col">Forecast</th>
                        <th scope="col">Proposed</th>
                        <th scope="col">Now</th>
                        <th scope="col"><span className="fx-sr-only">Apply</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.rows.map((row) => (
                        <tr key={row.k}>
                          <th scope="row">
                            <span className="fx-auto-cat">
                              <Icon name={row.ic} size={15} style={{ color: SECTION_COLOR[row.section], flexShrink: 0 }} />
                              <span className="fx-auto-catl">{row.label}</span>
                              {row.committed && <span className="fx-auto-tag">Committed</span>}
                            </span>
                            <span className="fx-auto-reason">
                              {row.reason} <i>{CONFIDENCE_LABEL[row.confidence]}.</i>
                            </span>
                          </th>
                          <td className="fx-auto-dim">{cfmt(row.forecast)}</td>
                          <td className="fx-auto-prop">{cfmt(row.amount)}</td>
                          <td className="fx-auto-dim">{cfmt(row.current)}</td>
                          <td>
                            <button
                              type="button"
                              className="fx-auto-apply"
                              disabled={row.amount === row.current}
                              onClick={() => {
                                onApply(row.k, row.amount);
                                onAnnounce(`${row.label} set to ${cfmt(row.amount)}.`);
                              }}
                              aria-label={row.amount === row.current
                                ? `${row.label} already matches the forecast`
                                : `Set ${row.label} to ${cfmt(row.amount)}`}
                            >
                              {row.amount === row.current ? '✓' : 'Use'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}

          <div className="fx-auto-foot">
            <button type="button" className="btn btn-sm fx-auto-all" onClick={applyAll}>
              Apply the whole forecast
            </button>
            <p className="note">
              Each section is scaled to fit the envelope you set, so the totals still add up to your
              plan exactly. Nothing is written until you press.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

const AUTO_STYLES = `
.fx-tools .fx-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}
.fx-tools .fx-auto-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
.fx-tools .fx-auto-title{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:700;letter-spacing:-.01em;}
.fx-tools .fx-auto-empty{font-size:12.5px;color:var(--ink2);line-height:1.6;margin:14px 0 0;
  padding:11px 13px;border-radius:var(--ctl-r-md);background:var(--well);border:1px solid var(--well-border);}
.fx-tools .fx-auto-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:14px 0 4px;}
.fx-tools .fx-auto-look{border:none;padding:0;margin:0;display:flex;align-items:center;gap:9px;}
.fx-tools .fx-auto-legend{font-size:11.5px;font-weight:600;color:var(--ink2);padding:0;float:left;}
.fx-tools .fx-auto-sec{margin-top:16px;}
.fx-tools .fx-auto-sech{display:flex;align-items:baseline;justify-content:space-between;gap:10px;
  font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;}
.fx-tools .fx-auto-env{color:var(--ink);font-size:13px;letter-spacing:-.01em;text-transform:none;
  font-variant-numeric:tabular-nums;}
.fx-tools .fx-auto-verdict{font-size:12px;color:var(--ink2);line-height:1.55;margin:5px 0 8px;}
.fx-tools .fx-auto-tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}
.fx-tools .fx-auto-table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:520px;}
.fx-tools .fx-auto-table thead th{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  color:var(--ink3);text-align:right;padding:0 8px 6px;}
.fx-tools .fx-auto-table thead th:first-child{text-align:left;}
.fx-tools .fx-auto-table tbody th{text-align:left;font-weight:500;padding:9px 8px;vertical-align:top;
  border-top:1px solid var(--hair2);}
.fx-tools .fx-auto-table td{text-align:right;padding:9px 8px;vertical-align:top;border-top:1px solid var(--hair2);
  font-variant-numeric:tabular-nums;white-space:nowrap;}
.fx-tools .fx-auto-cat{display:flex;align-items:center;gap:8px;min-width:0;}
.fx-tools .fx-auto-catl{font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fx-tools .fx-auto-tag{font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--ink3);background:var(--well);border-radius:var(--ctl-pill);padding:2px 7px;flex-shrink:0;}
.fx-tools .fx-auto-reason{display:block;font-size:11px;color:var(--ink3);line-height:1.5;margin-top:3px;max-width:40ch;}
.fx-tools .fx-auto-reason i{font-style:normal;color:var(--ink2);}
.fx-tools .fx-auto-dim{color:var(--ink3);}
.fx-tools .fx-auto-prop{font-weight:700;color:var(--ink);}
.fx-tools .fx-auto-apply{min-height:var(--ctl-h-xs);padding:0 11px;border-radius:var(--ctl-r-xs);
  border:var(--ctl-bw) solid var(--hair2);background:var(--card);color:var(--ink2);font-family:inherit;
  font-size:11.5px;font-weight:600;cursor:pointer;
  transition:background-color var(--ctl-trans),color var(--ctl-trans),border-color var(--ctl-trans);}
.fx-tools .fx-auto-apply:hover:not(:disabled){border-color:var(--gold);color:var(--ink);background:var(--gold-bg);}
.fx-tools .fx-auto-apply:disabled{opacity:.5;cursor:default;color:var(--green);}
.fx-tools .fx-auto-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:18px;
  padding-top:14px;border-top:1px solid var(--hair2);}
.fx-tools .fx-auto-all{width:auto;flex-shrink:0;}
.fx-tools .fx-auto-foot .note{flex:1;min-width:200px;margin:0;}
@media(max-width:520px){
  .fx-tools .fx-auto-reason{max-width:none;}
}
@media (prefers-reduced-motion:reduce){ .fx-tools .fx-auto-apply{transition:none;} }
`;

export default AutoBudgetCard;
