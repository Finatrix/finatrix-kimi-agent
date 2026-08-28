import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { MoneyField } from './MoneyField';
import { useCurrency } from '../CurrencyContext';
import { useOptionalToast } from './Toast';
import { monthLabel, nextMonthUnclamped } from '../lib/month';
import {
  isSignificantDiscrepancy, loadBankStore, reconcileBank, saveBankStore,
  setBankAccountLink, setBankField, type BankStore,
} from '../lib/bankBalance';
import {
  categoriesFor, genAccountId, loadAccounts, NET_WORTH_KEY, saveAccounts, setBalance,
  type NetWorthAccount,
} from '../lib/netWorth';
import { onLocalWrite } from '../lib/storage';
import type { ExpenseItem } from '../lib/expense';

/**
 * Opening and closing bank balances, and what the difference says.
 *
 * The tracker knows what the user told it. This card is the only place it finds
 * out what the *bank* says, and the gap between the two is the number nobody
 * else on the page can produce:
 *
 *     expected closing = opening + income − everything logged
 *     unrecorded       = actual closing − expected closing
 *
 * Two design decisions worth stating:
 *
 *  - **The user types one figure a month, not two.** A month's opening balance
 *    is last month's closing, carried forward automatically. The carried value
 *    is labelled as carried, and can be overridden — which is how somebody
 *    corrects a chain that has drifted rather than fighting it.
 *
 *  - **The Net Worth link only goes one way.** Pressing the button writes this
 *    month's closing balance onto a Net Worth cash account. Nothing reads back.
 *    Two screens writing the same figure to each other is how a value ends up
 *    with no author and neither screen can be trusted.
 */
export interface BankBalanceCardProps {
  month: string;
  items: readonly ExpenseItem[];
  /** Take-home income for the month, from Budget Builder. */
  income: number;
  /** Valid category keys, for consistent legacy-key resolution. */
  validKeys: ReadonlySet<string>;
  /**
   * Drop the card chrome and the heading — the caller is a `PanelCard` that
   * already supplies both, plus the switch that turns this on and off.
   */
  bare?: boolean;
}

export function BankBalanceCard({
  month, items, income, validKeys, bare = false,
}: BankBalanceCardProps) {
  const { cfmt, sym } = useCurrency();
  const { notify } = useOptionalToast();
  const [store, setStore] = useState<BankStore>(loadBankStore);
  const [accounts, setAccounts] = useState<NetWorthAccount[]>(loadAccounts);
  const baseId = useId();

  // Net Worth owns this list and can create the cash account this card links
  // to. Subscribing to its writes — rather than re-reading on every month
  // change — keeps the two screens in step without a cascading render.
  useEffect(() => onLocalWrite((key) => {
    if (key === NET_WORTH_KEY) setAccounts(loadAccounts());
  }), []);

  const write = useCallback((next: BankStore) => {
    setStore(next);
    saveBankStore(next);
  }, []);

  const rec = useMemo(
    () => reconcileBank({ store, month, items, income, validKeys }),
    [store, month, items, income, validKeys],
  );

  const row = store[month] ?? {};
  const openingId = `${baseId}-open`;
  const closingId = `${baseId}-close`;

  /** Cash accounts the closing balance could be mirrored onto. */
  const cashAccounts = accounts.filter((a) => a.kind === 'asset' && a.category === 'cash');
  const linked = cashAccounts.find((a) => a.id === row.accountId) ?? null;

  const pushToNetWorth = () => {
    if (rec.closing === null) return;
    let list = accounts;
    let target = linked;
    if (!target) {
      // No cash account yet: make one rather than sending the user away to
      // create it and come back. It is a normal Net Worth account from the
      // moment it exists — nothing about it is special-cased there.
      target = {
        id: genAccountId(),
        name: 'Bank account',
        kind: 'asset',
        category: categoriesFor('asset')[0]?.k ?? 'cash',
        balances: {},
      };
      list = [...accounts, target];
    }
    const updated = setBalance(list, target.id, month, rec.closing);
    setAccounts(updated);
    saveAccounts(updated);
    write(setBankAccountLink(store, month, target.id));
    notify(`${monthLabel(month)} closing balance saved to “${target.name}” in Net Worth.`, 'ok');
  };

  const significant = isSignificantDiscrepancy(rec.unrecorded, rec.outflow, rec.income);

  return (
    <div className={bare ? undefined : 'card'}>
      <style>{BANK_STYLES}</style>
      {!bare && (
        <div className="fx-bank-hd">
          <div>
            <div className="fx-bank-title">Bank balance</div>
            <p className="note" style={{ marginTop: 2 }}>
              What was in the account at the start and end of {monthLabel(month)}. The closing balance
              becomes {monthLabel(nextMonthUnclamped(month))}’s opening balance automatically.
            </p>
          </div>
          <Icon name="bank" size={18} style={{ color: 'var(--gold)', flexShrink: 0 }} />
        </div>
      )}

      <div className="fx-bank-fields">
        <div className="fg">
          <label className="fl" htmlFor={openingId}>Opening balance ({sym})</label>
          <MoneyField
            id={openingId}
            className="fi"
            sym={sym}
            min0={false}
            value={rec.opening ?? 0}
            ariaLabel={`Opening bank balance for ${monthLabel(month)}`}
            onCommit={(v) => write(setBankField(store, month, 'opening', v || null))}
          />
          <p className="fx-bank-hint">
            {rec.openingSource === 'carried' && rec.carriedFrom
              ? `Carried from ${monthLabel(rec.carriedFrom)}’s closing balance. Type over it to correct the chain.`
              : rec.openingSource === 'recorded'
                ? 'Recorded for this month.'
                : 'Not set yet — enter it once and every later month follows.'}
          </p>
        </div>
        <div className="fg">
          <label className="fl" htmlFor={closingId}>Closing balance ({sym})</label>
          <MoneyField
            id={closingId}
            className="fi"
            sym={sym}
            min0={false}
            value={rec.closing ?? 0}
            ariaLabel={`Closing bank balance for ${monthLabel(month)}`}
            onCommit={(v) => write(setBankField(store, month, 'closing', v || null))}
          />
          <p className="fx-bank-hint">
            {rec.closing === null
              ? 'Enter it at month end to reconcile the ledger against the account.'
              : `Becomes ${monthLabel(nextMonthUnclamped(month))}’s opening balance.`}
          </p>
        </div>
      </div>

      {rec.applicable && (
        <div className="fx-bank-flow" role="group" aria-label="Reconciliation">
          <FlowRow label="Opening balance" value={cfmt(rec.opening ?? 0)} />
          <FlowRow label="Income" value={`+ ${cfmt(rec.income)}`} tone="var(--green)"
            note={rec.income === 0 ? 'No income recorded in Budget Builder' : undefined} />
          <FlowRow label="Logged out of the account" value={`− ${cfmt(rec.outflow)}`} tone="var(--orange)"
            note="Everything in the ledger, savings transfers included" />
          <FlowRow label="Expected closing" value={cfmt(rec.expectedClosing ?? 0)} strong />
          {rec.closing !== null && (
            <>
              <FlowRow label="Actual closing" value={cfmt(rec.closing)} strong />
              <FlowRow
                label={(rec.unrecorded ?? 0) < 0 ? 'Spent but not logged' : 'Received but not logged'}
                value={cfmt(Math.abs(rec.unrecorded ?? 0))}
                tone={significant ? 'var(--red)' : 'var(--ink2)'}
                strong
                note={significant
                  ? 'Big enough to be a real gap — worth finding before the month closes.'
                  : 'Small enough to be rounding, a card hold or a bank fee.'}
              />
            </>
          )}
        </div>
      )}

      {rec.closing !== null && (
        <div className="fx-bank-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={pushToNetWorth}>
            <Icon name="refresh" size={14} />
            {linked ? `Update “${linked.name}” in Net Worth` : 'Save to Net Worth'}
          </button>
          <span className="fx-bank-note">
            {linked
              ? 'Writes this closing balance onto that account for this month. Net Worth never writes back here.'
              : 'Creates a cash account in Net Worth (or updates it) with this closing balance.'}
          </span>
        </div>
      )}
    </div>
  );
}

