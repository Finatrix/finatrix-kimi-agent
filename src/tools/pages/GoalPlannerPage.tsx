import { useState } from 'react';
import { useToast } from '../ui/Toast';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon, type IconName } from '../ui/Icon';
import { getJSON, setJSON } from '../lib/storage';
import { computeGoalPlanner, type GoalResult, type GoalPathResult } from '../lib/goals';
import { useCurrency } from '../CurrencyContext';
import { useMarket } from '../MarketContext';
import { MarketNote } from '../ui/MarketNote';
import type { MarketPack } from '../lib/markets';
import { track } from '../../lib/analytics';
import GoalComparison from '../ui/GoalComparison';

type Fields = { name: string; target: string; years: string; existing: string; inflate: boolean };
const BASE_DEFAULTS: Omit<Fields, 'target' | 'years'> = { name: '', existing: '0', inflate: true };
const KEYS = { name: 'gp-name', target: 'gp-target', years: 'gp-years', existing: 'gp-existing', inflate: 'gp-inflate' } as const;

export default function GoalPlannerPage() {
  const { notify } = useToast();
  const { cfmt, sym } = useCurrency();
  const { market } = useMarket();
  const goals = market.goals;
  // The market's headline goal seeds the form — its target and horizon are a
  // plausible ambition here, which ₹50L is not in London.
  const seed = goals.presets[0];
  const [f, setF] = useState<Fields>(() => {
    const s = getJSON<Record<string, string | boolean>>('fx_goals', {});
    return {
      name: (s[KEYS.name] as string) ?? BASE_DEFAULTS.name,
      target: (s[KEYS.target] as string) || String(seed[2]),
      years: (s[KEYS.years] as string) || String(seed[3]),
      existing: (s[KEYS.existing] as string) ?? BASE_DEFAULTS.existing,
      inflate: s[KEYS.inflate] != null ? Boolean(s[KEYS.inflate]) : BASE_DEFAULTS.inflate,
    };
  });
  const [result, setResult] = useState<GoalResult | null>(null);

  const set = (patch: Partial<Fields>) => {
    const next = { ...f, ...patch };
    setF(next);
    setJSON('fx_goals', { [KEYS.name]: next.name, [KEYS.target]: next.target, [KEYS.years]: next.years, [KEYS.existing]: next.existing, [KEYS.inflate]: next.inflate });
  };

  const submit = () => {
    const targetToday = Math.max(0, Number(f.target) || 0);
    if (targetToday < goals.minTarget) {
      notify(`Please enter a target of at least ${cfmt(goals.minTarget)}.`, 'error');
      return;
    }
    if (!Number.isFinite(Number(f.target)) || Number(f.target) > 1e12 || Number(f.existing) < 0 || !Number.isFinite(Number(f.existing)) || Number(f.existing) > 1e12 || !Number.isInteger(Number(f.years)) || Number(f.years) < 1 || Number(f.years) > 40) {
      notify('Use a whole-year deadline from 1 to 40 and non-negative amounts no greater than 1 trillion.', 'error');
      return;
    }
    setResult(computeGoalPlanner({
      name: f.name, targetToday: Number(f.target) || 0, years: Number(f.years) || 0,
      existing: Number(f.existing) || 0, inflate: f.inflate,
    }, goals.inflation, goals.paths));
    // The plan is on screen — this visit reached the tool's actual output.
    track('tool_completed', { tool: 'goals', market: market.id });
  };

  return (
    <div className="fx-page">
      <PageHead chip="Goal planner" chipColor="var(--gold)" chipBg="rgba(176,138,54,.12)" icon="goal" title="What would it take to reach your goal?">
        Estimate a monthly contribution, then compare what changes with a different target or deadline.
      </PageHead>

      {!result ? (
        <div className="card">
          <label className="fl">Quick pick a goal</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginBottom: 18 }}>
            {goals.presets.map((p) => (
              <button
                key={p[0]}
                type="button"
                onClick={() => set({ name: p[0], target: String(p[2]), years: String(p[3]) })}
                style={{ padding: '13px 6px', borderRadius: 13, border: '1.5px solid var(--hair2)', background: 'var(--card)', textAlign: 'center', cursor: 'pointer', transition: 'all .15s', fontFamily: 'inherit' }}
              >
                <span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 26, marginBottom: 4, color: 'var(--ink2)' }}>
                  <Icon name={p[1].replace('ic-', '') as IconName} size={22} />
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--ink2)', fontWeight: 600, display: 'block' }}>{p[0]}</span>
              </button>
            ))}
          </div>
          <div className="fg">
            <label className="fl" htmlFor="gp-name">Goal name</label>
            <input className="fi" type="text" id="gp-name" placeholder="e.g. Dream house, World tour" maxLength={40} value={f.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="gp-target">Target amount in today's money ({sym})</label>
            <input className="fi" type="number" step="any" id="gp-target" value={f.target} min={goals.minTarget} inputMode="decimal" onChange={(e) => set({ target: e.target.value })} />
          </div>
          <div className="grid2">
            <div className="fg">
              <label className="fl" htmlFor="gp-years">Years to reach</label>
              <input className="fi" type="number" step="1" id="gp-years" value={f.years} min={1} max={40} inputMode="numeric" onChange={(e) => set({ years: e.target.value })} />
            </div>
            <div className="fg">
              <label className="fl" htmlFor="gp-existing">Already saved ({sym})</label>
              <input className="fi" type="number" step="any" id="gp-existing" value={f.existing} min={0} inputMode="decimal" onChange={(e) => set({ existing: e.target.value })} />
            </div>
          </div>
          <label className="fx-checkrow" style={{ fontSize: 14, color: 'var(--ink2)', marginBottom: 18 }}>
            <input type="checkbox" className="fx-check" id="gp-inflate" checked={f.inflate} onChange={(e) => set({ inflate: e.target.checked })} />
            Adjust target for {Math.round(goals.inflation * 100)}% inflation (recommended)
          </label>
          <button className="btn" onClick={submit}>Show me the path</button>
        </div>
      ) : (
        <GoalResultView result={result} market={market} money={cfmt} onReset={() => setResult(null)} />
      )}

      <MarketNote market={market} />
      <ToolFoot>Returns are historical averages · Built with care by <b>FinatriX</b> · Not financial advice</ToolFoot>
    </div>
  );
}

