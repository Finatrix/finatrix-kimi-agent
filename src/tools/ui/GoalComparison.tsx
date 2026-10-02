import { useState } from 'react';
import { computeGoalPlanner, type GoalResult } from '../lib/goals';
import type { MarketPack } from '../lib/markets';
import './planning.css';
import { Disclosure } from './Disclosure';

export default function GoalComparison({ baseline, market, money }: { baseline: GoalResult; market: MarketPack; money: (n: number) => string }) {
  const [target, setTarget] = useState(String(baseline.targetToday));
  const [years, setYears] = useState(String(Math.min(40, baseline.years + 1)));
  const [saved, setSaved] = useState(String(baseline.existing));
  const [available, setAvailable] = useState('');
  const valid = Number.isFinite(Number(target)) && Number(target) >= market.goals.minTarget && Number(target) <= 1e12
    && Number.isFinite(Number(years)) && Number(years) >= 1 && Number(years) <= 40 && Number.isInteger(Number(years))
    && saved !== '' && Number.isFinite(Number(saved)) && Number(saved) >= 0 && Number(saved) <= 1e12;
  const alternative = valid ? computeGoalPlanner({ name: baseline.name, targetToday: Number(target), years: Number(years), existing: Number(saved), inflate: baseline.inflate }, market.goals.inflation, market.goals.paths) : null;
  const budget = available !== '' && Number.isFinite(Number(available)) && Number(available) >= 0 ? Number(available) : null;
  return <section className="fx-planning fx-planning-surface" aria-labelledby="goal-compare-title">
    <h2 id="goal-compare-title">Compare the trade-offs</h2>
    <p>Try a different target, deadline or starting balance. Both scenarios use the same inflation and return assumptions as your plan. Your saved goal stays as it is.</p>
    {/* A second calculator under the result: one press away rather than
        ~1,000px between the reader and the rest of their answer. */}
    <Disclosure variant="inline" showLabel="Show the scenario comparison" hideLabel="Hide the scenario comparison">
    <div className="fx-plan-fields">
      <label>Alternative target in today’s money<input className="fi" type="number" min={market.goals.minTarget} max={1e12} step="any" value={target} onChange={e => setTarget(e.target.value)} /></label>
      <label>Alternative deadline (whole years)<input className="fi" type="number" min={1} max={40} step={1} value={years} onChange={e => setYears(e.target.value)} /></label>
      <label>Savings allocated to this alternative<input className="fi" type="number" min={0} max={1e12} step="any" value={saved} onChange={e => setSaved(e.target.value)} /></label>
      <label>Available each month after other commitments (optional)<input className="fi" type="number" min={0} max={1e12} step="any" value={available} onChange={e => setAvailable(e.target.value)} placeholder="Your own contribution limit" /></label>
    </div>
    {!valid && <p role="status">Enter a target of at least {money(market.goals.minTarget)}, a whole-year deadline from 1 to 40, and non-negative savings. Amounts must be no more than 1 trillion.</p>}
    {alternative && <>
      <div className="fx-plan-table-wrap" role="region" aria-label="Goal scenario comparison" tabIndex={0}>
        <table className="fx-plan-table"><caption className="sr-only">Monthly contributions for your original goal and alternative, using identical return assumptions.</caption>
          <thead><tr><th scope="col">Scenario</th><th scope="col">Original · {baseline.years} years</th><th scope="col">Alternative · {alternative.years} years</th></tr></thead>
          <tbody>
            <tr><th scope="row">Target at deadline</th><td>{money(baseline.target)}</td><td>{money(alternative.target)}</td></tr>
            <tr><th scope="row">Already allocated</th><td>{money(baseline.existing)}</td><td>{money(alternative.existing)}</td></tr>
            {baseline.results.map((path, i) => <tr key={path.n}><th scope="row">{path.n} · monthly</th><td>{money(path.monthly)}</td><td>{money(alternative.results[i].monthly)}<br /><span className="fx-plan-muted">{money(Math.abs(path.monthly - alternative.results[i].monthly))} {alternative.results[i].monthly <= path.monthly ? 'less' : 'more'} per month</span></td></tr>)}
          </tbody>
        </table>
      </div>
      {budget !== null && <div className="fx-plan-note"><h3>What this leaves for other priorities</h3><p>Your entered limit is {money(budget)} per month. For the alternative:</p><ul>
        {alternative.results.map(path => <li key={path.n} className="fx-plan-muted">{path.n}: {path.monthly <= budget ? `${money(budget - path.monthly)} remains within your limit` : `${money(path.monthly - budget)} above your limit`}.</li>)}
      </ul></div>}
      <p className="fx-plan-muted">A longer deadline may lower the monthly contribution, while inflation can raise the target. Higher assumed returns involve uncertainty. These are projections, not promised outcomes. Allocate the same savings to only one goal, and exclude your emergency reserve.</p>
    </>}
    </Disclosure>
  </section>;
}
