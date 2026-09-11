import { useState } from 'react';
import {
  BASELINE_RATES, FX_AS_OF, convert, effectiveRates, hasRate, isStale,
  loadRateOverrides, saveRateOverride,
} from '../lib/fx';


/**
 * What rate was used, when it was captured, and how to correct it.
 *
 * Shown whenever a total combines more than one currency. Converting money is
 * the point at which this product starts making a claim the user cannot check
 * by looking at their own screen — so the claim comes with its date attached,
 * goes visibly stale on its own schedule, and can be overruled by anyone who
 * knows better. A converted figure presented as fact, with no rate and no date,
 * would be the least trustworthy number in the app.
 */
export function FxNote({ displayCode, currencies }: { displayCode: string; currencies: string[] }) {
  const [, bump] = useState(0);
  const [editing, setEditing] = useState(false);
  const overrides = loadRateOverrides();
  const rates = effectiveRates(overrides);
  const foreign = currencies.filter((c) => c !== displayCode);
  if (!foreign.length) return null;

  const stale = isStale();
  const missing = foreign.filter((c) => !hasRate(c, rates)).concat(hasRate(displayCode, rates) ? [] : [displayCode]);
  const asOf = new Date(`${FX_AS_OF}T00:00:00Z`).toLocaleDateString('en', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  return (
    <aside
      className="card"
      aria-label="How currencies were converted"
      style={{ borderColor: stale ? 'color-mix(in srgb, var(--gold) 45%, transparent)' : undefined }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
        Converted to {displayCode}
      </div>

      <p className="note" style={{ marginBottom: missing.length || editing ? 10 : 0 }}>
        {stale ? (
          <>
            <b style={{ color: 'var(--gold)' }}>These rates are out of date.</b> They were captured on{' '}
            {asOf} and have not been refreshed since, so every converted figure below is indicative
            only. Correct any rate yourself and it will be used instead.
          </>
        ) : (
          <>
            Mid-market rates as of {asOf}. The rate your bank or card actually gives you is worse,
            typically by 0.5–3%.
          </>
        )}
      </p>

      {missing.length > 0 && (
        <p className="tip tip-warn" style={{ marginBottom: 10 }}>
          No rate for {missing.join(', ')}. Balances in{' '}
          {missing.length === 1 ? 'it' : 'those'} are counted at face value rather than converted —
          add a rate below to fix the total.
        </p>
      )}

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ width: 'auto' }}
        aria-expanded={editing}
        onClick={() => setEditing((v) => !v)}
      >
        {editing ? 'Done' : 'Set my own rates'}
      </button>

      {editing && (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          {foreign.map((c) => {
            const id = `fx-rate-${c}`;
            const one = convert(1, c, displayCode, rates);
            return (
              <div key={c} className="fg" style={{ marginBottom: 0 }}>
                <label className="fl" htmlFor={id}>
                  {`1 ${c} in ${displayCode}`}
                </label>
                <input
                  id={id}
                  className="fi fi-sm"
                  type="text"
                  inputMode="decimal"
                  defaultValue={one ? String(Number(one.toFixed(6))) : ''}
                  aria-describedby={`${id}-help`}
                  onBlur={(e) => {
                    const typed = Number(e.target.value);
                    if (!Number.isFinite(typed) || typed <= 0) {
                      saveRateOverride(c, null);
                    } else {
                      // The table stores units per USD; the user types the rate
                      // they care about, which is this currency against what
                      // they are reading. Convert once, here, rather than
                      // asking anyone to think in dollars.
                      const displayPerUsd = rates[displayCode] ?? BASELINE_RATES[displayCode] ?? 1;
                      saveRateOverride(c, displayPerUsd / typed);
                    }
                    bump((n) => n + 1);
                  }}
                />
                <p id={`${id}-help`} className="note" style={{ marginTop: 4 }}>
                  {overrides[c] != null
                    ? 'Your own rate. Clear the field to go back to the shipped one.'
                    : `Shipped rate, ${asOf}.`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
