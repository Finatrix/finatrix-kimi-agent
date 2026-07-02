import { useState } from 'react';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { fmt } from '../lib/format';
import { getJSON, setJSON } from '../lib/storage';
import { PC_CITIES, computePeerCompare, type PeerResult, type Metric } from '../lib/peercompare';

const CITY_ENTRIES = Object.entries(PC_CITIES);
const STATUS_META = {
  ahead: { arrow: '↑', color: 'var(--green)', hex: '#1d7d46', label: 'Ahead' },
  ontrack: { arrow: '→', color: 'var(--gold)', hex: '#b08a36', label: 'On track' },
  behind: { arrow: '↓', color: 'var(--red)', hex: '#FF5A52', label: 'Behind' },
} as const;

type Fields = { age: string; city: string; income: string; savings: string; invest: string; debt: string; rate: string; expenses: string };
const DEFAULTS: Fields = { age: '25', city: 'mumbai', income: '50000', savings: '200000', invest: '100000', debt: '0', rate: '20', expenses: '30000' };
const KEY_MAP: Record<keyof Fields, string> = {
  age: 'pc-age', city: 'pc-city', income: 'pc-income', savings: 'pc-savings', invest: 'pc-invest', debt: 'pc-debt', rate: 'pc-rate', expenses: 'pc-expenses',
};

function num(v: string): number {
  const n = Number(v);
  return isFinite(n) ? Math.max(0, n) : 0;
}

