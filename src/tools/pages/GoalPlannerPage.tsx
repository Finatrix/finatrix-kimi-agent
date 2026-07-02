import { useState } from 'react';
import { useToast } from '../ui/Toast';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon, type IconName } from '../ui/Icon';
import { fmt } from '../lib/format';
import { getJSON, setJSON } from '../lib/storage';
import { GP_PRESETS, computeGoalPlanner, type GoalResult, type GoalPathResult } from '../lib/goals';

type Fields = { name: string; target: string; years: string; existing: string; inflate: boolean };
const DEFAULTS: Fields = { name: '', target: '5000000', years: '10', existing: '0', inflate: true };
const KEYS = { name: 'gp-name', target: 'gp-target', years: 'gp-years', existing: 'gp-existing', inflate: 'gp-inflate' } as const;

export default function GoalPlannerPage() {
  const { notify } = useToast();
  const [f, setF] = useState<Fields>(() => {
    const s = getJSON<Record<string, string | boolean>>('fx_goals', {});
    return {
      name: (s[KEYS.name] as string) ?? DEFAULTS.name,
      target: (s[KEYS.target] as string) || DEFAULTS.target,
      years: (s[KEYS.years] as string) || DEFAULTS.years,
      existing: (s[KEYS.existing] as string) ?? DEFAULTS.existing,
      inflate: s[KEYS.inflate] != null ? Boolean(s[KEYS.inflate]) : DEFAULTS.inflate,
    };
  });
  const [result, setResult] = useState<GoalResult | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (patch: Partial<Fields>) => {
    const next = { ...f, ...patch };
    setF(next);
    setJSON('fx_goals', { [KEYS.name]: next.name, [KEYS.target]: next.target, [KEYS.years]: next.years, [KEYS.existing]: next.existing, [KEYS.inflate]: next.inflate });
  };

  const submit = () => {
    const targetToday = Math.max(0, Number(f.target) || 0);
    if (targetToday < 1000) {
      notify('Please enter a target of at least ₹1,000.', 'error');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setResult(computeGoalPlanner({
        name: f.name, targetToday: Number(f.target) || 0, years: Number(f.years) || 0,
        existing: Number(f.existing) || 0, inflate: f.inflate,
      }));
    }, 550);
  };

  return (
    <div className="fx-page">
      <PageHead chip="Reverse Goal Planner" chipColor="var(--gold)" chipBg="rgba(176,138,54,.12)" icon="goal" title="Start at the dream. Work backwards.">
        Tell us the goal and the deadline. We'll reverse-engineer the exact monthly SIP — with
        inflation reality-check and step-up options built in.
      </PageHead>

      {!result ? (
        <div className="card">
          <label className="fl">Quick pick a goal</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginBottom: 18 }}>
            {GP_PRESETS.map((p) => (
              <div
                key={p[0]}
                onClick={() => set({ name: p[0], target: String(p[2]), years: String(p[3]) })}
                style={{ padding: '13px 6px', borderRadius: 13, border: '1.5px solid var(--hair2)', background: 'var(--card)', textAlign: 'center', cursor: 'pointer', transition: 'all .15s' }}
              >
                <span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 26, marginBottom: 4, color: 'var(--ink2)' }}>
                  <Icon name={p[1].replace('ic-', '') as IconName} size={22} />
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--ink2)', fontWeight: 600, display: 'block' }}>{p[0]}</span>
              </div>
            ))}
          </div>
          <div className="fg">
            <label className="fl" htmlFor="gp-name">Goal name</label>
            <input className="fi" type="text" id="gp-name" placeholder="e.g. Dream house, World tour" maxLength={40} value={f.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="gp-target">Target amount in today's money (₹)</label>
            <input className="fi" type="number" step="any" id="gp-target" value={f.target} min={1000} inputMode="decimal" onChange={(e) => set({ target: e.target.value })} />
          </div>
          <div className="grid2">
            <div className="fg">
              <label className="fl" htmlFor="gp-years">Years to reach</label>
              <input className="fi" type="number" step="any" id="gp-years" value={f.years} min={1} max={40} inputMode="numeric" onChange={(e) => set({ years: e.target.value })} />
            </div>
            <div className="fg">
              <label className="fl" htmlFor="gp-existing">Already saved (₹)</label>
              <input className="fi" type="number" step="any" id="gp-existing" value={f.existing} min={0} inputMode="decimal" onChange={(e) => set({ existing: e.target.value })} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--ink2)', cursor: 'pointer', marginBottom: 18 }}>
            <input type="checkbox" id="gp-inflate" checked={f.inflate} onChange={(e) => set({ inflate: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--gold)' }} />
            Adjust target for 6% inflation (recommended)
          </label>
          <button className={`btn ${loading ? 'btn-loading' : ''}`} disabled={loading} onClick={submit}>
            {loading ? 'Plotting your path…' : 'Show me the path'}
          </button>
        </div>
      ) : (
        <GoalResultView result={result} onReset={() => setResult(null)} />
      )}

      <ToolFoot>Returns are historical averages · Built with care by <b>FinatriX</b> · Not financial advice</ToolFoot>
    </div>
  );
}

