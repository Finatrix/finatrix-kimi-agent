import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useCurrency } from '../CurrencyContext';
import { getJSON, onLocalWrite, store } from '../lib/storage';
import { currentMonth, monthLabel, prevMonth } from '../lib/month';
import { loadExpenses } from '../lib/expense';
import { loadCatViewFor } from '../lib/budgetCatsMonth';
import type { BudgetStore } from '../lib/budget';
import { emergencyPlan, loadPlanning, monthlyReview, recurringKey, recurringPayments, savePlanning, PLANNING_KEY, type PlanningState } from '../lib/planning';
import { ymdLocal } from '../../lib/date';
import { useAskAi } from './AiAssistant';
import { MoneyField } from './MoneyField';
import './planning.css';

export function DashboardGuide({ hasData, done = [] }: { hasData: boolean; /** Whether each of the three steps already has saved data. */ done?: boolean[] }) {
  const doneCount = done.filter(Boolean).length;
  const ai = useAskAi();
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('help') !== 'setup' || !ai?.enabled) return;
    ai.open();
    const next = new URLSearchParams(params);
    next.delete('help');
    setParams(next, { replace: true });
  }, [params, setParams, ai]);
  return <details className="fx-planning fx-plan-guide" open={!hasData || undefined}>
    <summary>Getting started · three useful first steps{done.length > 0 && <span className="fx-plan-progress"> · {doneCount} of 3 done</span>}</summary>
    <ol>
      <li className={done[0] ? 'is-done' : undefined}><Link to="/welcome">1. Set up your month</Link>{done[0] && <span className="fx-plan-done"> · Done</span>}<p>Choose your market and add your take-home income. You can skip any step.</p></li>
      <li className={done[1] ? 'is-done' : undefined}><Link to="/tools/expenses">2. Add your spending</Link>{done[1] && <span className="fx-plan-done"> · Done</span>}<p>Enter a few payments or import a statement. Review imported entries before saving.</p></li>
      <li className={done[2] ? 'is-done' : undefined}><Link to="/tools/goals">3. Plan something that matters</Link>{done[2] && <span className="fx-plan-done"> · Done</span>}<p>Compare a target with a longer deadline before committing to a monthly amount.</p></li>
    </ol>
    <div className="fx-plan-actions" style={{ marginTop: 18 }}>
      <button type="button" className="btn btn-ghost btn-sm" disabled={!ai?.enabled} onClick={() => ai?.open()}>Help me get started in chat</button>
      <span className="fx-plan-muted">Setup help works without an account.</span>
    </div>
  </details>;
}

export default function DashboardPlanning() {
  const { code } = useCurrency();
  // Currency scopes also reset the local form state when the display currency changes.
  return <PlanningWorkspace key={code} currency={code} />;
}

