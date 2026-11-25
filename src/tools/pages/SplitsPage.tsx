import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { useOptionalCurrency } from '../CurrencyContext';
import { useOptionalToast } from '../ui/Toast';
import { useAmountsHidden } from '../lib/hideAmounts';
import { fmtExact, fmtTripDay } from '../lib/trips';
import { formatPaise, whatsappLink } from '../lib/groupSplit';
import {
  ME, myShareOf, newPersonId, personReminderText, type BillEntry, type MoneyEntry, type SplitEntry, type SplitPersonRecord,
} from '../lib/splits';
import { useSplits } from '../lib/useSplits';
import { BillSheet } from '../ui/splits/BillSheet';
import { MoneySheet } from '../ui/splits/MoneySheet';
import { PersonSheet } from '../ui/splits/PersonSheet';
import '../ui/groups/groups.css';
import '../ui/splits/splits.css';

type Sheet =
  | { t: 'bill'; bill: BillEntry | null }
  | { t: 'money'; entry: MoneyEntry | null; start: { kind: MoneyEntry['kind']; personId: string | null; amount?: number } }
  | { t: 'person'; person: SplitPersonRecord };

const ACTIVITY_PAGE = 30;

/**
 * Splits (NEW_FEATURES item 9, step 2.5): split a bill or lend money to people
 * who aren't on FinatriX, see who owes whom, remind them on WhatsApp and mark
 * it settled. The list is yours alone (synced between your devices); friends
 * on FinatriX go through Groups, where they see it too.
 */
