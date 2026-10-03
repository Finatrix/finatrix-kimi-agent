import { useMemo, useState } from 'react';
import { calcScore, calcWealth, type Decision, type LifeProfile } from '../lib/lifemap';
import { firstLifeMapAge } from '../lib/planningAutomation';
import { SmartAssist } from './SmartAssist';
import { AmountInput } from './AmountInput';
import { plainAmount } from '../lib/formula';
import { useCurrency } from '../CurrencyContext';

export function LifeMapSmartAssist({ profile, decisions, applied, age, money, onToggle, onReset, onAge }: {
  profile: LifeProfile; decisions: Decision[]; applied: Set<string>; age: number; money: (n: number) => string;
  onToggle: (id: string) => void; onReset: () => void; onAge: (age: number) => void;
}) {
  const { sym } = useCurrency();
  const [target, setTarget] = useState('');
  const [pinned, setPinned] = useState<{ values: number[]; score: number; count: number } | null>(null);
  // The field accepts arithmetic; every check reads the plain number it means.
  const targetPlain = plainAmount(target);
  const targetValue = Number(targetPlain);
  const validTarget = targetPlain !== '' && Number.isFinite(targetValue) && targetValue > 0 && targetValue <= 1e12;
  const firstAge = useMemo(() => validTarget ? firstLifeMapAge(profile, decisions, applied, targetValue) : null, [profile, decisions, applied, targetValue, validTarget]);
  const current = calcWealth(profile, decisions, applied, age, true);
  const options = useMemo(() => {
    const base = calcWealth(profile, decisions, applied, age, true);
    return decisions.filter((d) => !applied.has(d.id) && d.minAge <= age).map((decision) => ({
      decision, change: calcWealth(profile, decisions, new Set(applied).add(decision.id), age, true) - base,
    })).filter((item) => item.change > 0).sort((a, b) => b.change - a.change).slice(0, 3);
  }, [profile, decisions, applied, age]);
  return <SmartAssist title="Explore your next scenario" collapsible={{ showLabel: 'Show scenario checks', hideLabel: 'Hide scenario checks' }} description="These checks reuse LifeMap’s illustrative model. A modelled impact is an assumption to explore, not a prediction or a recommendation.">
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setPinned({ values: Array.from({ length: 61 }, (_, at) => calcWealth(profile, decisions, applied, at, true)), score: calcScore(profile, applied), count: applied.size })}>{pinned ? 'Replace pinned scenario' : 'Pin this scenario for comparison'}</button>
      <button className="btn btn-ghost btn-sm" type="button" disabled={!applied.size} onClick={onReset}>Clear active decisions</button>
    </div>
    {pinned && <p className="note" role="status">At age {age}, your current path is {money(Math.abs(current - pinned.values[age]))} {current >= pinned.values[age] ? 'above' : 'below'} the pinned scenario ({pinned.count} decisions). Pinned model score: {pinned.score}; current: {calcScore(profile, applied)}. Move the age slider to compare another year.</p>}
    <div style={{ marginTop: 16 }}>
      <label className="fl" htmlFor="lm-target-check">Find the first modelled age for a wealth target</label>
      <AmountInput id="lm-target-check" sym={sym} placeholder="Enter a target amount" value={target} onChange={setTarget}
        errorId={target && !validTarget ? 'lm-target-check-error' : undefined} />
      {target && !validTarget && <p id="lm-target-check-error" className="note" role="status">Enter a positive target no greater than 1 trillion.</p>}
      {validTarget && <div aria-live="polite"><p className="note">{firstAge === null ? 'This target is not reached by age 60 under the current model.' : `First reaches ${money(targetValue)} at age ${firstAge} under the current disciplined-path assumptions. Figures are nominal; inflation is not applied.`}</p>{firstAge !== null && <button className="btn btn-ghost btn-sm" type="button" onClick={() => onAge(firstAge)}>Jump to age {firstAge}</button>}</div>}
    </div>
    <details style={{ marginTop: 16 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Largest untried modelled changes at age {age}</summary>
      {options.length ? options.map(({ decision, change }) => <div key={decision.id} style={{ borderBottom: '1px solid var(--hair2)', padding: '12px 0' }}>
        <p className="note"><b style={{ color: 'var(--ink)' }}>{decision.t}</b><br />Modelled change: +{money(change)} at age {age}, with other selected decisions held constant.</p>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => onToggle(decision.id)}>Explore {decision.custom ? 'an amount for this decision' : 'this decision'}</button>
      </div>) : <p className="note">No additional positive effect is modelled at this age. Move forward in time or clear decisions to explore alternatives.</p>}
    </details>
  </SmartAssist>;
}
