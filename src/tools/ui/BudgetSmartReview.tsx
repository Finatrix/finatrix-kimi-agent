import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { computeBudget, type BudgetInput, type BudgetVals, type SectionedCats } from '../lib/budget';
import type { ExpenseItem } from '../lib/expense';
import { monthLabel } from '../lib/month';
import { previewBudgetRemainder, reviewBudgetActuals, undoBudgetPatch } from '../lib/budgetSmartReview';

export function BudgetSmartReview({ month, input, cats, items, cfmt, onApply, onReview, onAnnounce }: {
  month: string; input: BudgetInput; cats: SectionedCats; items: ExpenseItem[];
  cfmt: (value: number) => string; onApply: (vals: BudgetVals) => void;
  onReview: (section: string, key: string) => void; onAnnounce: (message: string) => void;
}) {
  const [destination, setDestination] = useState('');
  const [preview, setPreview] = useState<'actuals' | 'remainder' | null>(null);
  const [undo, setUndo] = useState<{ before: BudgetVals; applied: BudgetVals } | null>(null);
  const review = useMemo(() => reviewBudgetActuals(month, items, cats, input.vals), [month, items, cats, input.vals]);
  const before = computeBudget(input, cats);
  const remainder = previewBudgetRemainder(input, cats, destination);
  const proposed = preview === 'actuals' && review.gaps.length ? review.next : preview === 'remainder' ? remainder?.vals : null;
  const after = proposed ? computeBudget({ ...input, vals: proposed }, cats) : null;

  const apply = () => {
    if (!proposed) return;
    setUndo({ before: { ...input.vals }, applied: { ...proposed } });
    onApply(proposed);
    setPreview(null);
    onAnnounce('Reviewed allocations applied. Undo is available in Smart budget review.');
  };

  return (
    <section className="card" aria-label="Smart budget review">
      <h2 style={{ fontSize: 17, margin: '0 0 6px' }}>Smart budget review</h2>
      <p className="note">Checks {monthLabel(month)} against your saved transactions. Changes are previewed using the same budget calculator.</p>
      <p style={{ fontSize: 13 }}>
        {review.transactionCount === 0 ? 'No transactions for this month yet. Actual spending cannot be checked.'
          : `${review.transactionCount} transaction${review.transactionCount === 1 ? '' : 's'} checked · ${review.gaps.length} ${review.gaps.length === 1 ? 'category' : 'categories'} above the planned amount.`}
        {' '}Logged amounts are observations, not a forecast of the rest of the month.
      </p>
      {review.unmatched.length > 0 && <p className="note">{review.unmatched.length} categories have activity outside this month’s active budget. <Link to="/tools/expenses">Review transaction categories</Link> before applying a plan.</p>}
      {review.gaps.length > 0 && <details>
        <summary>Review spending gaps ({review.gaps.length})</summary>
        <ul style={{ paddingLeft: 20, fontSize: 13 }}>
          {review.gaps.map((cat) => <li key={cat.k} style={{ marginBottom: 8 }}>
            {cat.l}: {cfmt(cat.spent)} logged, {cfmt(cat.budget)} planned.{' '}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onReview(cat.section!, cat.k)}>Edit {cat.l} plan</button>
          </li>)}
        </ul>
        <button type="button" className="btn btn-sm" onClick={() => setPreview('actuals')}>Preview matching logged amounts</button>
        <p className="note">Raises only the categories below their logged total. Future costs still need your review; existing larger allocations stay in place.</p>
      </details>}
      {before.free > 0 && cats.save.length > 0 && <details style={{ marginTop: 12 }}>
        <summary>Give the remaining {cfmt(before.free)} a purpose</summary>
        <label htmlFor="bb-smart-destination" style={{ display: 'block', margin: '12px 0 6px', fontSize: 13 }}>Choose where to allocate the remainder</label>
        <select id="bb-smart-destination" className="fi" value={destination} onChange={(event) => { setDestination(event.target.value); setPreview(null); }} style={{ width: '100%', maxWidth: 340 }}>
          <option value="">Choose a savings category</option>
          {cats.save.map((cat) => <option key={cat.k} value={cat.k}>Allocate to {cat.l}</option>)}
        </select>{' '}
        <button type="button" className="btn btn-ghost btn-sm" disabled={!remainder} onClick={() => setPreview('remainder')}>Preview allocation</button>
        <p className="note">This allocates money in your plan only. It does not transfer money or recommend an investment.</p>
      </details>}
      {after && proposed && <div style={{ borderTop: '1px solid var(--hair)', marginTop: 14, paddingTop: 12 }} role="region" aria-label="Budget change preview">
        <p style={{ fontSize: 13 }}>Planned total: {cfmt(before.spent)} → {cfmt(after.spent)}. Money left: {cfmt(before.free)} → {cfmt(after.free)}.</p>
        {after.free < 0 && <p role="alert" className="note">This would allocate {cfmt(-after.free)} beyond your income. Review the shortfall before applying.</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={apply}>Apply reviewed allocations</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}>Cancel preview</button>
        </div>
      </div>}
      {undo && <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => {
        onApply(undoBudgetPatch(input.vals, undo.before, undo.applied)); setUndo(null); setPreview(null);
        onAnnounce('Smart allocation undone. Any later manual edits were kept.');
      }}>Undo last smart allocation</button>}
    </section>
  );
}
