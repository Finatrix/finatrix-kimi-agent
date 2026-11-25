import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCurrency } from '../CurrencyContext';
import { loadCatViewFor } from '../lib/budgetCatsMonth';
import { getJSON } from '../lib/storage';
import { fmtExact, fmtForeign, fmtRate, fmtTripDay, loadTrips } from '../lib/trips';
import { allCategories, type BudgetStore } from '../lib/budget';
import { priceExpense, type AssistantAction, type BudgetAction, type ExpenseAction } from '../ai/actions/plan';
import {
  saveBudgetAction, saveExpenseAction, undoBudgetAction, undoExpenseAction,
} from '../ai/actions/execute';
import type { CalcRow } from '../ai/actions/calculators';

/**
 * The confirm card for an assistant action.
 *
 * A write (a spend, a budget) shows what will be saved and waits for Save; it
 * is never saved from voice alone, because a misheard ₹15,000 should be seen
 * before it is kept. Once saved, the same card offers Undo. A calculator result
 * and an opened screen write nothing, so they show what happened instead.
 */
export function ActionCard({ action, onChange, onOpen }: {
  action: AssistantAction;
  onChange: (next: AssistantAction) => void;
  onOpen: (href: string) => void;
}) {
  if (action.kind === 'expense') return <ExpenseCard action={action} onChange={onChange} onOpen={onOpen} />;
  if (action.kind === 'budget') return <BudgetCard action={action} onChange={onChange} onOpen={onOpen} />;
  if (action.kind === 'calc') {
    return (
      <div className="fx-act" role="group" aria-label={action.label}>
        <p className="fx-act-head">{action.label}</p>
        <Rows rows={action.result.inputs} />
        <p className="fx-act-sub">Worked out by FinatriX</p>
        <Rows rows={action.result.results} strong />
        <p className="fx-act-note">{action.result.basis}</p>
        <a className="fx-act-link" href={action.href} onClick={(e) => { e.preventDefault(); onOpen(action.href); }}>
          {action.hrefLabel}
        </a>
      </div>
    );
  }
  return (
    <div className="fx-act" role="group" aria-label={`Open ${action.label}`}>
      <a className="fx-act-link" href={action.href} onClick={(e) => { e.preventDefault(); onOpen(action.href); }}>
        Open {action.label}
      </a>
    </div>
  );
}