export default function SplitsPage() {
  const currency = useOptionalCurrency()?.code ?? 'INR';
  useAmountsHidden(); // re-render when Hide amounts is switched
  const { notify } = useOptionalToast();
  const { people, entries, balances, nameOf, savePerson, saveEntry, deleteEntry } = useSplits();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [showAll, setShowAll] = useState(false);
  const show = (paise: number) => fmtExact(paise / 100, currency);

  // Everyone on the list, plus anyone a balance still names; biggest balance first.
  const rows = useMemo(() => {
    const ids = new Set([...people.map((p) => p.id), ...[...balances].filter(([, v]) => v !== 0).map(([id]) => id)]);
    return [...ids]
      .map((id) => ({ id, person: people.find((p) => p.id === id) ?? null, balance: balances.get(id) ?? 0 }))
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || nameOf(a.id).localeCompare(nameOf(b.id)));
  }, [people, balances, nameOf]);
  const owedToYou = rows.reduce((s, r) => s + Math.max(0, r.balance), 0);
  const youOwe = rows.reduce((s, r) => s + Math.max(0, -r.balance), 0);

  const addPerson = (name: string): SplitPersonRecord | null => {
    const same = people.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (same) return same;
    const now = new Date().toISOString();
    const person: SplitPersonRecord = { id: newPersonId(), name, createdAt: now, updatedAt: now };
    return savePerson(person) ? person : null;
  };

  const forWhat = (personId: string): string | undefined => {
    const withThem = entries.filter((e) => (e.kind === 'bill' ? e.paidBy === personId || e.shares.some((s) => s.member === personId) : e.personId === personId));
    return withThem.length === 1 && (withThem[0].kind === 'lent' || (withThem[0].kind === 'bill' && withThem[0].paidBy === ME))
      ? withThem[0].note || undefined
      : undefined;
  };

  const close = () => setSheet(null);
  const saved = (entry: SplitEntry): boolean => {
    if (!saveEntry(entry)) return false;
    close();
    if (entry.kind === 'bill') {
      notify(myShareOf(entry) > 0 ? 'Saved. Your share is in your Expense Tracker.' : 'Saved.', 'ok');
    } else {
      notify(entry.kind === 'settled_in' || entry.kind === 'settled_out' ? 'Marked as settled.' : 'Saved.', 'ok');
    }
    return true;
  };
  const deleted = (entry: SplitEntry) => {
    deleteEntry(entry);
    close();
    notify('Deleted.', 'ok');
  };

  const empty = people.length === 0 && entries.length === 0;

  return (
    <div className="fx-page">
      <PageHead chip="Splits" chipColor="var(--gold)" icon="users" title="Split it. Settle it.">
        Split a bill or lend money to people who aren’t on FinatriX, and see who owes whom. Only your share
        counts as your spending.
      </PageHead>

      <div className="fx-grp-actions" style={{ marginBottom: 14 }}>
        <button type="button" className="btn btn-sm" onClick={() => setSheet({ t: 'bill', bill: null })}>
          <Icon name="plus" size={15} /> Split a bill
        </button>
        <button type="button" className="btn btn-ghost btn-sm"
          onClick={() => setSheet({ t: 'money', entry: null, start: { kind: 'lent', personId: null } })}>
          Lent or borrowed
        </button>
      </div>

      {empty ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 20px', marginBottom: 14 }} data-testid="splits-empty">
          <Icon name="users" size={40} style={{ color: 'var(--ink3)', marginBottom: 12 }} />
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>Nobody owes anybody yet</h2>
          <p className="note" style={{ maxWidth: 420, margin: '0 auto' }}>
            Split ₹2,400 with three friends and ₹600 goes into your spending, while each friend owes you ₹600.
            They don’t need FinatriX: this list is yours alone.
          </p>
        </div>
      ) : (
        <>
          <section className="card fx-split-totals" style={{ marginBottom: 14 }} aria-label="Totals" data-testid="splits-totals">
            <div className="fx-split-total">
              <span className="fx-grp-sub">Owed to you</span>
              <b className={owedToYou > 0 ? 'fx-split-owes' : undefined}>{show(owedToYou)}</b>
            </div>
            <div className="fx-split-total">
              <span className="fx-grp-sub">You owe</span>
              <b className={youOwe > 0 ? 'fx-split-owe' : undefined}>{show(youOwe)}</b>
            </div>
          </section>

          <section className="card" style={{ marginBottom: 14 }} aria-labelledby="splits-people-h">
            <h2 id="splits-people-h" style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>People</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="splits-people">
              {rows.map(({ id, person, balance }) => {
                const name = nameOf(id);
                const line = balance > 0 ? `Owes you ${show(balance)}` : balance < 0 ? `You owe ${show(-balance)}` : 'Settled up';
                return (
                  <li key={id} className="fx-split-person" data-testid="splits-person">
                    <button type="button" className="fx-split-person-main" disabled={!person}
                      aria-label={`${name}: ${line}. Edit`} onClick={() => person && setSheet({ t: 'person', person })}>
                      <span className="fx-split-initial" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="fx-grp-name">{name}</span>
                        <span className={`fx-grp-sub ${balance > 0 ? 'fx-split-owes' : balance < 0 ? 'fx-split-owe' : ''}`}>{line}</span>
                      </span>
                    </button>
                    {balance !== 0 && (
                    <span className="fx-split-person-actions">
                    {balance > 0 && (
                      <a className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }} target="_blank" rel="noopener noreferrer"
                        aria-label={`Remind ${name} on WhatsApp`}
                        href={whatsappLink(personReminderText({ toName: name, amount: formatPaise(balance, currency), forWhat: forWhat(id) }))}>
                        Remind
                      </a>
                    )}
                    {balance !== 0 && (
                      <button type="button" className="btn btn-sm" aria-label={`Mark as settled with ${name}`}
                        onClick={() => setSheet({ t: 'money', entry: null, start: { kind: balance > 0 ? 'settled_in' : 'settled_out', personId: id, amount: Math.abs(balance) / 100 } })}>
                        Mark as settled
                      </button>
                    )}
                    </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="note" style={{ margin: '6px 0 0' }}>
              FinatriX doesn’t move any money or contact anyone. “Remind” opens WhatsApp with a message you send yourself.
            </p>
          </section>

          {entries.length > 0 && (
            <section className="card" style={{ marginBottom: 14 }} aria-labelledby="splits-activity-h">
              <h2 id="splits-activity-h" style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>Activity</h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="splits-activity">
                {(showAll ? entries : entries.slice(0, ACTIVITY_PAGE)).map((e) => {
                  const { title, sub } = describe(e, nameOf, show);
                  return (
                    <li key={e.id}>
                      <button type="button" className="fx-split-entry"
                        onClick={() => setSheet(e.kind === 'bill' ? { t: 'bill', bill: e } : { t: 'money', entry: e, start: { kind: e.kind, personId: e.personId } })}>
                        <Icon name={e.kind === 'bill' ? 'users' : 'dollar'} size={16} style={{ color: 'var(--ink2)', flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="fx-grp-name">{title}</span>
                          <span className="fx-grp-sub">{sub}</span>
                        </span>
                        <span className="fx-grp-sub" style={{ flexShrink: 0 }}>{fmtTripDay(e.date)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!showAll && entries.length > ACTIVITY_PAGE && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setShowAll(true)}>
                  Show all {entries.length}
                </button>
              )}
            </section>
          )}
        </>
      )}

      <section className="card" style={{ marginBottom: 14 }} aria-labelledby="splits-how-h">
        <h2 id="splits-how-h" style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>How it works</h2>
        <p className="note" style={{ margin: 0 }}>
          Your share of a bill goes into your <Link to="/tools/expenses" className="fx-inline-link">Expense Tracker</Link>,
          marked “Split”, whoever paid. What others owe you isn’t your spending, and money lent or borrowed is kept
          apart from it. Each person settles up with you; FinatriX never asks one friend to pay another. Friends who
          use FinatriX? Make a <Link to="/tools/groups" className="fx-inline-link">group</Link> so they see it too.
        </p>
      </section>

      {sheet?.t === 'bill' && (
        <BillSheet bill={sheet.bill} people={people} currency={currency} nameOf={nameOf} onAddPerson={addPerson}
          onSave={saved} onDelete={deleted} onClose={close} />
      )}
      {sheet?.t === 'money' && (
        <MoneySheet entry={sheet.entry} start={sheet.start} people={people} currency={currency} nameOf={nameOf}
          balanceOf={(id) => balances.get(id) ?? 0} onAddPerson={addPerson} onSave={saved} onDelete={deleted} onClose={close} />
      )}
      {sheet?.t === 'person' && (
        <PersonSheet person={sheet.person} settled={(balances.get(sheet.person.id) ?? 0) === 0} onClose={close}
          onRename={(name) => {
            if (savePerson({ ...sheet.person, name, updatedAt: new Date().toISOString() })) { close(); notify('Saved.', 'ok'); }
          }}
          onRemove={() => {
            const at = new Date().toISOString();
            if (savePerson({ ...sheet.person, deletedAt: at, updatedAt: at })) { close(); notify(`${sheet.person.name} is off your list.`, 'ok'); }
          }} />
      )}

      <ToolFoot>
        Educational tools — not financial advice · <a href="/privacy" target="_top">Privacy</a> ·{' '}
        <a href="/terms" target="_top">Terms</a> · Built with care by <b>FinatriX</b>
      </ToolFoot>
    </div>
  );
}

function describe(e: SplitEntry, nameOf: (id: string) => string, show: (paise: number) => string): { title: string; sub: string } {
  const amt = show(Math.round(e.amount * 100));
  switch (e.kind) {
    case 'bill': {
      const others = e.shares.map((s) => s.member).filter((m) => m !== ME).map(nameOf);
      const mine = myShareOf(e);
      const payer = e.paidBy === ME ? 'You paid' : `${nameOf(e.paidBy)} paid`;
      return { title: e.note || 'Bill', sub: `${payer} ${amt}${mine > 0 ? ` · your share ${show(mine)}` : ''}${others.length ? ` · with ${others.join(', ')}` : ''}` };
    }
    case 'lent': return { title: e.note || 'Money lent', sub: `You lent ${nameOf(e.personId)} ${amt}` };
    case 'borrowed': return { title: e.note || 'Money borrowed', sub: `You borrowed ${amt} from ${nameOf(e.personId)}` };
    case 'settled_in': return { title: 'Settled', sub: `${nameOf(e.personId)} paid you ${amt}` };
    case 'settled_out': return { title: 'Settled', sub: `You paid ${nameOf(e.personId)} ${amt}` };
  }
}

