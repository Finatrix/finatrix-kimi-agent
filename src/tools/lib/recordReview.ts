import { ymdLocal } from '../../lib/date';
import type { ExpenseItem } from './expense';
import { migrateCategory } from './expense';

export type ReviewKind = 'duplicate' | 'date' | 'amount' | 'category';
export interface RecordFinding { kind: ReviewKind; item: ExpenseItem; reason: string }

export function validRecordDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** Deterministic review hints. Matching entries can be legitimate; never delete automatically. */
export function reviewExpenseRecords(items: readonly ExpenseItem[], validKeys: ReadonlySet<string>, now = new Date()): RecordFinding[] {
  const today = ymdLocal(now);
  const findings: RecordFinding[] = [];
  const fingerprints = new Set<string>();
  const categoryKeys = new Set(validKeys);
  for (const item of items) {
    const validDate = validRecordDate(item.date);
    if (!validDate || item.date > today) findings.push({ kind: 'date', item, reason: validDate ? 'Future-dated: confirm whether this is planned or already paid.' : 'This date is not a valid calendar day.' });
    if (!Number.isFinite(item.amount) || item.amount === 0) findings.push({ kind: 'amount', item, reason: 'This amount needs review; enter a finite, nonzero amount. Negative amounts are treated as refunds.' });
    const category = migrateCategory(item.category, categoryKeys);
    if (!validKeys.has(category)) findings.push({ kind: 'category', item, reason: 'This category is not active for the selected month.' });
    const identity = (item.merchant || item.note || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    // Avoid claiming two anonymous payments with the same amount are duplicates.
    if (!identity || !validDate || !Number.isFinite(item.amount) || item.amount <= 0) continue;
    const fingerprint = JSON.stringify([item.date, item.amount, category, identity, (item.paymentMethod || '').trim().toLowerCase()]);
    if (fingerprints.has(fingerprint)) findings.push({ kind: 'duplicate', item, reason: 'Matches another entry’s date, amount, category, merchant or description, and payment method. Check before removing.' });
    fingerprints.add(fingerprint);
  }
  return findings;
}
