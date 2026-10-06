import { useMemo, useState } from 'react';
import type { ExpenseItem } from '../lib/expense';
import { reviewExpenseRecords, type ReviewKind } from '../lib/recordReview';
import { SmartAssist } from './SmartAssist';

const LABELS: Record<ReviewKind, string> = { duplicate: 'Possible duplicates', date: 'Dates to review', amount: 'Amounts to review', category: 'Categories to review' };

export function ExpenseRecordReview({ items, validKeys, onEdit, cfmt }: { items: ExpenseItem[]; validKeys: Set<string>; onEdit: (item: ExpenseItem) => void; cfmt: (value: number) => string }) {
  const [filter, setFilter] = useState<ReviewKind | 'all'>('all');
  const [visibleLimit, setVisibleLimit] = useState(20);
  const findings = useMemo(() => reviewExpenseRecords(items, validKeys), [items, validKeys]);
  const shown = findings.filter(f => filter === 'all' || f.kind === filter);
  // Nothing to review is not a card's worth of news: the panel led the page
  // with "No review hints in 0 records" before the first payment was typed.
  if (findings.length === 0) return null;
  return <SmartAssist title="Smart record review" description="Checks the selected month for matching entries, dates, amounts and category gaps. These are review hints; your records stay under your control.">
    <details>
      <summary className="fx-smart-summary">{findings.length ? `${findings.length} review hints across ${items.length} records` : `No review hints in ${items.length} records`} · inspect</summary>
      <label className="fl" htmlFor="expense-review-filter">Review type</label>
      <select className="fs" id="expense-review-filter" value={filter} onChange={e => { setFilter(e.target.value as ReviewKind | 'all'); setVisibleLimit(20); }}>
        <option value="all">All checks</option>
        {Object.entries(LABELS).map(([key, label]) => <option key={key} value={key}>{label} ({findings.filter(f => f.kind === key).length})</option>)}
      </select>
      <p className="note" aria-live="polite">Showing {Math.min(visibleLimit, shown.length)} of {shown.length} hints. Matching entries can be legitimate. This does not reconcile your records against a bank statement.</p>
      <ul className="fx-smart-list">{shown.slice(0, visibleLimit).map((finding, index) => <li key={`${finding.item.id}-${finding.kind}-${index}`}>
        <div><strong>{LABELS[finding.kind]}</strong><p className="note">{finding.item.merchant || finding.item.note || 'Unnamed entry'} · {finding.item.date} · {Number.isFinite(finding.item.amount) ? cfmt(finding.item.amount) : 'Invalid amount'}</p><p className="note">{finding.reason}</p></div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(finding.item)} aria-label={`Review ${finding.item.merchant || finding.item.note || 'entry'}: ${LABELS[finding.kind]}`}>Review entry</button>
      </li>)}</ul>
      {shown.length > visibleLimit && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVisibleLimit(limit => limit + 20)}>Show {Math.min(20, shown.length - visibleLimit)} more review hints</button>}
    </details>
  </SmartAssist>;
}