function GoalResultView({ result, onReset }: { result: GoalResult; onReset: () => void }) {
  const { name, target, targetToday, years, existing, inflate, results } = result;
  return (
    <div>
      <div className="result-hero-anim" style={{ textAlign: 'center', margin: '8px 0 24px' }}>
        <div style={{ fontSize: 38, marginBottom: 6 }}>🎯</div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.015em' }}>{name}</div>
        <div style={{ fontSize: 15, color: 'var(--ink2)', marginTop: 4 }}>
          {fmt(target)} in {years} years
          {inflate && <span className="pill pill-mute" style={{ marginLeft: 4 }}>inflation-adjusted from {fmt(targetToday)}</span>}
        </div>
        {existing > 0 && <div className="note" style={{ marginTop: 6, color: 'var(--green)' }}>Head start: {fmt(existing)} already saved</div>}
      </div>

      {results.map((p) => <PathCard key={p.n} p={p} />)}

      <div className="card" style={{ background: 'var(--gold-bg)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Pro tips</div>
        <div className="note">
          Unsure which path? Start moderate — you can raise risk later. The 10% step-up option matches your SIP to salary growth and cuts the starting amount dramatically. Inflation adjustment matters: {fmt(targetToday)} today ≈ {fmt(targetToday * Math.pow(1.06, years))} in {years} years at 6%. Review the plan once a year and rebalance.
        </div>
      </div>
      <button className="btn" onClick={onReset}>Plan another goal</button>
    </div>
  );
}

function PathCard({ p }: { p: GoalPathResult }) {
  return (
    <div className="card result-card-anim" style={{ borderLeft: `4px solid ${p.c}` }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: p.c }}>{p.n}</div>
      <div className="note" style={{ margin: '3px 0 14px' }}>{p.d} · ~{Math.round(p.rate * 100)}% CAGR</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '14px 0', borderTop: '1px solid var(--hair2)' }}>
        <div>
          <div className="note">Monthly SIP needed</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', color: p.c }}>{fmt(p.monthly)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="note">Or with 10% yearly step-up</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(p.stepStart)} <span className="note" style={{ fontWeight: 400 }}>to start</span></div>
        </div>
      </div>
      <table className="cmp">
        <tbody>
          <tr>
            <td style={{ color: 'var(--ink2)' }}>You invest</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(p.invested)}</td>
            <td style={{ color: 'var(--ink2)', paddingLeft: 16 }}>You reach</td><td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green)' }}>{fmt(p.totalValue)}</td>
          </tr>
          <tr>
            <td style={{ color: 'var(--ink2)' }}>Market gains</td><td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green)' }}>{fmt(p.gains)}</td>
            <td style={{ color: 'var(--ink2)', paddingLeft: 16 }}>Daily feel</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(Math.round(p.monthly / 30))}/day</td>
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
                  {fmt(m.val)} <span className="note">({Math.round(m.pct)}% of goal)</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
