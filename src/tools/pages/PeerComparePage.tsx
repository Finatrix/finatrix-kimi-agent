import { useState } from 'react';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { fmt } from '../lib/format';
import { getJSON, setJSON } from '../lib/storage';
import { PC_CITIES, computePeerCompare, type PeerResult, type Metric } from '../lib/peercompare';
import { CITED_SOURCES, PLFS_REGULAR_WAGE_MONTHLY } from '../lib/benchmarks';
import { track } from '../../lib/analytics';

const CITY_ENTRIES = Object.entries(PC_CITIES);
const STATUS_META = {
  ahead: { arrow: '↑', color: 'var(--green)', hex: '#1d7d46', label: 'Ahead' },
  ontrack: { arrow: '→', color: 'var(--gold)', hex: '#b08a36', label: 'On track' },
  behind: { arrow: '↓', color: 'var(--red)', hex: '#FF5A52', label: 'Behind' },
} as const;

/**
 * How a benchmark is labelled on its card.
 *
 * The whole point of the rebuild: a reader can tell at a glance whether the
 * number they are being measured against was published by somebody, worked out
 * from their own inputs, or is a planning convention. The tool previously made
 * all three look identical, and called every one of them a peer average.
 */
const PROVENANCE_META = {
  measured: { label: 'Published figure', color: 'var(--green)' },
  derived: { label: 'Derived from your inputs', color: 'var(--blue)' },
  guideline: { label: 'Planning guideline', color: 'var(--gold)' },
} as const;

type Fields = {
  age: string; city: string; income: string; savings: string; invest: string;
  debt: string; emi: string; rate: string; expenses: string;
};
const DEFAULTS: Fields = {
  age: '25', city: 'mumbai', income: '50000', savings: '200000', invest: '100000',
  debt: '0', emi: '0', rate: '20', expenses: '30000',
};
const KEY_MAP: Record<keyof Fields, string> = {
  age: 'pc-age', city: 'pc-city', income: 'pc-income', savings: 'pc-savings', invest: 'pc-invest',
  debt: 'pc-debt', emi: 'pc-emi', rate: 'pc-rate', expenses: 'pc-expenses',
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
          invest: num(f.invest), debt: num(f.debt), emi: num(f.emi), rate: num(f.rate),
          expenses: num(f.expenses),
        })
      );
      track('tool_completed', { tool: 'peercompare' });
    }, 600);
  };

  return (
    <div className="fx-page">
      <PageHead chip="PeerCompare" chipColor="var(--purple)" chipBg="rgba(110,59,212,.09)" icon="peer" title="How does your money compare?">
        Measured against published national benchmarks from the PLFS and the RBI, and against
        standard planning guidelines — with the source of every number shown beside it.
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
            <Field label="Total outstanding debt (₹)" id="pc-debt" hint="Balance still owed, across all loans. Used for your net worth.">
              <input className="fi" type="number" step="any" id="pc-debt" value={f.debt} min={0} inputMode="decimal" aria-describedby="pc-debt-hint" onChange={(e) => set('debt', e.target.value)} />
            </Field>
            {/* The input that makes the debt metric mean what its label says. */}
            <Field label="Monthly loan payments (₹)" id="pc-emi" hint="Total EMIs each month. This is what the debt-service ratio measures.">
              <input className="fi" type="number" step="any" id="pc-emi" value={f.emi} min={0} inputMode="decimal" aria-describedby="pc-emi-hint" onChange={(e) => set('emi', e.target.value)} />
            </Field>
          </div>
          <div className="grid2">
            <Field label="Monthly savings rate (%)" id="pc-rate"><input className="fi" type="number" step="any" id="pc-rate" value={f.rate} min={0} max={100} inputMode="decimal" onChange={(e) => set('rate', e.target.value)} /></Field>
            <Field label="Monthly expenses (₹)" id="pc-expenses"><input className="fi" type="number" step="any" id="pc-expenses" value={f.expenses} min={0} inputMode="decimal" onChange={(e) => set('expenses', e.target.value)} /></Field>
          </div>
          <button className={`btn ${loading ? 'btn-loading' : ''}`} disabled={loading} onClick={submit}>
            {loading ? 'Comparing…' : 'Compare my numbers'}
          </button>
        </div>
      ) : (
        <PeerResultView result={result} onReset={() => setResult(null)} />
      )}

      <ToolFoot>Benchmarks published by MoSPI and the RBI · Built with care by <b>FinatriX</b></ToolFoot>
    </div>
  );
}

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="fg">
      <label className="fl" htmlFor={id}>{label}</label>
      {children}
      {hint && <div className="note" id={`${id}-hint`}>{hint}</div>}
    </div>
  );
}