function PlanningWorkspace({ currency }: { currency: string }) {
  const { cfmt, sym } = useCurrency();
  const [month, setMonth] = useState(() => prevMonth(currentMonth()));
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState(() => loadPlanning(currency));
  const [showDismissed, setShowDismissed] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    const refresh = () => { setRevision(r => r + 1); setState(loadPlanning(currency)); };
    const off = onLocalWrite(key => {
      if (key === PLANNING_KEY) setState(loadPlanning(currency));
      else if (key === 'fx_expenses' || key.startsWith('fx_bb_')) setRevision(r => r + 1);
    });
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => { off(); window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, [currency]);
  const data = useMemo(() => {
    void revision;
    const items = loadExpenses();
    const budgets = getJSON<BudgetStore>('fx_bb_data', {});
    const today = ymdLocal(new Date());
    const available = new Set([currentMonth(), prevMonth(currentMonth()), ...items.map(e => e.date.slice(0, 7)), ...Object.keys(budgets)]);
    return {
      months: [...available].filter(m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= currentMonth()).sort().reverse(),
      review: monthlyReview(items.filter(e => e.date <= today), month, loadCatViewFor(month).active, loadCatViewFor(prevMonth(month)).active, budgets[month]),
      recurring: recurringPayments(items, loadCatViewFor(currentMonth()).active, today),
    };
  }, [month, revision]);
  const update = (next: PlanningState) => { setState(next); savePlanning(currency, next); };
  const reviewed = state.reviews[month];
  const plan = emergencyPlan(state.emergency);
  const bills = data.recurring.filter(p => showDismissed || state.recurring[recurringKey(p)] !== 'dismissed');
  const recurringTotal = data.recurring.filter(p => state.recurring[recurringKey(p)] !== 'dismissed').reduce((sum, p) => sum + p.estimatedMonthly, 0);
  const review = data.review;

  return <div className="fx-planning">
    <div className="fx-planning-grid">
      <section className="fx-planning-surface" id="monthly-review" aria-labelledby="review-title">
        <div className="fx-planning-head">
          <div><h2 id="review-title">Monthly financial review</h2><p>Look back at what you recorded, then choose one thing to change.</p></div>
          <label>Review month<select className="fs" value={month} onChange={e => { setMonth(e.target.value); setStatus(''); }}>
            {data.months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select></label>
        </div>
        {review.count > 0 ? <>
          <p className="fx-plan-muted">{review.count} recorded entries · {month === currentMonth() ? 'Month in progress; totals are incomplete.' : 'Based on your entries, which may not include every payment.'}</p>
          <dl className="fx-plan-stats">
            <div><dt>Recorded spending</dt><dd>{cfmt(review.consumedTotal)}</dd></div>
            <div><dt>Savings, investments & transfers</dt><dd>{cfmt(review.setAsideTotal)}</dd></div>
            <div><dt>Income in your budget</dt><dd>{review.plannedIncome === null ? 'Not entered' : cfmt(review.plannedIncome)}</dd></div>
          </dl>
          <p>{review.difference === null ? 'Add entries for the previous month to compare spending.' : `${cfmt(Math.abs(review.difference))} ${review.difference >= 0 ? 'more' : 'less'} spending than ${monthLabel(prevMonth(month))}. This compares recorded totals, not equal days of the month.`}</p>
        </> : <p className="fx-plan-note">No payments recorded for {monthLabel(month)}. <Link to="/tools/expenses">Add or import your expenses</Link> to build a review.</p>}
        <label htmlFor="review-note">One change for next month
          <textarea id="review-note" className="fi" rows={3} maxLength={2000} value={reviewed?.note ?? ''} placeholder="For example, check which subscriptions I still use." onChange={e => update({ ...state, reviews: { ...state.reviews, [month]: { note: e.target.value, reviewedAt: null } } })} />
        </label>
        <div className="fx-plan-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-sm" disabled={review.count === 0} onClick={() => {
            update({ ...state, reviews: { ...state.reviews, [month]: { note: reviewed?.note ?? '', reviewedAt: new Date().toISOString() } } });
            setStatus('Review marked complete. You can come back and edit your note.');
          }}>{reviewed?.reviewedAt ? 'Mark reviewed again' : 'Mark month reviewed'}</button>
          <Link to="/tools/reports">Export records</Link>
        </div>
        {reviewed?.reviewedAt && <p className="fx-plan-muted">Last reviewed {new Date(reviewed.reviewedAt).toLocaleDateString()}. Figures update when your records change.</p>}
      </section>

      <section className="fx-planning-surface" id="recurring-payments" aria-labelledby="recurring-title">
        <h2 id="recurring-title">Recurring payments</h2>
        <p>Possible monthly payments from your recorded history. Confirm the ones you recognise; dismiss coincidental repeats.</p>
        {data.recurring.length > 0 && <dl className="fx-plan-stats"><div><dt>Estimated monthly total · includes unconfirmed</dt><dd>{cfmt(recurringTotal)}</dd></div></dl>}
        {bills.length > 0 ? <ul className="fx-plan-bills">{bills.map(p => {
          const key = recurringKey(p);
          const decision = state.recurring[key];
          const decide = (value?: 'confirmed' | 'dismissed') => {
            const recurring = { ...state.recurring };
            if (value) recurring[key] = value; else delete recurring[key];
            update({ ...state, recurring });
            setStatus(`${p.displayName}: ${value || 'restored for review'}.`);
          };
          return <li key={key}>
            <div className="fx-plan-bill"><strong>{p.displayName}</strong><strong>{cfmt(p.estimatedMonthly)} / mo</strong></div>
            <p>{p.label} · Seen in {p.monthsDetected} {p.monthsDetected === 1 ? 'month' : 'months'} · Last recorded {p.lastDate}<br />{decision === 'confirmed' ? 'Confirmed by you' : decision === 'dismissed' ? 'Dismissed by you' : 'Possible recurring payment'}</p>
            <div className="fx-plan-actions">
              {decision !== 'confirmed' && decision !== 'dismissed' && <button className="btn btn-ghost btn-sm" onClick={() => decide('confirmed')} aria-label={`Confirm ${p.displayName}`}>Confirm</button>}
              {decision !== 'dismissed' ? <button className="btn btn-ghost btn-sm" onClick={() => decide('dismissed')} aria-label={`Dismiss ${p.displayName}`}>Dismiss</button> : <button className="btn btn-ghost btn-sm" onClick={() => decide()} aria-label={`Restore ${p.displayName}`}>Restore</button>}
              {decision === 'confirmed' && <button className="btn btn-ghost btn-sm" onClick={() => decide()} aria-label={`Undo confirmation for ${p.displayName}`}>Undo confirmation</button>}
            </div>
          </li>;
        })}</ul> : <p className="fx-plan-note">{data.recurring.length ? 'All detected payments are dismissed. Show them below to restore one.' : 'No recurring pattern found yet. Add payments from at least two months, including merchant names, or mark repeated entries as recurring in Expenses.'}</p>}
        <div className="fx-plan-actions"><Link to="/tools/expenses">Review expense entries</Link><button className="btn btn-ghost btn-sm" aria-pressed={showDismissed} onClick={() => setShowDismissed(v => !v)}>{showDismissed ? 'Hide dismissed' : 'Show dismissed'}</button></div>
        <p className="fx-plan-muted">Estimates use average amounts and recent patterns, not bank connections. Confirmation does not schedule, cancel or record a payment.</p>
      </section>
    </div>

    <section className="fx-planning-surface" id="emergency-fund" aria-labelledby="emergency-title" style={{ marginTop: 32 }}>
      <div className="fx-planning-grid">
        <div><h2 id="emergency-title">Your emergency fund</h2><p>Plan for an interruption to income using the bills you would still need to pay. Keep this separate from savings committed to another goal.</p>
          <div className="fx-plan-fields">
            {([
              ['essentials', `Monthly essentials (${currency})`], ['months', 'Months of cover'],
              ['saved', `Accessible savings already set aside (${currency})`], ['contribution', `Monthly contribution (${currency})`],
            ] as const).map(([field, label]) => {
              const id = `ef-${field}`;
              const commit = (value: number) => update({ ...state, emergency: { ...state.emergency, [field]: value } });
              // Money is MoneyField, never `type="number"`: a number input reports
              // '' for "12.", which this numeric state turned into 0 and wiped.
              return <div className="fx-plan-field" key={field}><label htmlFor={id}>{label}</label>{field === 'months'
                ? <input id={id} className="fi" type="number" inputMode="numeric" min={1} max={24} step={1} value={state.emergency.months || ''} onChange={e => {
                  const value = Number(e.target.value);
                  if (!Number.isFinite(value) || value < 0 || value > 1e12) return;
                  commit(Math.min(24, Math.max(1, Math.round(value))));
                }} />
                : <MoneyField id={id} className="fi" sym={sym} value={state.emergency[field]} onCommit={commit} />}</div>;
            })}
          </div>
        </div>
        <div>
          {plan.target > 0 ? <>
            <dl className="fx-plan-stats"><div><dt>Target reserve</dt><dd>{cfmt(plan.target)}</dd></div><div><dt>Still to set aside</dt><dd>{cfmt(plan.gap)}</dd></div><div><dt>Cover available now</dt><dd>{plan.coveredMonths?.toFixed(1)} months</dd></div></dl>
            <progress value={plan.progress} max={100} aria-label="Emergency fund progress" />
            <p>{plan.monthsToTarget === 0 ? 'Your entered savings cover this target.' : plan.monthsToTarget === null ? 'Enter a monthly contribution to estimate how long it will take.' : `At this contribution, the remaining target takes ${plan.monthsToTarget} ${plan.monthsToTarget === 1 ? 'month' : 'months'}.`}</p>
          </> : <p className="fx-plan-note">Enter your essential monthly costs to see a target. Include housing, food, utilities, required repayments and any dependants’ essentials.</p>}
          <details><summary>How this plan works</summary><p>Target = monthly essentials × months of cover. Gap = target − accessible savings, with a minimum of zero. Time = gap ÷ monthly contribution, rounded up to whole months. No interest, investment returns or withdrawals are assumed. Three months is a starting input, not a personalised recommendation.</p></details>
          <p className="fx-plan-muted">Saved in {currency}. Changing currency opens a separate plan; these amounts are not automatically converted. {store.persistent ? 'Signed-in finance data syncs with your account.' : 'Browser storage is unavailable; this plan lasts for this session only.'}</p>
          <Link to="/tools/goals">Compare your other goals and deadlines →</Link>
        </div>
      </div>
    </section>
    <p role="status">{status}</p>
  </div>;
}
