import { PublishedPeerComparison } from '../ui/PublishedPeerComparison';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageHead, ToolFoot } from '../ui/common';
import { AmountInput } from '../ui/AmountInput';
import { PercentField } from '../ui/MoneyField';
import { plainAmount } from '../lib/formula';
import { Icon } from '../ui/Icon';
import { getJSON, setJSON } from '../lib/storage';
import { computePeerCompare, type PeerResult, type Metric, type PeerInput } from '../lib/peercompare';
import { useCurrency } from '../CurrencyContext';
import { useMarket } from '../MarketContext';
import { MarketNote } from '../ui/MarketNote';
import { ResultExplainer, type MethodRow } from '../ui/ResultExplainer';
import { Disclosure } from '../ui/Disclosure';
import { reviewedLabel } from '../../shared/reviewed';
import type { MarketPack } from '../lib/markets';
import { track } from '../../lib/analytics';
import { peerCashFlow, peerInputError } from '../lib/comparisonAssist';

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

/** Fields typed as money, which accept arithmetic. Age and the rate do not. */
const MONEY: ReadonlySet<keyof Fields> = new Set(['income', 'savings', 'invest', 'debt', 'expenses']);

/** A field as validated and saved: money resolved to its plain number (see plainAmount). */
function plain(f: Fields, k: keyof Fields): string {
  return MONEY.has(k) ? plainAmount(f[k]) : f[k];
}

function num(v: string): number {
  return v.trim() ? Number(v) : NaN;
}

export default function PeerComparePage() {
  const { market } = useMarket();
  return market.peer.mode === 'published-context'
    ? <PublishedPeerComparison key={market.id} market={market} />
    : <LegacyPeerComparePage />;
}

