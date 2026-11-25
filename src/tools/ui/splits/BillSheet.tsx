import { useId, useMemo, useState } from 'react';
import { ToolSheet } from '../ToolSheet';
import { AmountInput } from '../AmountInput';
import { SplitFields } from '../groups/SplitFields';
import { currencySym } from '../../lib/format';
import { evaluateFormula } from '../../lib/formula';
import { allCategories } from '../../lib/budget';
import { loadCatViewFor } from '../../lib/budgetCatsMonth';
import { groupAmount } from '../../lib/groups';
import { checkSplit, formatPaise, toPaise } from '../../lib/groupSplit';
import { initialSplit, splitDraftOf, type SplitPerson, type SplitState } from '../../lib/groupSplitForm';
import { resolveShareCategory } from '../../lib/groupShare';
import {
  ME, MAX_IN_BILL, SPLIT_AMOUNT_MAX, SPLIT_NOTE_MAX, checkBillPeople, newEntryId, peopleIn,
  type BillEntry, type SplitPersonRecord,
} from '../../lib/splits';
import { ymdLocal } from '../../../lib/date';
import { NewPersonField } from './NewPersonField';
import '../groups/groups.css';

/**
 * Split a bill with people not on FinatriX. Who's in it, then 2.4's own
 * "Paid by" and "Split" fields (`SplitFields`), so the preview, the saved
 * split and the balances all come from the same maths. Your share goes into
 * your Expense Tracker; the category is the one it is filed under there.
 */