function Rows({ rows, strong = false }: { rows: readonly CalcRow[]; strong?: boolean }) {
  const { cfmt } = useCurrency();
  return (
    <dl className={`fx-act-rows${strong ? ' is-strong' : ''}`}>
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>
            {r.amount != null ? cfmt(r.amount) : r.count}
            {r.perMonth ? '/month' : ''}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Undo takes focus once the card is saved, so the keyboard isn't dropped on the body. */
function useFocusOnSaved(status: string) {
  const ref = useRef<HTMLButtonElement>(null);
  const before = useRef(status);
  useEffect(() => {
    if (before.current === 'pending' && status === 'saved') ref.current?.focus();
    before.current = status;
  }, [status]);
  return ref;
}

function Done({ status, saved, undoRef, onUndo, error, openHref, openLabel, onOpen }: {
  status: string; saved: string; undoRef: React.RefObject<HTMLButtonElement | null>;
  onUndo: () => void; error: string; openHref: string; openLabel: string; onOpen: (href: string) => void;
}) {
  return (
    <>
      <p className="fx-act-done" role="status">
        {status === 'saved' ? saved : status === 'undone' ? 'Undone. Nothing from this card is kept.' : 'Cancelled. Nothing was saved.'}
      </p>
      {error && <p className="fx-act-err" role="alert">{error}</p>}
      <div className="fx-act-btns">
        {status === 'saved' && <button ref={undoRef} type="button" className="fx-ai-ghost" onClick={onUndo}>Undo</button>}
        {status !== 'cancelled' && (
          <a className="fx-act-link" href={openHref} onClick={(e) => { e.preventDefault(); onOpen(openHref); }}>{openLabel}</a>
        )}
      </div>
    </>
  );
}

function ExpenseCard({ action, onChange, onOpen }: {
  action: ExpenseAction; onChange: (next: AssistantAction) => void; onOpen: (href: string) => void;
}) {
  const [error, setError] = useState('');
  const undoRef = useFocusOnSaved(action.status);
  const month = action.date.slice(0, 7);
  const cats = useMemo(() => allCategories(loadCatViewFor(month).active), [month]);
  const label = cats.find((c) => c.k === action.category)?.l ?? action.category;
  // Priced on every render: a category that stays home, or a date outside the
  // trip, changes how the same typed amount is saved.
  const priced = priceExpense(action, loadTrips());
  const pending = action.status === 'pending';

  const amountLine = priced.ok && priced.inTripCurrency
    ? <>{fmtForeign(action.typed, priced.currency)} <span className="fx-act-conv">= {fmtExact(priced.money.amount, action.homeCurrency)} at your trip rate of {fmtRate(priced.money.fxRate ?? 0)}{priced.money.fxFee ? ` plus a ${priced.money.fxFee}% card fee` : ''}</span></>
    : fmtExact(action.typed, action.homeCurrency);

  const save = () => {
    const out = saveExpenseAction(action);
    if (!out.ok) { setError(out.message); return; }
    setError('');
    onChange(out.action);
  };
  const undo = () => {
    const out = undoExpenseAction(action);
    if (!out.ok) { setError(out.message); return; }
    setError('');
    onChange(out.action);
  };

  return (
    <div className="fx-act" role="group" aria-label={priced.ok && priced.trip && priced.inTripCurrency ? 'Log trip spend' : 'Log spend'}>
      <p className="fx-act-head">{priced.ok && priced.trip && priced.money.tripId ? 'Trip spend' : 'Spend'}</p>
      <p className="fx-act-amount">{amountLine}</p>
      {pending ? (
        <>
          <div className="fx-act-fields">
            <label>
              <span>Category</span>
              <select
                value={action.category}
                onChange={(e) => onChange({ ...action, category: e.target.value })}
              >
                {!action.category && <option value="">Choose a category</option>}
                {cats.map((c) => <option key={c.k} value={c.k}>{c.l}</option>)}
              </select>
            </label>
            <label>
              <span>Date</span>
              <input
                type="date"
                value={action.date}
                onChange={(e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onChange({ ...action, date: e.target.value }); }}
              />
            </label>
          </div>
          {action.note && <p className="fx-act-note">Note: {action.note}</p>}
          {!priced.ok && <p className="fx-act-err" role="alert">{priced.message}</p>}
          {error && <p className="fx-act-err" role="alert">{error}</p>}
          <div className="fx-act-btns">
            <button type="button" className="fx-ai-review" onClick={save} disabled={!priced.ok || !action.category}>Save</button>
            <button type="button" className="fx-ai-ghost" onClick={() => onChange({ ...action, status: 'cancelled' })}>Cancel</button>
          </div>
        </>
      ) : (
        <Done
          status={action.status}
          saved={`Saved to ${label}, ${fmtTripDay(action.date)}.`}
          undoRef={undoRef} onUndo={undo} error={error}
          openHref="/tools/expenses" openLabel="Open Expense Tracker" onOpen={onOpen}
        />
      )}
    </div>
  );
}

function BudgetCard({ action, onChange, onOpen }: {
  action: BudgetAction; onChange: (next: AssistantAction) => void; onOpen: (href: string) => void;
}) {
  const { cfmt } = useCurrency();
  const [error, setError] = useState('');
  const undoRef = useFocusOnSaved(action.status);
  const cats = useMemo(() => allCategories(loadCatViewFor(action.month).active), [action.month]);
  const label = cats.find((c) => c.k === action.category)?.l ?? action.category;
  const monthName = new Date(Number(action.month.slice(0, 4)), Number(action.month.slice(5, 7)) - 1, 1)
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const current = getJSON<BudgetStore>('fx_bb_data', {})[action.month]?.vals?.[action.category];
  const pending = action.status === 'pending';

  const save = () => {
    const out = saveBudgetAction(action);
    if (!out.ok) { setError(out.message); return; }
    setError('');
    onChange(out.action);
  };
  const undo = () => {
    const out = undoBudgetAction(action);
    if (!out.ok) { setError(out.message); return; }
    setError('');
    onChange(out.action);
  };

  return (
    <div className="fx-act" role="group" aria-label="Set budget">
      <p className="fx-act-head">{label} budget · {monthName}</p>
      <p className="fx-act-amount">{cfmt(action.amount)}</p>
      {pending ? (
        <>
          <p className="fx-act-note">Now: {current != null ? cfmt(Number(current) || 0) : 'not set'}</p>
          {error && <p className="fx-act-err" role="alert">{error}</p>}
          <div className="fx-act-btns">
            <button type="button" className="fx-ai-review" onClick={save}>Save</button>
            <button type="button" className="fx-ai-ghost" onClick={() => onChange({ ...action, status: 'cancelled' })}>Cancel</button>
          </div>
        </>
      ) : (
        <Done
          status={action.status}
          saved={`${label} budget set to ${cfmt(action.amount)}.`}
          undoRef={undoRef} onUndo={undo} error={error}
          openHref="/tools/budget" openLabel="Open Budget Builder" onOpen={onOpen}
        />
      )}
    </div>
  );
}

/**
 * Hands the router's `navigate` to the panel. Rendered only inside a router
 * (the panel is also rendered without one, in tests), so the panel itself never
 * calls a router hook.
 */
export function NavBridge({ navigateRef }: { navigateRef: React.MutableRefObject<((href: string) => void) | null> }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigateRef.current = (href: string) => navigate(href);
    return () => { navigateRef.current = null; };
  }, [navigate, navigateRef]);
  return null;
}