function GoalResultView({ result, market, money, onReset }: {
  result: GoalResult; market: MarketPack; money: (n: number) => string; onReset: () => void;
}) {
  const { name, target, targetToday, years, existing, inflate, results } = result;
  return (
    <div>
      <div className="result-hero-anim" style={{ textAlign: 'center', margin: '8px 0 24px' }}>
        <div style={{ fontSize: 38, marginBottom: 6 }}>🎯</div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.015em' }}>{name}</div>
        <div style={{ fontSize: 15, color: 'var(--ink2)', marginTop: 4 }}>
          {money(target)} in {years} years
          {inflate && <span className="pill pill-mute" style={{ marginLeft: 4 }}>inflation-adjusted from {money(targetToday)}</span>}
        </div>
        {existing > 0 && <div className="note" style={{ marginTop: 6, color: 'var(--green)' }}>Head start: {money(existing)} already saved</div>}
      </div>

      {results.map((p) => <PathCard key={p.n} p={p} money={money} monthlyTerm={market.invest.monthlyTerm} />)}

      <GoalComparison baseline={result} market={market} money={money} />
      <div className="card" style={{ background: 'var(--gold-bg)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Before you choose a contribution</div>
        <div className="note">
          The step-up option assumes you increase contributions by 10% every year; your income may not
          grow at that rate. Check the contribution against other goals and essential bills. At the assumed inflation rate, {money(targetToday)} today ≈{' '}
          {money(targetToday * Math.pow(1 + market.goals.inflation, years))} in {years} years at{' '}
          {Math.round(market.goals.inflation * 100)}%. Revisit these assumptions when your circumstances change.
        </div>
      </div>
      <button className="btn" onClick={onReset}>Plan another goal</button>
    </div>
  );
}

function PathCard({ p, money, monthlyTerm }: {
  p: GoalPathResult; money: (n: number) => string; monthlyTerm: string;
}) {
  return (
    <div className="card result-card-anim" style={{ borderLeft: `4px solid ${p.c}` }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: p.c }}>{p.n}</div>
      <div className="note" style={{ margin: '3px 0 14px' }}>{p.d} · ~{Math.round(p.rate * 100)}% CAGR</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '14px 0', borderTop: '1px solid var(--hair2)' }}>
        <div>
          <div className="note">{monthlyTerm} needed</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', color: p.c }}>{money(p.monthly)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="note">Or with 10% yearly step-up</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{money(p.stepStart)} <span className="note" style={{ fontWeight: 400 }}>to start</span></div>
        </div>
      </div>
      <table className="cmp">
        <tbody>
          <tr>
            <td style={{ color: 'var(--ink2)' }}>You invest</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{money(p.invested)}</td>
            <td style={{ color: 'var(--ink2)', paddingLeft: 16 }}>You reach</td><td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green)' }}>{money(p.totalValue)}</td>
          </tr>
          <tr>
            <td style={{ color: 'var(--ink2)' }}>Market gains</td><td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green)' }}>{money(p.gains)}</td>
            <td style={{ color: 'var(--ink2)', paddingLeft: 16 }}>Daily feel</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{money(Math.round(p.monthly / 30))}/day</td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink2)', marginBottom: 4 }}>
          <span>Your money {p.investPct}%</span><span>Market gains {100 - p.investPct}%</span>
        </div>
        <div className="bar"><div className="bar-fill" style={{ width: `${p.investPct}%`, background: p.c }} /></div>
      </div>
      <div className="note" style={{ marginTop: 12 }}><b style={{ color: 'var(--ink)' }}>Suggested instruments:</b> {p.inst}</div>
      {p.milestones.length > 3 && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', color: p.c }}>Journey milestones</summary>
          <div style={{ marginTop: 12, paddingLeft: 14, borderLeft: '2px solid var(--hair2)' }}>
            {p.milestones.map((m) => (
              <div key={m.y} style={{ marginBottom: 11 }}>
                <div style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 600 }}>Year {m.y}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: m.pct >= 100 ? 'var(--green)' : 'var(--ink)' }}>
                  {money(m.val)} <span className="note">({Math.round(m.pct)}% of goal)</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