export default function PeerComparePage() {
  const [f, setF] = useState<Fields>(() => {
    const saved = getJSON<Record<string, string>>('fx_peercompare', {});
    const init = { ...DEFAULTS };
    (Object.keys(KEY_MAP) as (keyof Fields)[]).forEach((k) => {
      const v = saved[KEY_MAP[k]];
      if (v != null && v !== '') init[k] = v;
    });
    return init;
  });
  const [result, setResult] = useState<PeerResult | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof Fields, v: string) => {
    const next = { ...f, [k]: v };
    setF(next);
    const snapshot: Record<string, string> = {};
    (Object.keys(KEY_MAP) as (keyof Fields)[]).forEach((kk) => { snapshot[KEY_MAP[kk]] = next[kk]; });
    setJSON('fx_peercompare', snapshot);
  };

  const submit = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setResult(
        computePeerCompare({
          age: num(f.age), cityKey: f.city, income: num(f.income), savings: num(f.savings),
          invest: num(f.invest), debt: num(f.debt), rate: num(f.rate), expenses: num(f.expenses),
        })
      );
    }, 600);
  };

  return (
    <div className="fx-page">
      <PageHead chip="PeerCompare" chipColor="var(--purple)" chipBg="rgba(110,59,212,.09)" icon="peer" title="How do you really stack up?">
        City-calibrated benchmarks for 14 Indian cities — including Chennai, Hyderabad and Kolkata —
        adjusted for local incomes and living costs.
      </PageHead>

      {!result ? (
        <div className="card">
          <div className="grid2">
            <Field label="Your age" id="pc-age"><input className="fi" type="number" step="any" id="pc-age" value={f.age} min={18} max={70} inputMode="numeric" onChange={(e) => set('age', e.target.value)} /></Field>
            <Field label="Your city" id="pc-city">
              <select className="fs" id="pc-city" value={f.city} onChange={(e) => set('city', e.target.value)}>
                {CITY_ENTRIES.map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Monthly income (₹)" id="pc-income"><input className="fi" type="number" step="any" id="pc-income" value={f.income} min={0} inputMode="decimal" onChange={(e) => set('income', e.target.value)} /></Field>
          <div className="grid2">
            <Field label="Total savings (₹)" id="pc-savings"><input className="fi" type="number" step="any" id="pc-savings" value={f.savings} min={0} inputMode="decimal" onChange={(e) => set('savings', e.target.value)} /></Field>
            <Field label="Total investments (₹)" id="pc-invest"><input className="fi" type="number" step="any" id="pc-invest" value={f.invest} min={0} inputMode="decimal" onChange={(e) => set('invest', e.target.value)} /></Field>
          </div>
          <div className="grid2">
            <Field label="Total debt (₹)" id="pc-debt"><input className="fi" type="number" step="any" id="pc-debt" value={f.debt} min={0} inputMode="decimal" onChange={(e) => set('debt', e.target.value)} /></Field>
            <Field label="Monthly savings rate (%)" id="pc-rate"><input className="fi" type="number" step="any" id="pc-rate" value={f.rate} min={0} max={100} inputMode="decimal" onChange={(e) => set('rate', e.target.value)} /></Field>
          </div>
          <Field label="Monthly expenses (₹)" id="pc-expenses"><input className="fi" type="number" step="any" id="pc-expenses" value={f.expenses} min={0} inputMode="decimal" onChange={(e) => set('expenses', e.target.value)} /></Field>
          <button className={`btn ${loading ? 'btn-loading' : ''}`} disabled={loading} onClick={submit}>
            {loading ? 'Analysing your data…' : 'See how I stack up'}
          </button>
        </div>
      ) : (
        <PeerResultView result={result} onReset={() => setResult(null)} />
      )}

      <ToolFoot>Benchmarks modelled on RBI, PLFS &amp; survey data · Built with care by <b>FinatriX</b></ToolFoot>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="fg">
      <label className="fl" htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function PeerResultView({ result, onReset }: { result: PeerResult; onReset: () => void }) {
  const { metrics, score, scColor, scHex, msg, bracket, city, eMonths, dti, nw, investedRatio } = result;
  const C = 2 * Math.PI * 56;
  const off = C - (score / 100) * C;

  return (
    <div>
      <div className="card result-hero-anim" style={{ textAlign: 'center', padding: '34px 24px' }}>
        <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto 14px' }}>
          <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="70" cy="70" r="56" fill="none" stroke="var(--hair2)" strokeWidth="9" />
            <circle cx="70" cy="70" r="56" fill="none" stroke={scHex} strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset 1s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, color: scColor }}>{score}</div>
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>percentile</div>
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: scColor }}>{msg}</div>
        <div className="note" style={{ marginTop: 4 }}>Among {bracket}-year-olds in {city.l}</div>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, margin: '20px 4px 12px' }}>Metric by metric</div>
      {metrics.map((m) => <MetricCard key={m.k} m={m} cityLabel={city.l} />)}

      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Additional stats</div>
        <div className="grid2" style={{ textAlign: 'center' }}>
          <StatBox v={eMonths >= 99 ? '∞' : String(eMonths)} l="Emergency months" color={eMonths >= 6 ? 'var(--green)' : eMonths >= 3 ? 'var(--gold)' : 'var(--red)'} />
          <StatBox v={`${dti}%`} l="Debt-to-income" color={dti < 20 ? 'var(--green)' : dti < 40 ? 'var(--gold)' : 'var(--red)'} />
          <StatBox v={fmt(nw)} l="Net worth" color="var(--purple)" />
          <StatBox v={`${investedRatio}%`} l="Invested ratio" color="var(--blue)" />
        </div>
      </div>

      {result.tips.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Personalised tips</div>
          {result.tips.map((t, i) => <div className={`tip tip-${t[0]}`} key={i}><b>{t[1]}</b>{t[2]}</div>)}
        </div>
      )}
      <button className="btn" onClick={onReset}>Compare again</button>
    </div>
  );
}

function MetricCard({ m, cityLabel }: { m: Metric; cityLabel: string }) {
  const meta = STATUS_META[m.status];
  const dy = m.money ? fmt(m.yours) : m.yours + (m.suf || '');
  const da = m.money ? fmt(m.avg) : m.avg + (m.suf || '');
  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {m.i ? m.i : m.ic ? <Icon name={m.ic as never} size={14} style={{ verticalAlign: '-2px' }} /> : null} {m.l}
        </div>
        <div style={{ fontSize: 16, color: meta.color, fontWeight: 700 }}>{meta.arrow}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
        <span>You: <b>{dy}</b></span>
        <span style={{ color: 'var(--ink2)' }}>{cityLabel} avg: {da}</span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${m.pct}%`, background: meta.hex }} />
        <div style={{ position: 'absolute', top: -2, left: '50%', width: 2, height: 12, background: 'var(--ink3)', borderRadius: 2 }} />
      </div>
      <div className="note" style={{ textAlign: 'right', marginTop: 5 }}>{m.pct}th percentile · {meta.label}</div>
    </div>
  );
}

function StatBox({ v, l, color }: { v: string; l: string; color: string }) {
  return (
    <div style={{ padding: 14, background: 'var(--bg)', borderRadius: 14 }}>
      <div style={{ fontSize: 21, fontWeight: 700, color }}>{v}</div>
      <div className="note">{l}</div>
    </div>
  );
}
