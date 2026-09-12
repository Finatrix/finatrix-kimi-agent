import { useState } from 'react';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { getJSON, setJSON } from '../lib/storage';
import { computePeerCompare, type PeerResult, type Metric } from '../lib/peercompare';
import { useCurrency } from '../CurrencyContext';
import { useMarket } from '../MarketContext';
import { MarketNote } from '../ui/MarketNote';
import { ResultExplainer, type MethodRow } from '../ui/ResultExplainer';
import { reviewedLabel } from '../../shared/reviewed';
import type { MarketPack } from '../lib/markets';
import { track } from '../../lib/analytics';

const STATUS_META = {
  ahead: { arrow: '↑', color: 'var(--green)', hex: '#1d7d46', label: 'Ahead' },
  ontrack: { arrow: '→', color: 'var(--gold)', hex: '#b08a36', label: 'On track' },
  behind: { arrow: '↓', color: 'var(--red)', hex: '#FF5A52', label: 'Behind' },
} as const;

type Fields = { age: string; city: string; income: string; savings: string; invest: string; debt: string; rate: string; expenses: string };

/**
 * Starting answers for the active market. Derived from the pack rather than
 * hard-coded, because ₹50,000 a month is a reasonable prompt in Mumbai and a
 * nonsensical one in Manchester.
 */
function defaultsFor(market: MarketPack): Fields {
  const d = market.peer.defaults;
  return {
    age: String(d.age), city: d.cityKey, income: String(d.income), savings: String(d.savings),
    invest: String(d.invest), debt: String(d.debt), rate: String(d.rate), expenses: String(d.expenses),
  };
}

const KEY_MAP: Record<keyof Fields, string> = {
  age: 'pc-age', city: 'pc-city', income: 'pc-income', savings: 'pc-savings', invest: 'pc-invest', debt: 'pc-debt', rate: 'pc-rate', expenses: 'pc-expenses',
};

function num(v: string): number {
  const n = Number(v);
  return isFinite(n) ? Math.max(0, n) : 0;
}

