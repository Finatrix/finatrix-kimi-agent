import { useCallback, useMemo, useState } from 'react';
import { ToolSheet } from '../ToolSheet';
import { MoneyField } from '../MoneyField';
import { currencySym } from '../../lib/format';
import { fmtExact } from '../../lib/trips';
import { currentMembers, memberName, type GroupExpenseRow, type GroupMemberRow, type GroupSettlementRow } from '../../lib/groups';
import {
  computeBalances, formatPaise, reminderText, suggestPayments, toPaise, whatsappLink, type Payment,
} from '../../lib/groupSplit';

/**
 * Split costs: what each person is owed or owes, the fewest payments that
 * settle everyone up, and "Mark as paid". Every figure comes from the group's
 * own expenses and settlements (lib/groupSplit.ts); no money moves through
 * FinatriX, and a reminder is a WhatsApp link the user sends themselves.
 */
export function SplitCosts({ groupName, currency, members, expenses, settlements, meId, onMarkPaid }: {
  groupName: string;
  currency: string;
  members: readonly GroupMemberRow[];
  expenses: readonly GroupExpenseRow[];
  settlements: readonly GroupSettlementRow[];
  meId: string;
  onMarkPaid: (payment: Payment, paise: number) => Promise<void>;
}) {
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const balances = useMemo(() => computeBalances(expenses, settlements), [expenses, settlements]);
  const payments = useMemo(() => suggestPayments(balances), [balances]);
  const [paying, setPaying] = useState<Payment | null>(null);
  const name = useCallback((id: string) => (id === meId ? 'You' : memberName(byId.get(id))), [byId, meId]);
  const show = (paise: number) => fmtExact(paise / 100, currency);

  // Everyone with a balance, plus every current member (at zero), biggest first.
  const people = useMemo(() => {
    const ids = new Set([...currentMembers(members).map((m) => m.id), ...[...balances].filter(([, v]) => v !== 0).map(([id]) => id)]);
    return [...ids].map((id) => ({ id, balance: balances.get(id) ?? 0 }))
      .sort((a, b) => b.balance - a.balance || name(a.id).localeCompare(name(b.id)));
  }, [members, balances, name]);

  const line = (id: string, balance: number) => {
    const who = name(id);
    if (balance === 0) return `${who === 'You' ? 'You are' : `${who} is`} settled up`;
    if (balance > 0) return `${who === 'You' ? 'You are' : `${who} is`} owed ${show(balance)}`;
    return `${who} ${who === 'You' ? 'owe' : 'owes'} ${show(-balance)}`;
  };

  return (
    <section className="card" style={{ marginBottom: 14 }} aria-labelledby="grp-split-h">
      <h2 id="grp-split-h" style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>Split costs</h2>

      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '8px 0 2px' }}>Settle up</h3>
      {payments.length === 0 ? (
        <p className="note" data-testid="grp-settled">Everyone is settled up. Add an expense with “Split” to start keeping track.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="grp-payments">
          {payments.map((p) => {
            const mine = p.from === meId || p.to === meId;
            const text = p.from === meId ? `You pay ${name(p.to)}` : p.to === meId ? `${name(p.from)} pays you` : `${name(p.from)} pays ${name(p.to)}`;
            return (
              <li key={`${p.from}>${p.to}`} className="fx-grp-row" data-testid="grp-payment">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="fx-grp-name" style={{ whiteSpace: 'normal' }}>{text} <b>{show(p.amount)}</b></span>
                </span>
                {p.to === meId && (
                  <a className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }} target="_blank" rel="noopener noreferrer"
                    aria-label={`Remind ${name(p.from)} on WhatsApp`}
                    href={whatsappLink(reminderText({ toName: name(p.from), amount: formatPaise(p.amount, currency), groupName }))}>
                    Remind
                  </a>
                )}
                {mine && <button type="button" className="btn btn-sm" onClick={() => setPaying(p)}>Mark as paid</button>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="note" style={{ margin: '6px 0 0' }}>FinatriX doesn’t move any money. Pay however you like, then mark it as paid so everyone’s balance updates.</p>

      <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 2px' }}>Balances</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="grp-balances">
        {people.map((p) => (
          <li key={p.id} className="fx-grp-row" style={{ padding: '8px 0' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: p.balance < 0 ? 'var(--red)' : undefined }}>{line(p.id, p.balance)}</span>
          </li>
        ))}
      </ul>

      {paying && (
        <MarkPaidSheet payment={paying} currency={currency} from={name(paying.from)} to={name(paying.to)}
          onClose={() => setPaying(null)}
          onSave={async (paise) => { await onMarkPaid(paying, paise); setPaying(null); }} />
      )}
    </section>
  );
}

function MarkPaidSheet({ payment, currency, from, to, onSave, onClose }: {
  payment: Payment;
  currency: string;
  from: string;
  to: string;
  onSave: (paise: number) => Promise<void>;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(payment.amount / 100);
  const [busy, setBusy] = useState(false);
  const paise = toPaise(amount);
  const valid = paise > 0 && paise < 1e14;
  const who = `${from} paid ${to === 'You' ? 'you' : to}`;
  return (
    <ToolSheet title="Mark as paid" description={`${who} ${formatPaise(payment.amount, currency)}? Everyone in the group sees it.`} onClose={onClose}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-sm" disabled={busy || !valid}
            onClick={async () => { setBusy(true); try { await onSave(paise); } finally { setBusy(false); } }}>
            {busy ? 'Saving…' : 'Mark as paid'}
          </button>
        </div>
      )}>
      <label className="fl" htmlFor="grp-paid-amt">Amount paid</label>
      <MoneyField id="grp-paid-amt" className="fi" sym={currencySym(currency) || `${currency} `} value={amount} onCommit={setAmount} min0 />
      <p className="note" style={{ marginTop: 8 }}>Paid less than the full amount? Change it. The rest stays on the balance.</p>
    </ToolSheet>
  );
}