export function BillSheet({ bill, people, currency, nameOf, onAddPerson, onSave, onDelete, onClose }: {
  bill: BillEntry | null;
  people: readonly SplitPersonRecord[];
  currency: string;
  nameOf: (id: string) => string;
  onAddPerson: (name: string) => SplitPersonRecord | null;
  onSave: (bill: BillEntry) => boolean;
  onDelete: (bill: BillEntry) => void;
  onClose: () => void;
}) {
  const uid = useId();
  const [amount, setAmount] = useState(bill ? String(bill.amount) : '');
  const [note, setNote] = useState(bill?.note ?? '');
  const [date, setDate] = useState(bill?.date ?? ymdLocal(new Date()));
  const [category, setCategory] = useState(() => (bill ? resolveShareCategory(bill.category, bill.date.slice(0, 7)) : ''));
  const [chosen, setChosen] = useState<string[]>(() => (bill ? peopleIn(bill) : []));
  const [split, setSplit] = useState<SplitState>(() => initialSplit(
    [{ id: ME, name: 'You' }, ...(bill ? peopleIn(bill) : []).map((id) => ({ id, name: nameOf(id) }))],
    ME,
    bill ? { paid_by: bill.paidBy, split_rule: bill.rule, shares: bill.shares } : undefined,
  ));
  const [error, setError] = useState<string | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sym = currencySym(currency) || `${currency} `;
  const money = (paise: number) => formatPaise(paise, currency);
  const typed = evaluateFormula(amount);
  const amountPaise = typed.ok && typed.value > 0 ? toPaise(typed.value) : null;
  const month = /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : ymdLocal(new Date()).slice(0, 7);
  const categories = useMemo(
    () => allCategories(loadCatViewFor(month).active).filter((c) => c.section !== 'save').map((c) => ({ value: c.k, label: c.l })),
    [month],
  );
  const categoryValue = categories.some((c) => c.value === category) ? category : (categories.find((c) => c.value === 'eating_out') ?? categories[0])?.value ?? 'other';

  // Removed people stay listed while an old bill still names them.
  const offered = useMemo(() => {
    const ids = new Set(people.map((p) => p.id));
    return [...people.map((p) => ({ id: p.id, name: p.name })), ...chosen.filter((id) => !ids.has(id)).map((id) => ({ id, name: nameOf(id) }))];
  }, [people, chosen, nameOf]);
  const inSplit = useMemo<SplitPerson[]>(
    () => [{ id: ME, name: 'You' }, ...chosen.map((id) => ({ id, name: nameOf(id) }))],
    [chosen, nameOf],
  );

  const toggle = (id: string) => {
    setSplitError(null);
    if (chosen.includes(id)) {
      setChosen(chosen.filter((x) => x !== id));
      setSplit({ ...split, paidBy: split.paidBy === id ? ME : split.paidBy, included: split.included.filter((x) => x !== id) });
    } else {
      if (chosen.length + 1 >= MAX_IN_BILL) { setSplitError(`A bill can be split between up to ${MAX_IN_BILL} people.`); return; }
      setChosen([...chosen, id]);
      setSplit({ ...split, included: [...split.included, id] });
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = evaluateFormula(amount);
    const value = parsed.ok ? groupAmount(parsed.value) : null;
    if (value === null || value > SPLIT_AMOUNT_MAX) { setError('Enter an amount above 0.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '2000-01-01' || date > '2100-12-31') { setError('Pick a date.'); return; }
    const who = checkBillPeople(split.paidBy, split.included);
    if (who) { setSplitError(who); return; }
    const checked = checkSplit(splitDraftOf(split), toPaise(value), money);
    if (!checked.ok) { setSplitError(checked.reason); return; }
    const now = new Date().toISOString();
    const saved = onSave({
      id: bill?.id ?? newEntryId(),
      kind: 'bill',
      amount: value,
      date,
      note: note.trim().slice(0, SPLIT_NOTE_MAX),
      category: categoryValue,
      paidBy: split.paidBy,
      rule: checked.rule,
      shares: checked.shares,
      createdAt: bill?.createdAt ?? now,
      updatedAt: now,
    });
    if (!saved) setError('Couldn’t save on this device. Free up some storage and try again.');
  };

  return (
    <ToolSheet title={bill ? 'Edit bill' : 'Split a bill'}
      description="Only your share counts as your spending. It goes into your Expense Tracker, marked “Split”."
      onClose={onClose}
      footer={confirmDelete ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="note" style={{ marginRight: 'auto' }}>Delete this bill and your share in the tracker?</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Keep</button>
          <button type="button" className="btn btn-sm fx-split-danger" onClick={() => bill && onDelete(bill)}>Delete</button>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {bill && <button type="button" className="btn btn-ghost btn-sm" style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>Delete</button>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" form={`${uid}-bill`} className="btn btn-sm">{bill ? 'Save changes' : 'Save'}</button>
        </div>
      )}>
      <form id={`${uid}-bill`} onSubmit={submit} noValidate>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor={`${uid}-amt`}>Total amount ({currency})</label>
          <AmountInput id={`${uid}-amt`} sym={sym} value={amount} onChange={(v) => { setError(null); setAmount(v); }} />
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor={`${uid}-note`}>What was it for?</label>
          <input id={`${uid}-note`} className="fi" type="text" maxLength={SPLIT_NOTE_MAX} placeholder="Saturday’s dinner" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <fieldset className="fx-split-with" style={{ marginBottom: 10 }}>
          <legend className="fl">Split with</legend>
          {offered.length > 0 && (
            <div className="fx-split-chips">
              {offered.map((p) => (
                <button key={p.id} type="button" className="fx-split-chip" aria-pressed={chosen.includes(p.id)} onClick={() => toggle(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <NewPersonField existing={people} onAdd={(name) => {
            const made = onAddPerson(name);
            if (made && !chosen.includes(made.id)) toggle(made.id);
            return !!made;
          }} />
        </fieldset>

        {chosen.length > 0 && (
          <SplitFields people={inSplit} meId={ME} state={split} error={splitError} amountPaise={amountPaise} money={money} sym={sym}
            onChange={(next) => { setSplitError(null); setSplit(next); }} />
        )}
        {chosen.length === 0 && splitError && <p className="fx-grp-err" role="alert">{splitError}</p>}

        <div className="fg" style={{ margin: '10px 0' }}>
          <label className="fl" htmlFor={`${uid}-cat`}>Category for your share</label>
          <select id={`${uid}-cat`} className="fs" value={categoryValue} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor={`${uid}-date`}>Date</label>
          <input id={`${uid}-date`} className="fi" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {error && <p className="fx-grp-err" role="alert">{error}</p>}
      </form>
    </ToolSheet>
  );
}