export function ActionStyles() {
  return <style>{ACTION_STYLES}</style>;
}

const ACTION_STYLES = `
.fx-act{margin-top:10px;padding:12px;border-radius:12px;background:var(--well);border:1px solid var(--well-border);}
.fx-act-head{margin:0 0 4px;font-size:11.5px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:var(--ink3);}
.fx-act-amount{margin:0 0 10px;font-size:20px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;}
.fx-act-conv{display:block;margin-top:2px;font-size:12px;font-weight:500;color:var(--ink2);}
.fx-act-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;}
.fx-act-fields label{display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--ink3);min-width:0;}
.fx-act-fields select,.fx-act-fields input{min-height:44px;padding:8px 10px;border-radius:10px;border:1px solid var(--hair);
  background:var(--card-solid,#15151A);color:var(--ink);font:inherit;font-size:max(13px, var(--field-min-fs));min-width:0;width:100%;}
.fx-act-fields select:focus-visible,.fx-act-fields input:focus-visible{outline:2px solid var(--gold);outline-offset:1px;}
.fx-act-note{margin:0 0 10px;font-size:12px;line-height:1.5;color:var(--ink2);}
.fx-act-sub{margin:10px 0 4px;font-size:11.5px;font-weight:600;color:var(--ink3);}
.fx-act-err{margin:0 0 10px;font-size:12px;color:var(--red);}
.fx-act-done{margin:0 0 8px;font-size:12.5px;color:var(--ink2);}
.fx-act-btns{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}
.fx-act-btns .fx-ai-review{margin-bottom:0;min-height:44px;padding:9px 18px;}
.fx-act-btns .fx-ai-review:disabled{opacity:.5;cursor:not-allowed;}
.fx-act-btns .fx-ai-ghost{min-height:44px;}
.fx-act-link{display:inline-flex;align-items:center;min-height:44px;font-size:12.5px;color:var(--accent-text);}
.fx-act-rows{margin:0 0 6px;display:grid;gap:4px;}
.fx-act-rows div{display:flex;justify-content:space-between;gap:12px;font-size:12.5px;}
.fx-act-rows dt{color:var(--ink2);}
.fx-act-rows dd{margin:0;color:var(--ink);font-variant-numeric:tabular-nums;text-align:right;}
.fx-act-rows.is-strong dd{font-weight:700;}
@media(max-width:380px){.fx-act-fields{grid-template-columns:1fr;}}
`;
