import { useMemo, useState } from 'react';
import { csvBlob } from '../../lib/csv';
import { downloadBlob } from '../lib/exporters';
import { findGoalDeadlines } from '../lib/planningAutomation';
import type { GoalResult } from '../lib/goals';
import type { MarketPack } from '../lib/markets';
import { SmartAssist } from './SmartAssist';
import { useCurrency } from '../CurrencyContext';
import { useOptionalToast } from './Toast';

export function GoalSmartAssist({ result, market, money, onUseYears }: {
  result: GoalResult; market: MarketPack; money: (n: number) => string; onUseYears: (years: number) => void;
}) {
  const { code } = useCurrency();
  const { notify } = useOptionalToast();
  const [limit, setLimit] = useState('');
  const validLimit = limit.trim() !== '' && Number.isFinite(Number(limit)) && Number(limit) >= 0 && Number(limit) <= 1e12;
  const matches = useMemo(() => validLimit ? findGoalDeadlines({ ...result }, market.goals.inflation, market.goals.paths, Number(limit)) : [], [result, market, validLimit, limit]);
  const [pathIndex, setPathIndex] = useState(0);
  const path = result.results[pathIndex] ?? result.results[0];
  const schedule = Array.from({ length: result.years }, (_, i) => ({ year: i + 1, monthly: path.stepStart * Math.pow(1.1, i) }));
  const exportPlan = async () => {
    try {
    await downloadBlob('finatrix-goal-plan.csv', csvBlob([
      ['Goal', result.name], ['Currency', code], ['Target today', result.targetToday], ['Target at deadline', result.target],
      ['Years', result.years], ['Already allocated', result.existing], ['Inflation per year', result.inflate ? market.goals.inflation : 0],
      ['Path', 'Assumed annual return', 'Level monthly contribution', 'Starting monthly contribution with 10% annual step-up'],
      ...result.results.map((p) => [p.n, p.rate, p.monthly, p.stepStart]),
      ['Step-up schedule path', path.n], ['Year', 'Monthly contribution', 'Annual contributions'],
      ...schedule.map((row) => [row.year, row.monthly, row.monthly * 12]),
      ['Projections use assumptions, not guaranteed returns. Step-up amounts before currency rounding.'],
    ]));
    } catch {
      notify('The plan could not be exported. Please try again.', 'error');
    }
  };

  return <SmartAssist title="Find a deadline that fits your contribution" description="Enter your own monthly limit after bills, emergency savings and other goals. The search checks every whole year from 1 to 40 with this plan’s existing assumptions.">
    <label className="fl" htmlFor="goal-monthly-limit">Monthly contribution limit</label>
    <input id="goal-monthly-limit" className="fi" type="number" min={0} max={1e12} step="any" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Enter an amount you can sustain" />
    {limit && !validLimit && <p className="note" role="status">Enter a finite amount between 0 and 1 trillion.</p>}
    {validLimit && <div aria-live="polite" style={{ marginTop: 14 }}>
      {matches.map((match) => <div key={match.name} style={{ padding: '12px 0', borderBottom: '1px solid var(--hair2)' }}>
        <b>{match.name}</b>
        <p className="note">{match.years !== null
          ? `Earliest modelled fit: ${match.years} year${match.years === 1 ? '' : 's'} at ${money(match.monthly!)} a month. ${money(Number(limit) - match.monthly!)} remains within your limit.`
          : 'No whole-year deadline within 40 years fits this limit under this path.'}</p>
        {match.years !== null && <button className="btn btn-ghost btn-sm" type="button" disabled={match.years === result.years} onClick={() => onUseYears(match.years!)}>Use {match.years}-year deadline for {match.name.toLowerCase()}</button>}
      </div>)}
      <p className="note">A fit depends on the assumed return. It does not establish affordability or guarantee the target.</p>
    </div>}
    <details style={{ marginTop: 18 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Check the full 10% step-up commitment</summary>
      <p className="note">The starting amount grows by 10% every year. Review later contributions as well as the first year; displayed amounts are rounded only for readability.</p>
      <label className="fl" htmlFor="goal-step-path">Return path for yearly schedule</label>
      <select id="goal-step-path" className="fs" value={pathIndex} onChange={(e) => setPathIndex(Number(e.target.value))}>
        {result.results.map((p, i) => <option value={i} key={p.n}>{p.n}</option>)}
      </select>
      <p className="note">Year 1: <b>{money(path.stepStart)}/month</b> · Year {result.years}: <b>{money(schedule.at(-1)!.monthly)}/month</b>.</p>
      {validLimit && <p className="note">{schedule.some((row) => row.monthly > Number(limit)) ? `This step-up schedule first exceeds your current limit in year ${schedule.find((row) => row.monthly > Number(limit))!.year}.` : 'Every year fits your entered limit under this schedule.'}</p>}
      <div style={{ maxHeight: 240, overflow: 'auto' }} tabIndex={0} role="region" aria-label="Yearly step-up contribution schedule">
        <table className="cmp" style={{ width: '100%' }}><thead><tr><th scope="col">Year</th><th scope="col">Monthly amount</th><th scope="col">Paid that year</th></tr></thead><tbody>
          {schedule.map((row) => <tr key={row.year}><th scope="row">{row.year}</th><td>{money(row.monthly)}</td><td>{money(row.monthly * 12)}</td></tr>)}
        </tbody></table>
      </div>
    </details>
    <button className="btn btn-ghost btn-sm" type="button" onClick={exportPlan} style={{ marginTop: 16 }}>Export plan and yearly schedule</button>
  </SmartAssist>;
}
