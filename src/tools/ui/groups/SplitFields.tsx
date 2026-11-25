import { useId } from 'react';
import { MoneyField } from '../MoneyField';
import { checkSplit, type SplitRule } from '../../lib/groupSplit';
import { splitDraftOf, type SplitPerson, type SplitState } from '../../lib/groupSplitForm';
import './groups.css';

const RULES: ReadonlyArray<{ id: SplitRule; label: string }> = [
  { id: 'equal', label: 'Equally' },
  { id: 'shares', label: 'By shares' },
  { id: 'exact', label: 'Exact amounts' },
];

/**
 * "Paid by" and "Split" for an expense in a Split costs group. Equally is the
 * default, you are the payer, and shares or exact amounts are one tap away.
 * What each person pays is previewed from the same maths that settles up
 * (`checkSplit`), so the form and the balances can't disagree.
 */
export function SplitFields({ people, meId, state, onChange, amountPaise, money, sym, error }: {
  people: readonly SplitPerson[];
  meId: string;
  state: SplitState;
  onChange: (next: SplitState) => void;
  /** The typed amount in paise, or null when it isn't a usable amount yet. */
  amountPaise: number | null;
  money: (paise: number) => string;
  sym: string;
  error?: string | null;
}) {
  const uid = useId();
  const nameOf = (p: SplitPerson) => (p.id === meId ? 'You' : p.name);
  const check = amountPaise ? checkSplit(splitDraftOf(state), amountPaise, money) : null;
  const preview = check?.ok ? check.preview : null;
  const status = check && !check.ok ? check.reason : null;
  const set = (patch: Partial<SplitState>) => onChange({ ...state, ...patch });
  const toggle = (id: string, on: boolean) => {
    const included = on ? [...state.included, id] : state.included.filter((x) => x !== id);
    set({ included });
  };

  return (
    <div data-testid="split-fields">
      <div className="fg" style={{ marginBottom: 10 }}>
        <label className="fl" htmlFor={`${uid}-paid`}>Paid by</label>
        <select className="fs" id={`${uid}-paid`} value={state.paidBy} onChange={(e) => set({ paidBy: e.target.value })}>
          {people.map((p) => <option key={p.id} value={p.id}>{nameOf(p)}</option>)}
        </select>
      </div>

      <fieldset className="fx-grp-choices" style={{ marginBottom: 10 }}>
        <legend className="fl">Split</legend>
        {RULES.map((r) => (
          <label key={r.id} className="fx-grp-choice">
            <input type="radio" name={`${uid}-rule`} checked={state.rule === r.id} onChange={() => set({ rule: r.id })} />
            <b>{r.label}</b>
          </label>
        ))}
      </fieldset>

      <ul style={{ listStyle: 'none', margin: '0 0 6px', padding: 0 }} aria-label="Who is in this split">
        {people.map((p) => {
          const on = state.included.includes(p.id);
          const mine = preview?.get(p.id);
          return (
            <li key={p.id} className="fx-grp-row" style={{ padding: '8px 0', minHeight: 44 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, minHeight: 44, cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={(e) => toggle(p.id, e.target.checked)} style={{ width: 20, height: 20 }} />
                <span className="fx-grp-name">{nameOf(p)}</span>
              </label>
              {on && state.rule === 'shares' && (
                <input className="fi" style={{ width: 72, textAlign: 'right' }} type="text" inputMode="decimal" aria-label={`${nameOf(p)}’s share`}
                  placeholder="1" value={state.weights[p.id] ?? ''}
                  onChange={(e) => set({ weights: { ...state.weights, [p.id]: e.target.value } })} />
              )}
              {on && state.rule === 'exact' && (
                <span style={{ width: 120 }}>
                  <MoneyField id={`${uid}-x-${p.id}`} className="fi" sym={sym} ariaLabel={`${nameOf(p)}’s part`} min0
                    value={state.exact[p.id] ?? 0}
                    onCommit={(v) => set({ exact: { ...state.exact, [p.id]: v } })} />
                </span>
              )}
              {on && state.rule !== 'exact' && mine !== undefined && (
                <span className="fx-grp-sub" style={{ minWidth: 72, textAlign: 'right' }}>{money(mine)}</span>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="fx-grp-err" role="alert" style={{ marginTop: 4 }}>{error}</p>}
      {!error && status && <p className="note" role="status" style={{ marginTop: 4 }}>{status}</p>}
      {!error && !status && preview && state.rule === 'exact' && amountPaise && (
        <p className="note" role="status" style={{ marginTop: 4 }}>Adds up to {money(amountPaise)}.</p>
      )}
    </div>
  );
}