function LegacyPeerComparePage() {
  const { cfmt, sym, code, setCode } = useCurrency();
  const { market } = useMarket();
  const peer = market.peer;
  const cityEntries = Object.entries(peer.cities);
  const [saved] = useState(() => getJSON<Record<string, string>>('fx_peercompare', {}));
  const [f, setF] = useState<Fields>(() => defaultsFor(market));
  const [result, setResult] = useState<PeerResult | null>(null);
  const [error, setError] = useState('');
  const input: PeerInput = { age: num(f.age), cityKey: f.city, income: num(plain(f, 'income')), savings: num(plain(f, 'savings')), invest: num(plain(f, 'invest')), debt: num(plain(f, 'debt')), rate: num(f.rate), expenses: num(plain(f, 'expenses')) };
  const inputError = peerInputError(input, peer);
  const cashFlow = inputError ? null : peerCashFlow(input);

  const set = (k: keyof Fields, v: string) => {
    const next = { ...f, [k]: v };
    setF(next);
    setError('');
    const snapshot: Record<string, string> = {};
    (Object.keys(KEY_MAP) as (keyof Fields)[]).forEach((kk) => { snapshot[KEY_MAP[kk]] = plain(next, kk); });
    setJSON('fx_peercompare', { ...snapshot, market: market.id, currency: code });
  };

  const submit = () => {
    if (code !== market.currency) { setError(`Enter matching figures in ${market.currency} before comparing.`); return; }
    if (inputError) { setError(inputError); return; }
    setError('');
    setResult(computePeerCompare(input, peer));
      track('tool_completed', { tool: 'peercompare', bucket: market.id });
  };

  return (
    <div className="fx-page">
      <PageHead chip="PeerCompare" chipColor="var(--purple)" chipBg="rgba(110,59,212,.09)" icon="peer" title="Where your figures sit.">
        Illustrative benchmarks for {cityEntries.length} locations across {market.name}, using an
        age-band and location model. These estimates provide context, not a population ranking or a target.
      </PageHead>

      {code !== market.currency ? <aside className="card" aria-label="Match the benchmark currency">
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Use {market.currency} for this comparison</h2>
        <p>The {market.name} model references are in {market.currency}. Your current display currency is {code}; comparing these amounts would mix different units.</p>
        <p className="note">Switch to {market.currency}, then enter or review every monetary figure in that currency. Switching does not convert your amounts. Restate any figures held in another currency before comparing.</p>
        <button type="button" className="btn" onClick={() => { setResult(null); setF(defaultsFor(market)); setError(''); setCode(market.currency); }}>Switch to {market.currency}</button>
        {/* Shows what the tool asks for, so the switch is not a leap in the dark. */}
        <p className="note" style={{ marginTop: 16, marginBottom: 0 }}>After switching you enter:</p>
        <div className="fx-pc-preview">
          {['Your age', 'Location', 'Monthly income', 'Total savings', 'Total investments', 'Total debt', 'Savings rate', 'Monthly expenses'].map((label) => <span key={label}>{label}</span>)}
        </div>
      </aside> : !result ? (
        <div className="card">
          {saved.market === market.id && saved.currency === code && <div className="well" style={{ marginBottom: 18 }}>
            <p className="note">Saved PeerCompare inputs for {market.name}, {code}. Review them before comparing; they may be out of date.</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
              const next = { ...f };
              (Object.keys(KEY_MAP) as (keyof Fields)[]).forEach((key) => { if (typeof saved[KEY_MAP[key]] === 'string') next[key] = saved[KEY_MAP[key]]; });
              setF(next); setError('');
            }}>Review saved figures</button>
          </div>}
          <div className="grid2">
            <Field label="Your age" id="pc-age"><input className="fi" type="number" step="any" id="pc-age" value={f.age} min={18} max={70} inputMode="numeric" onChange={(e) => set('age', e.target.value)} /></Field>
            <Field label={peer.cityLabel} id="pc-city">
              <select className="fs" id="pc-city" value={f.city in peer.cities ? f.city : peer.fallbackCity} onChange={(e) => set('city', e.target.value)}>
                {cityEntries.map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
              </select>
            </Field>
          </div>
          <Field label={`Monthly income (${sym})`} id="pc-income"><AmountInput id="pc-income" sym={sym} placeholder="" value={f.income} onChange={(v) => set('income', v)} /></Field>
          <div className="grid2">
            <Field label={`Total savings (${sym})`} id="pc-savings"><AmountInput id="pc-savings" sym={sym} placeholder="" value={f.savings} onChange={(v) => set('savings', v)} /></Field>
            <Field label={`Total investments (${sym})`} id="pc-invest"><AmountInput id="pc-invest" sym={sym} placeholder="" value={f.invest} onChange={(v) => set('invest', v)} /></Field>
          </div>
          <div className="grid2">
            <Field label={`Total debt (${sym})`} id="pc-debt"><AmountInput id="pc-debt" sym={sym} placeholder="" value={f.debt} onChange={(v) => set('debt', v)} /></Field>
            <Field label="Monthly savings rate (%)" id="pc-rate"><PercentField id="pc-rate" value={f.rate} onChange={(v) => set('rate', v)} /></Field>
          </div>
          <Field label={`Monthly expenses (${sym})`} id="pc-expenses"><AmountInput id="pc-expenses" sym={sym} placeholder="" value={f.expenses} onChange={(v) => set('expenses', v)} /></Field>
          {cashFlow && <aside className="well" aria-label="Cash-flow cross-check" style={{ marginBottom: 18 }}>
            <b>Automatic consistency check</b>
            <p className="note">Income minus expenses leaves {cfmt(cashFlow.surplus)} a month. Your entered savings rate implies {cfmt(cashFlow.impliedSavings)} a month.</p>
            {cashFlow.exceedsSurplus && <p className="tip tip-warn">The savings rate implies more savings than the entered monthly surplus. Check whether expenses already include transfers to savings, or whether a figure needs updating.</p>}
            {cashFlow.surplus >= 0 && <><button type="button" className="btn btn-ghost btn-sm" onClick={() => set('rate', ((cashFlow.surplus / input.income) * 100).toFixed(1))}>Use the income-minus-expenses rate</button><p className="note">Use this only if expenses include all spending and exclude savings transfers. Irregular bills can change the actual rate.</p></>}
          </aside>}
          {error && <p role="alert">{error}</p>}
          <button className="btn" onClick={submit}>
            Show the comparison
          </button>
        </div>
      ) : (
        <PeerResultView result={result} input={input} market={market} money={cfmt} onReset={() => setResult(null)} />
      )}

      <MarketNote market={market} />
      <ToolFoot>Benchmarks are reference points, not targets</ToolFoot>
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

function PeerResultView({ result, input, market, money, onReset }: {
  result: PeerResult; input: PeerInput; market: MarketPack; money: (n: number) => string; onReset: () => void;
}) {
  const { metrics, score, bracket, city, eMonths, dti, nw, investedRatio } = result;
  const C = 2 * Math.PI * 56;
  const off = C - (score / 100) * C;

  const inputs: MethodRow[] = [
    { label: 'Age band', value: `${bracket} years` },
    { label: market.peer.cityLabel, value: city.l },
    { label: 'Metrics compared', value: String(metrics.length) },
  ];
  const assumptions: MethodRow[] = [
    { label: 'Cost-of-living multiplier', value: `${city.col}×` },
    { label: 'Benchmarks reviewed', value: reviewedLabel(market.asOf) },
    { label: 'Score', value: 'Rounded mean of six illustrative model scores' },
    { label: 'Statistical meaning', value: 'No population rank or prevalence is measured' },
  ];

  return (
    <div>
      <div className="card result-hero-anim" style={{ textAlign: 'center', padding: '34px 24px' }}>
        <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto 14px' }}>
          <svg aria-hidden="true" width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="70" cy="70" r="56" fill="none" stroke="var(--hair2)" strokeWidth="9" />
            <circle cx="70" cy="70" r="56" fill="none" stroke="var(--purple)" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: 'stroke-dashoffset 1s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, color: 'var(--purple)' }}>{score}</div>
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>out of 100</div>
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Illustrative benchmark score</div>
        <div className="note" style={{ marginTop: 4 }}>Model inputs: age band {bracket} · {city.l}</div>
        <p className="note">This is a model score, not a percentile, a financial-health grade or a statement about how many people have more or less than you.</p>
      </div>

      {/* The basis in one line, the full description one press away: the hero
          above already says this is a model score and not a percentile, which
          is the part a reader must not miss. */}
      <aside className="card" aria-label="What you are being compared with" style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>What you are being compared with</div>
        <p className="note" style={{ margin: '0 0 4px' }}>A FinatriX illustrative benchmark model for {market.name}, age {bracket}, {city.l}.</p>
        <Disclosure variant="inline" showLabel="Show the comparison basis" hideLabel="Hide the comparison basis">
        <dl className="fx-method-rows" style={{ margin: '8px 0 10px' }}>
          <div><dt>Comparison type</dt><dd>FinatriX illustrative benchmark model</dd></div>
          <div><dt>Market</dt><dd>{market.name}</dd></div>
          <div><dt>Age band</dt><dd>{bracket} years</dd></div>
          <div><dt>Location tier</dt><dd>{city.l} · cost index {city.col}×</dd></div>
          <div><dt>Figures reviewed</dt><dd>{reviewedLabel(market.asOf)}</dd></div>
        </dl>
        <p className="note" style={{ lineHeight: 1.65 }}>
          The reference values are model estimates selected by age band and location. No observed
          distribution is used to establish your position among people. A score of 50 means a positive
          input matches its positive benchmark in the scoring model; it does not mean half of people
          have a higher or lower figure. Read your actual amounts alongside each reference.
        </p>
        </Disclosure>
      </aside>

      <PeerScenarioAssist input={input} market={market} result={result} money={money} />

      <div style={{ fontSize: 15, fontWeight: 700, margin: '20px 4px 12px' }}>Metric by metric</div>
      {metrics.map((m) => <MetricCard key={m.k} m={m} cityLabel={city.l} money={money} />)}

      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Additional stats</div>
        <div className="grid2" style={{ textAlign: 'center' }}>
          <StatBox v={input.expenses === 0 ? 'Not defined' : String(eMonths)} l="Emergency months" color={input.expenses === 0 ? 'var(--ink2)' : eMonths >= 6 ? 'var(--green)' : eMonths >= 3 ? 'var(--gold)' : 'var(--red)'} />
          <StatBox v={input.income === 0 ? 'Not defined' : `${dti}%`} l="Total debt / annual income" color={input.income === 0 ? 'var(--ink2)' : dti < 20 ? 'var(--green)' : dti < 40 ? 'var(--gold)' : 'var(--red)'} />
          <StatBox v={money(nw)} l="Net worth" color="var(--purple)" />
          <StatBox v={input.savings + input.invest > 0 ? `${investedRatio}%` : 'Not defined'} l="Investments / savings and investments" color="var(--blue)" />
        </div>
        {/* How each figure above is worked out, and what it cannot tell you —
            it used to be a separate card of its own under the stats. */}
        <Disclosure variant="inline" showLabel="Show how these are worked out" hideLabel="Hide how these are worked out">
        <p className="note">Your entered savings of {money(input.savings)} plus investments of {money(input.invest)}, less debt of {money(input.debt)}, give {money(nw)} of net worth within this form. Assets or debts you have not entered are not included.</p>
        <p className="note">{input.expenses > 0 ? `Savings divided by entered monthly expenses gives ${eMonths} months of cover. This assumes those savings are accessible and available for expenses.` : 'Months of cover cannot be interpreted when monthly expenses are zero.'} {input.income > 0 ? 'The debt ratio compares your total outstanding debt with annual income; it does not measure monthly repayment affordability.' : 'The debt-to-income ratio cannot be interpreted when income is zero.'}</p>
        </Disclosure>
      </div>
      <ResultExplainer
        toolId="peercompare"
        market={market}
        inputs={inputs}
        assumptions={assumptions}
        meaning={
          <>
            The six modeled comparisons produce an illustrative benchmark score of {score}/100.
            Each positive figure is compared with its benchmark using a fixed scoring curve;
            expenses use the inverse ratio, so lower expenses produce a higher model score.
            The rounded average summarizes that model only. It does not estimate your statistical
            rank, your financial health or the share of people doing better or worse.
            Your commitments, dependants, health and goals determine which actual figures matter to you.
          </>
        }
      />

      <button className="btn" onClick={onReset}>Compare again</button>
    </div>
  );
}

function MetricCard({ m, cityLabel, money }: { m: Metric; cityLabel: string; money: (n: number) => string }) {
  const dy = m.money ? money(m.yours) : m.yours + (m.suf || '');
  const da = m.money ? money(m.avg) : m.avg + (m.suf || '');
  const comparison = m.yours > m.avg ? 'Above reference' : m.yours < m.avg ? 'Below reference' : 'Matches reference';
  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {m.i ? m.i : m.ic ? <Icon name={m.ic as never} size={14} style={{ verticalAlign: '-2px' }} /> : null} {m.l}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink2)' }}>{comparison}</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
        <span>You: <b>{dy}</b></span>
        <span style={{ color: 'var(--ink2)' }}>{cityLabel} model reference: {da}</span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${m.pct}%`, background: 'var(--purple)' }} />
        <div style={{ position: 'absolute', top: -2, left: '50%', width: 2, height: 12, background: 'var(--ink3)', borderRadius: 2 }} />
      </div>
      <div className="note" style={{ textAlign: 'right', marginTop: 5 }}>Model score {m.pct}/100{m.invert ? ' · Lower spending raises this score' : ''}</div>
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

function PeerScenarioAssist({ input, market, result, money }: { input: PeerInput; market: MarketPack; result: PeerResult; money: (n: number) => string }) {
  const [city, setCity] = useState(input.cityKey);
  const [metric, setMetric] = useState('income');
  const scenario = computePeerCompare({ ...input, cityKey: city }, market.peer);
  const original = result.metrics.find((m) => m.k === metric)!;
  const comparison = scenario.metrics.find((m) => m.k === metric)!;
  const display = (n: number) => original.money ? money(n) : `${n}%`;
  const nextTool = input.expenses > input.income ? { path: 'budget', text: 'Review the monthly shortfall', reason: 'Your entered spending exceeds income. Understanding that gap is more useful than improving a comparison score.' }
    : input.expenses > 0 && result.eMonths < 3 ? { path: 'goals', text: 'Plan a cash buffer', reason: `Your savings cover ${result.eMonths} months of entered expenses. Set a buffer goal based on your own commitments.` }
      : { path: 'networth', text: 'Review my full net worth', reason: 'This comparison uses only the assets and debts entered here. Check property, pensions and any missing liabilities before drawing conclusions.' };
  return <section className="card" aria-labelledby="pc-smart-title">
    <h2 id="pc-smart-title" style={{ fontSize: 18, marginTop: 0 }}>Understand the comparison</h2>
    <p className="note">Explore how the existing model changes with location. It does not predict relocation costs, salary changes or a measured population percentile.</p>
    <Disclosure variant="inline" showLabel="Show the location explorer" hideLabel="Hide the location explorer">
    <div className="grid2">
      <div className="fg"><label className="fl" htmlFor="pc-scenario-city">Explore a location</label><select className="fs" id="pc-scenario-city" value={city} onChange={(e) => setCity(e.target.value)}>{Object.entries(market.peer.cities).map(([key, value]) => <option key={key} value={key}>{value.l}</option>)}</select></div>
      <div className="fg"><label className="fl" htmlFor="pc-scenario-metric">Focus on a measure</label><select className="fs" id="pc-scenario-metric" value={metric} onChange={(e) => setMetric(e.target.value)}>{result.metrics.map((m) => <option key={m.k} value={m.k}>{m.l}</option>)}</select></div>
    </div>
    <div role="status"><p>Your {original.l.toLowerCase()}: <b>{display(original.yours)}</b>. The reference is {display(original.avg)} in {result.city.l} and {display(comparison.avg)} in {scenario.city.l}.</p>
      <p className="note">The entered figure is {display(Math.abs(comparison.yours - comparison.avg))} {comparison.yours < comparison.avg ? 'below' : comparison.yours > comparison.avg ? 'above' : 'away from'} this reference. A difference is context, not an amount you need to reach.</p></div>
    </Disclosure>
    {/* The suggested next step stays visible: it answers "what now?". */}
    <div className="tip tip-info">{nextTool.reason}</div>
    <Link to={`/tools/${nextTool.path}`} className="btn btn-ghost btn-sm">{nextTool.text}</Link>
  </section>;
}
