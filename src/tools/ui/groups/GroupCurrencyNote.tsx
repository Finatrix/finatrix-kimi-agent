import { approxInHome } from '../../lib/groupCurrency';
import { fmtExact } from '../../lib/trips';

/**
 * Under the balances of a group in another currency (step 3.9). Balances and
 * settle-up stay in the group's one currency; this only says what your
 * balance is roughly worth in yours, at the rate your share's copy uses, and
 * says so plainly when there is no rate rather than guessing.
 */
export function GroupCurrencyNote({ groupCurrency, home, myBalancePaise }: {
  groupCurrency: string;
  home: string;
  myBalancePaise: number;
}) {
  if (groupCurrency.toUpperCase() === home.toUpperCase()) return null;
  const approx = approxInHome(Math.abs(myBalancePaise) / 100, groupCurrency, home);
  if (approx === null) {
    return (
      <p className="note" style={{ margin: '8px 0 0' }} data-testid="grp-currency-note">
        No {groupCurrency} rate yet, so your share isn’t in your {home} tracker. It’s added once a rate is available.
      </p>
    );
  }
  return (
    <p className="note" style={{ margin: '8px 0 0' }} data-testid="grp-currency-note">
      Balances are in {groupCurrency}.{myBalancePaise !== 0 && <> Yours is about {fmtExact(approx, home)}.</>} Your share of each expense goes into your tracker in {home}.
    </p>
  );
}