function FlowRow({ label, value, tone, note, strong }: {
  label: string; value: string; tone?: string; note?: string; strong?: boolean;
}) {
  return (
    <div className={`fx-bank-row${strong ? ' is-strong' : ''}`}>
      <span className="fx-bank-rl">
        {label}
        {note && <span className="fx-bank-rn">{note}</span>}
      </span>
      <span className="fx-bank-rv" style={tone ? { color: tone } : undefined}>{value}</span>
    </div>
  );
}

const BANK_STYLES = `
.fx-tools .fx-bank-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;}
.fx-tools .fx-bank-title{font-size:14px;font-weight:700;letter-spacing:-.01em;}
.fx-tools .fx-bank-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:14px;}
.fx-tools .fx-bank-hint{font-size:11px;color:var(--ink3);line-height:1.5;margin:5px 0 0;}
.fx-tools .fx-bank-flow{border-top:1px solid var(--hair2);padding-top:10px;}
.fx-tools .fx-bank-row{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:7px 0;
  border-bottom:1px solid var(--hair2);}
.fx-tools .fx-bank-row:last-child{border-bottom:none;}
.fx-tools .fx-bank-row.is-strong{border-top:1px solid var(--hair2);margin-top:2px;}
.fx-tools .fx-bank-rl{font-size:12.5px;color:var(--ink2);min-width:0;}
.fx-tools .fx-bank-row.is-strong .fx-bank-rl{font-weight:700;color:var(--ink);}
.fx-tools .fx-bank-rn{display:block;font-size:11px;color:var(--ink3);font-weight:400;line-height:1.45;margin-top:2px;max-width:42ch;}
.fx-tools .fx-bank-rv{font-size:13px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;
  flex-shrink:0;white-space:nowrap;}
.fx-tools .fx-bank-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;
  padding-top:12px;border-top:1px solid var(--hair2);}
.fx-tools .fx-bank-actions .btn{width:auto;gap:6px;}
.fx-tools .fx-bank-note{font-size:11px;color:var(--ink3);line-height:1.5;flex:1;min-width:180px;}
`;

export default BankBalanceCard;