export default function PeerComparePage() {
  const { cfmt, sym } = useCurrency();
  const { market } = useMarket();
  const peer = market.peer;
  const cityEntries = Object.entries(peer.cities);
  const [f, setF] = useState<Fields>(() => {
    const saved = getJSON<Record<string, string>>('fx_peercompare', {});
    const init = { ...defaultsFor(market) };
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
        }, peer)
      );
      track('tool_completed', { tool: 'peercompare', bucket: market.id });
    }, 600);
  };

  return (
    <div className="fx-page">
      <PageHead chip="PeerCompare" chipColor="var(--purple)" chipBg="rgba(110,59,212,.09)" icon="peer" title="Where your figures sit.">
        Benchmarks for {cityEntries.length} locations across {market.name}, adjusted for local incomes
        and living costs. A reference point for reading your own numbers — never a target to hit.
      </PageHead>

      {!result ? (
        <div className="card">
          <div className="grid2">
            <Field label="Your age" id="pc-age"><input className="fi" type="number" step="any" id="pc-age" value={f.age} min={18} max={70} inputMode="numeric" onChange={(e) => set('age', e.target.value)} /></Field>
            <Field label={peer.cityLabel} id="pc-city">
              <select className="fs" id="pc-city" value={f.city in peer.cities ? f.city : peer.fallbackCity} onChange={(e) => set('city', e.target.value)}>
                {cityEntries.map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
              </select>
            </Field>
          </div>
          <Field label={`Monthly income (${sym})`} id="pc-income"><input className="fi" type="number" step="any" id="pc-income" value={f.income} min={0} inputMode="decimal" onChange={(e) => set('income', e.target.value)} /></Field>
          <div className="grid2">
            <Field label={`Total savings (${sym})`} id="pc-savings"><input className="fi" type="number" step="any" id="pc-savings" value={f.savings} min={0} inputMode="decimal" onChange={(e) => set('savings', e.target.value)} /></Field>
            <Field label={`Total investments (${sym})`} id="pc-invest"><input className="fi" type="number" step="any" id="pc-invest" value={f.invest} min={0} inputMode="decimal" onChange={(e) => set('invest', e.target.value)} /></Field>
          </div>
          <div className="grid2">
            <Field label={`Total debt (${sym})`} id="pc-debt"><input className="fi" type="number" step="any" id="pc-debt" value={f.debt} min={0} inputMode="decimal" onChange={(e) => set('debt', e.target.value)} /></Field>
            <Field label="Monthly savings rate (%)" id="pc-rate"><input className="fi" type="number" step="any" id="pc-rate" value={f.rate} min={0} max={100} inputMode="decimal" onChange={(e) => set('rate', e.target.value)} /></Field>
          </div>
          <Field label={`Monthly expenses (${sym})`} id="pc-expenses"><input className="fi" type="number" step="any" id="pc-expenses" value={f.expenses} min={0} inputMode="decimal" onChange={(e) => set('expenses', e.target.value)} /></Field>
          <button className={`btn ${loading ? 'btn-loading' : ''}`} disabled={loading} onClick={submit}>
            {loading ? 'Comparing…' : 'Show the comparison'}
          </button>
        </div>
      ) : (
        <PeerResultView result={result} market={market} money={cfmt} onReset={() => setResult(null)} />
      )}

      <MarketNote market={market} />
      <ToolFoot>Built with care by <b>FinatriX</b> · Benchmarks are reference points, not targets</ToolFoot>
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

function PeerResultView({ result, market, money, onReset }: {
  result: PeerResult; market: MarketPack; money: (n: number) => string; onReset: () => void;
}) {
  const { metrics, score, scColor, scHex, msg, bracket, city, eMonths, dti, nw, investedRatio } = result;
  const C = 2 * Math.PI * 56;
  const off = C - (score / 100) * C;

  const behind = metrics.filter((m) => m.status === 'behind');
  const widest = [...metrics].sort((a, b) => a.pct - b.pct)[0];

  const inputs: MethodRow[] = [
    { label: 'Age band', value: `${bracket} years` },
    { label: market.peer.cityLabel, value: city.l },
    { label: 'Metrics compared', value: String(metrics.length) },
  ];
  const assumptions: MethodRow[] = [
    { label: 'Cost-of-living multiplier', value: `${city.col}×` },
    { label: 'Benchmarks reviewed', value: reviewedLabel(market.asOf) },
    { label: 'Score', value: 'Mean of the six percentiles' },
  ];

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
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>percentile</div>
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: scColor }}>{msg}</div>
        <div className="note" style={{ marginTop: 4 }}>Among {bracket}-year-olds in {city.l}</div>
      </div>

      <aside className="card" aria-label="What you are being compared with" style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>What you are being compared with</div>
        <dl className="fx-method-rows" style={{ marginBottom: 10 }}>
          <div><dt>Group</dt><dd>{market.peer.population}</dd></div>
          <div><dt>Market</dt><dd>{market.name}</dd></div>
          <div><dt>Age band</dt><dd>{bracket} years</dd></div>
          <div><dt>Location tier</dt><dd>{city.l} · cost index {city.col}×</dd></div>
          <div><dt>Figures reviewed</dt><dd>{reviewedLabel(market.asOf)}</dd></div>
        </dl>
        <p className="note" style={{ lineHeight: 1.65 }}>
          {market.peer.basis} A percentile describes where a figure sits in that group — it is not a
          score, a grade or a target, and half of any group sits below its own median.
        </p>
      </aside>

      <div style={{ fontSize: 15, fontWeight: 700, margin: '20px 4px 12px' }}>Metric by metric</div>
      {metrics.map((m) => <MetricCard key={m.k} m={m} cityLabel={city.l} money={money} />)}

      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Additional stats</div>
        <div className="grid2" style={{ textAlign: 'center' }}>
          <StatBox v={eMonths >= 99 ? '∞' : String(eMonths)} l="Emergency months" color={eMonths >= 6 ? 'var(--green)' : eMonths >= 3 ? 'var(--gold)' : 'var(--red)'} />
          <StatBox v={`${dti}%`} l="Debt-to-income" color={dti < 20 ? 'var(--green)' : dti < 40 ? 'var(--gold)' : 'var(--red)'} />
          <StatBox v={money(nw)} l="Net worth" color="var(--purple)" />
          <StatBox v={`${investedRatio}%`} l="Invested ratio" color="var(--blue)" />
        </div>
      </div>

      {result.tips.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Things worth a look</div>
          {result.tips.map((t, i) => <div className={`tip tip-${t[0]}`} key={i}><b>{t[1]}</b>{t[2]}</div>)}
        </div>
      )}
      <ResultExplainer
        toolId="peercompare"
        market={market}
        inputs={inputs}
        assumptions={assumptions}
        meaning={
          <>
            Across the six measures, your figures average the {score}th percentile of the group
            described above — {msg.toLowerCase()}.{' '}
            {behind.length === 0 ? (
              <>None of the six sits below the benchmark, so there is no single gap to read into this.</>
            ) : (
              <>The widest gap is {widest.l.toLowerCase()}, at the {widest.pct}th percentile, and that is the
                one worth understanding before any of the others.</>
            )}{' '}
            A benchmark describes a group at a point in time. It cannot know your commitments, your
            health, who depends on you or what you are saving towards — so treat a gap as a question
            to ask rather than a verdict to accept.
          </>
        }
      />

      <button className="btn" onClick={onReset}>Compare again</button>
    </div>
  );
}

function MetricCard({ m, cityLabel, money }: { m: Metric; cityLabel: string; money: (n: number) => string }) {
  const meta = STATUS_META[m.status];
  const dy = m.money ? money(m.yours) : m.yours + (m.suf || '');
  const da = m.money ? money(m.avg) : m.avg + (m.suf || '');
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
    <div className="well">
      <div style={{ fontSize: 21, fontWeight: 700, color }}>{v}</div>
      <div className="note">{l}</div>
    </div>
  );
}
