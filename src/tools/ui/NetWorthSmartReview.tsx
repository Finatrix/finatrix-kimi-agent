import { useMemo, useState } from 'react';
import { type NetWorthAccount, type NetWorthOptions, setBalance } from '../lib/netWorth';
import { monthLabel, prevMonth } from '../lib/month';
import { cfmt as currencyFormat } from '../lib/format';
import { confirmUnchangedBalance, reviewNetWorth } from '../lib/netWorthSmartReview';

export function NetWorthSmartReview({ accounts, month, options, cfmt, onCommit }: {
  accounts: NetWorthAccount[]; month: string; options: NetWorthOptions;
  cfmt: (amount: number) => string; onCommit: (accounts: NetWorthAccount[]) => void;
}) {
  const review = useMemo(() => reviewNetWorth(accounts, month, options), [accounts, month, options]);
  const [undo, setUndo] = useState<{ id: string; balance: number } | null>(null);
  const [notice, setNotice] = useState('');
  const next = review.reviewQueue[0];
  const focus = (id: string) => document.getElementById(`nw-bal-${id}`)?.focus();
  return <section className="card" aria-label="Smart balance review" style={{ marginBottom: 14 }}>
    <h2 style={{ fontSize: 17, margin: '0 0 6px' }}>Smart balance review</h2>
    <p className="note">{review.confirmed} of {review.recorded} balances recorded for {monthLabel(month)}. Older balances are reviewed first; their age does not tell us whether they changed.</p>
    {next ? <>
      <p style={{ fontSize: 13 }}>{`Next to check: ${next.account.name} · ${currencyFormat(next.native, next.currency)} last recorded in ${monthLabel(next.recorded)}.`}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn btn-sm" onClick={() => focus(next.account.id)}>Update next balance</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
          onCommit(confirmUnchangedBalance(accounts, next.account.id, month));
          setUndo({ id: next.account.id, balance: next.native });
          setNotice(`${next.account.name} confirmed unchanged for ${monthLabel(month)}.`);
        }}>I checked — this balance is unchanged</button>
      </div>
      <p className="note">Confirm only after checking your account or statement. Confirmation records that exact native-currency balance for this month.</p>
    </> : <p style={{ fontSize: 13 }}>Every balance contributing to this month has a record for this month.</p>}
    {undo && <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
      const account = accounts.find((item) => item.id === undo.id);
      if (account?.balances[month] === undo.balance) {
        onCommit(setBalance(accounts, undo.id, month, null));
        setNotice('Confirmation undone. The previous balance carries forward again.');
      } else setNotice('A later balance edit was kept; the confirmation can no longer be undone.');
      setUndo(null);
    }}>Undo last confirmation</button>}
    <div role="status" className="note">{notice}</div>
    {review.duplicates.length > 0 && <details style={{ marginTop: 12 }}>
      <summary>Review {review.duplicates.length} possible duplicate {review.duplicates.length === 1 ? 'account' : 'accounts'}</summary>
      <p className="note">Same name, type, currency and balance can indicate a duplicate. Separate accounts can also match; nothing is removed automatically.</p>
      {review.duplicates.map((item) => <p key={item.id} style={{ fontSize: 13 }}>{`${item.name}: another account has matching details.`}{' '}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => focus(item.id)}>Review matching account</button>
      </p>)}
    </details>}
    {review.hasPrior && <details style={{ marginTop: 12 }}>
      <summary>Explain the change since {monthLabel(prevMonth(month))}</summary>
      <p className="note">Balance movements contribute {cfmt(review.netChange)} to net worth. A liability falling raises net worth. New records are identified below. This is not investment performance; both months use the same display exchange rates.</p>
      {review.movements.length ? <ul style={{ paddingLeft: 20, fontSize: 13 }}>
        {review.movements.map((row) => <li key={row.id} style={{ marginBottom: 8 }}>{`${row.name}: ${row.change >= 0 ? '+' : '−'}${cfmt(Math.abs(row.change))}${row.firstRecord ? ' · first recorded balance' : ''}`}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => focus(row.id)}>Review movement</button>
        </li>)}
      </ul> : <p className="note">There are no recorded balance movements between these months.</p>}
    </details>}
  </section>;
}
