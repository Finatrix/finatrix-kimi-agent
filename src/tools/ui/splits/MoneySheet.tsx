import { useId, useState } from 'react';
import { ToolSheet } from '../ToolSheet';
import { AmountInput } from '../AmountInput';
import { currencySym } from '../../lib/format';
import { evaluateFormula } from '../../lib/formula';
import { groupAmount } from '../../lib/groups';
import { formatPaise, toPaise } from '../../lib/groupSplit';
import { SPLIT_AMOUNT_MAX, SPLIT_NOTE_MAX, newEntryId, type MoneyEntry, type SplitPersonRecord } from '../../lib/splits';
import { ymdLocal } from '../../../lib/date';
import { NewPersonField } from './NewPersonField';
import '../groups/groups.css';

type Kind = MoneyEntry['kind'];

const KINDS: ReadonlyArray<{ id: Kind; label: string }> = [
  { id: 'lent', label: 'I lent' },
  { id: 'borrowed', label: 'I borrowed' },
  { id: 'settled_in', label: 'They paid me back' },
  { id: 'settled_out', label: 'I paid them back' },
];

/**
 * Money lent or borrowed, and "Mark as settled". Kept apart from spending:
 * none of it reaches the Expense Tracker. For a settlement, `owed` (paise, with
 * you; positive, they owe you) fills in the full amount, and a part payment
 * leaves the rest on the balance.
 */
export function MoneySheet({ entry, start, people, currency, nameOf, balanceOf, onAddPerson, onSave, onDelete, onClose }: {
  entry: MoneyEntry | null;
  /** For a new entry: what it is and with whom. */
  start: { kind: Kind; personId: string | null; amount?: number };
  people: readonly SplitPersonRecord[];
  currency: string;
  nameOf: (id: string) => string;
  /** The current balance with a person, in paise (positive: they owe you). */
  balanceOf: (id: string) => number;
  onAddPerson: (name: string) => SplitPersonRecord | null;
  onSave: (entry: MoneyEntry) => boolean;
  onDelete: (entry: MoneyEntry) => void;
  onClose: () => void;
}) {
  const uid = useId();
  const [kind, setKind] = useState<Kind>(entry?.kind ?? start.kind);
  const [personId, setPersonId] = useState<string>(entry?.personId ?? start.personId ?? '');
  const [amount, setAmount] = useState(entry ? String(entry.amount) : start.amount ? String(start.amount) : '');
  const [date, setDate] = useState(entry?.date ?? ymdLocal(new Date()));
  const [note, setNote] = useState(entry?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const settling = kind === 'settled_in' || kind === 'settled_out';
  const sym = currencySym(currency) || `${currency} `;
  const who = personId ? nameOf(personId) : 'them';
  const options = people.some((p) => p.id === personId) || !personId ? people : [...people, { id: personId, name: nameOf(personId) } as SplitPersonRecord];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personId) { setError('Choose who it’s with.'); return; }
    const parsed = evaluateFormula(amount);
    const value = parsed.ok ? groupAmount(parsed.value) : null;
    if (value === null || value > SPLIT_AMOUNT_MAX) { setError('Enter an amount above 0.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '2000-01-01' || date > '2100-12-31') { setError('Pick a date.'); return; }
    if (settling) {
      // What is owed now, not counting this settlement itself when it is being edited.
      const own = entry && entry.personId === personId ? entry : null;
      const before = balanceOf(personId) + (own?.kind === 'settled_in' ? toPaise(own.amount) : own?.kind === 'settled_out' ? -toPaise(own.amount) : 0);
      const owed = kind === 'settled_in' ? before : -before;
      if (owed <= 0) { setError(kind === 'settled_in' ? `${who} doesn’t owe you anything right now.` : `You don’t owe ${who} anything right now.`); return; }
      if (toPaise(value) > owed) { setError(`That’s more than ${kind === 'settled_in' ? `${who} owes you` : `you owe ${who}`} (${formatPaise(owed, currency)}).`); return; }
    }
    const now = new Date().toISOString();
    const saved = onSave({
      id: entry?.id ?? newEntryId(), kind, personId, amount: value, date,
      note: note.trim().slice(0, SPLIT_NOTE_MAX), createdAt: entry?.createdAt ?? now, updatedAt: now,
    });
    if (!saved) setError('Couldn’t save on this device. Free up some storage and try again.');
  };

  const title = entry ? 'Edit' : settling ? 'Mark as settled' : 'Money lent or borrowed';
  return (
    <ToolSheet title={title}
      description={settling ? 'FinatriX doesn’t move any money. Record what was paid back, and the balance updates.' : 'Kept apart from your spending: none of this goes into your Expense Tracker.'}
      onClose={onClose}
      footer={confirmDelete ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="note" style={{ marginRight: 'auto' }}>Delete this entry?</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Keep</button>
          <button type="button" className="btn btn-sm fx-split-danger" onClick={() => entry && onDelete(entry)}>Delete</button>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {entry && <button type="button" className="btn btn-ghost btn-sm" style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>Delete</button>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" form={`${uid}-money`} className="btn btn-sm">{settling && !entry ? 'Mark as settled' : 'Save'}</button>
        </div>
      )}>
      <form id={`${uid}-money`} onSubmit={submit} noValidate>
        <fieldset className="fx-grp-choices" style={{ marginBottom: 10 }}>
          <legend className="fl">What happened</legend>
          {KINDS.map((k) => (
            <label key={k.id} className="fx-grp-choice">
              <input type="radio" name={`${uid}-kind`} checked={kind === k.id} onChange={() => { setError(null); setKind(k.id); }} />
              <b>{k.label}</b>
            </label>
          ))}
        </fieldset>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor={`${uid}-who`}>With</label>
          <select id={`${uid}-who`} className="fs" value={personId} onChange={(e) => { setError(null); setPersonId(e.target.value); }}>
            <option value="" disabled>Choose a person</option>
            {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {!entry && (
            <NewPersonField existing={people} label="Or add someone new" onAdd={(name) => {
              const made = onAddPerson(name);
              if (made) setPersonId(made.id);
              return !!made;
            }} />
          )}
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor={`${uid}-amt`}>Amount ({currency})</label>
          <AmountInput id={`${uid}-amt`} sym={sym} value={amount} onChange={(v) => { setError(null); setAmount(v); }} />
          {settling && !entry && <p className="note" style={{ marginTop: 6 }}>Paid back only part of it? Change the amount. The rest stays on the balance.</p>}
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor={`${uid}-date`}>Date</label>
          <input id={`${uid}-date`} className="fi" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor={`${uid}-note`}>Note (optional)</label>
          <input id={`${uid}-note`} className="fi" type="text" maxLength={SPLIT_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <p className="fx-grp-err" role="alert">{error}</p>}
      </form>
    </ToolSheet>
  );
}
