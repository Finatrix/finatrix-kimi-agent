import { accountCurrency, balanceAt, computeNetWorth, lastRecordedMonth, type NetWorthAccount, type NetWorthOptions } from './netWorth';
import { prevMonth } from './month';

export function reviewNetWorth(accounts: NetWorthAccount[], month: string, options: NetWorthOptions) {
  const current = computeNetWorth(accounts, month, options);
  const previous = computeNetWorth(accounts, prevMonth(month), options);
  const rows = [...current.assetRows, ...current.liabilityRows];
  const reviewQueue = rows.filter((row) => !row.current)
    .sort((a, b) => a.recorded.localeCompare(b.recorded) || b.balance - a.balance);
  const previousById = new Map([...previous.assetRows, ...previous.liabilityRows].map((row) => [row.account.id, row]));
  const movements = rows.map((row) => {
    const prior = previousById.get(row.account.id);
    return { id: row.account.id, name: row.account.name,
      change: (row.balance - (prior?.balance ?? 0)) * (row.account.kind === 'asset' ? 1 : -1),
      firstRecord: !prior };
  }).filter((row) => row.change !== 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  const seen = new Map<string, string>();
  const duplicates: Array<{ id: string; name: string; other: string }> = [];
  for (const account of accounts) {
    const balance = balanceAt(account, month);
    if (balance === null) continue;
    const key = JSON.stringify([account.name.trim().toLowerCase().replace(/\s+/g, ' '), account.kind,
      accountCurrency(account, options.displayCurrency), balance]);
    const other = seen.get(key);
    if (other) duplicates.push({ id: account.id, name: account.name, other });
    else seen.set(key, account.name);
  }
  return { reviewQueue, movements, duplicates, confirmed: rows.filter((row) => row.current).length,
    recorded: rows.length, netChange: current.net - previous.net,
    hasPrior: accounts.some((account) => lastRecordedMonth(account, prevMonth(month)) !== null) };
}

/** Confirm only the displayed native balance; never stamp a future-only account. */
export function confirmUnchangedBalance(accounts: NetWorthAccount[], id: string, month: string) {
  return accounts.map((account) => {
    if (account.id !== id || Object.prototype.hasOwnProperty.call(account.balances, month)) return account;
    const value = balanceAt(account, month);
    return value === null ? account : { ...account, balances: { ...account.balances, [month]: value } };
  });
}