function PeerResultView({ result, onReset }: { result: PeerResult; onReset: () => void }) {
  const { metrics, score, scColor, scHex, msg, city, eMonths, debtServiceRatio, nw, investedRatio } = result;
  const C = 2 * Math.PI * 56;
  const off = C - (score / 100) * C;

  return (
    <div>
      <div className="card result-hero-anim" style={{ textAlign: 'center', padding: '34px 24px' }}>
        <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto 14px' }}>
          <svg aria-hidden="true" width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="70" cy="70" r="56" fill="none" stroke="var(--hair2)" strokeWidth="9" />
            <circle cx="70" cy="70" r="56" fill="none" stroke={scHex} strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset 1s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, color: scColor }}>{score}</div>
            {/* Was "percentile". It never was one — see `comparisonIndex`. */}
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>out of 100</div>
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: scColor }}>{msg}</div>
        <div className="note" style={{ marginTop: 4 }}>
          A comparison index across the five measures below, not a percentile — no ranking against
          other users is implied.
        </div>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, margin: '20px 4px 12px' }}>Measure by measure</div>
      {metrics.map((m) => <MetricCard key={m.k} m={m} />)}

      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Your own numbers</div>
        <div className="grid2" style={{ textAlign: 'center' }}>
          <StatBox v={eMonths === Infinity ? '∞' : String(eMonths)} l="Emergency months" color={eMonths >= 6 ? 'var(--green)' : eMonths >= 3 ? 'var(--gold)' : 'var(--red)'} />
          <StatBox v={`${debtServiceRatio}%`} l="EMIs ÷ income" color={debtServiceRatio < 36 ? 'var(--green)' : debtServiceRatio < 43 ? 'var(--gold)' : 'var(--red)'} />
          <StatBox v={fmt(nw)} l="Net worth" color="var(--purple)" />
          <StatBox v={`${investedRatio}%`} l="Invested share" color="var(--blue)" />
        </div>
        <div className="note" style={{ marginTop: 12 }}>
          These four are your figures, not comparisons. No official Indian series publishes savings,
          investments or net worth by age and city, so PeerCompare does not invent one to rank you
          against.
        </div>
      </div>

      {result.tips.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>What stands out</div>
          {result.tips.map((t, i) => <div className={`tip tip-${t[0]}`} key={i}><b>{t[1]}</b>{t[2]}</div>)}
        </div>
      )}

      <MethodologyCard cityLabel={city.l} />
      <button className="btn" onClick={onReset}>Compare again</button>
    </div>
  );
}

/**
 * Where every number came from, on the page rather than in a footnote.
 *
 * Editorial rule 05: limits are stated, not buried. This card is what makes the
 * tool's own footer checkable instead of decorative.
 */
function MethodologyCard({ cityLabel }: { cityLabel: string }) {
  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Where these benchmarks come from</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.65, color: 'var(--ink2)' }}>
        <li>
          <b>Income</b> — the PLFS all-India average monthly earnings for regular wage/salaried
          workers: {fmt(PLFS_REGULAR_WAGE_MONTHLY.male)} for men and{' '}
          {fmt(PLFS_REGULAR_WAGE_MONTHLY.female)} for women. The comparison uses their midpoint.
          MoSPI publishes no breakdown by age or city, so this is a national figure across every
          occupation and location — a reference point, not a target for your role.
        </li>
        <li>
          <b>Savings rate</b> — the RBI&rsquo;s net household financial savings, a national-accounts
          aggregate net of new household borrowing. It is not a survey of individual savings rates.
        </li>
        <li>
          <b>Expenses</b> — worked out from your own income and a cost-of-living index for{' '}
          {cityLabel}, not from what anyone else there spends. The index is a modelling assumption.
        </li>
        <li>
          <b>Emergency fund and debt service</b> — standard planning guidelines, not measurements.
        </li>
      </ul>
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {CITED_SOURCES.map((s) => (
          <a key={s.label} className="fx-prose-link" style={{ fontSize: 12 }} href={s.url} target="_blank" rel="noopener noreferrer">
            {s.title} ({s.period})
          </a>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ m }: { m: Metric }) {
  const meta = STATUS_META[m.status];
  const prov = PROVENANCE_META[m.provenance];
  const dy = m.money ? fmt(m.yours) : m.yours + (m.suf || '');
  const da = m.money ? fmt(m.benchmark) : m.benchmark + (m.suf || '');
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
        <span style={{ color: 'var(--ink2)' }}>Benchmark: {da}</span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${m.index}%`, background: meta.hex }} />
        <div style={{ position: 'absolute', top: -2, left: '50%', width: 2, height: 12, background: 'var(--ink3)', borderRadius: 2 }} />
      </div>
      <div className="note" style={{ textAlign: 'right', marginTop: 5 }}>{m.index} / 100 · {meta.label}</div>
      <div className="note" style={{ marginTop: 8, borderTop: '1px solid var(--hair2)', paddingTop: 8 }}>
        <span style={{ color: prov.color, fontWeight: 600 }}>{prov.label}</span>
        {m.sourceLabel && <span style={{ color: 'var(--ink3)' }}> · {m.sourceLabel}</span>}
        <div style={{ marginTop: 3 }}>{m.basis}</div>
      </div>
    </div>
  );
}

function StatBox({ v, l, color }: { v: string; l: string; color: string }) {
  return (
    <div className="well">
      <div style={{ fontSize: 21, fontWeight: 700, color }}>{v}</div>
      <div className="note">{l}</div>
    </div>
  );
}
