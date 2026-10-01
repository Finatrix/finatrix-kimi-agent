import { useState } from 'react';
import { Link } from 'react-router';
import { peerSummariesFor } from '../../reference/peerSummaries';
import type { MarketPack } from '../lib/markets';
import { PageHead, ToolFoot } from './common';
import { MarketNote } from './MarketNote';
import { Methodology } from './ResultExplainer';

/** Compare only matched definitions. A median is never fed to pcPct. */
export function PublishedPeerComparison({ market }: { market: MarketPack }) {
  const summaries = peerSummariesFor(market.id);
  const [selected, setSelected] = useState(summaries[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [definitionChecked, setDefinitionChecked] = useState(false);
  const [periodChecked, setPeriodChecked] = useState(false);
  const [parts, setParts] = useState(['', '']);
  const [second, setSecond] = useState('');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState('');
  const row = summaries.find((r) => r.id === selected);
  if (!row) return null;
  const money = (n: number) => new Intl.NumberFormat(market.locale, { style: 'currency', currency: row.currency, maximumFractionDigits: 0 }).format(n);
  const partsValid = parts.every((value) => value.trim() && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 1e12);
  const partsTotal = parts.reduce((total, value) => total + Number(value), 0);
  const secondNumber = second.trim() && Number.isFinite(Number(second)) && Math.abs(Number(second)) <= 1e12 && (row.negativeAllowed || Number(second) >= 0) ? Number(second) : null;
  return <div className="fx-page">
    <PageHead chip="PeerCompare" chipColor="var(--purple)" chipBg="rgba(110,59,212,.09)" icon="peer" title="Put a published figure in context.">
      Explore official statistics for {market.name}. Compare the same population, period and definition; a national median is not a financial target.
    </PageHead>
    <div className="card">
      <label className="fl" htmlFor="pc-summary">Published reference</label>
      <select className="fs" id="pc-summary" value={selected} onChange={(e) => { setSelected(e.target.value); setAmount(''); setConfirmed(false); setDefinitionChecked(false); setPeriodChecked(false); setParts(['', '']); setSecond(''); setResult(null); setError(''); }}>
        {summaries.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      <h2 style={{ fontSize: 22 }}>{money(row.value)}</h2>
      <p>{row.label} · {row.period} · {row.unit}</p>
      <dl className="fx-method-rows">
        <div><dt>Population</dt><dd>{row.population}</dd></div>
        <div><dt>Definition</dt><dd>{row.definition}</dd></div>
        <div><dt>Limitations</dt><dd>{row.limitation}</dd></div>
        <div><dt>Last verified</dt><dd>{row.lastVerified}</dd></div>
      </dl>
      <p className="note"><a className="fx-method-link" href={row.sourceUrl} target="_blank" rel="noopener noreferrer">{row.sourceLabel}</a> · {row.locator}</p>
      <p className="note">{row.attribution} <a className="fx-method-link" href={row.licenceUrl} target="_blank" rel="noopener noreferrer">Reuse terms</a></p>
    </div>
    <form className="card" onSubmit={(e) => {
      e.preventDefault();
      const value = Number(amount);
      if (!amount.trim() || !Number.isFinite(value) || Math.abs(value) > 1e12 || (!row.negativeAllowed && value < 0) || !confirmed || !definitionChecked || !periodChecked) {
        setError('Enter a finite amount and complete all three matching checks.'); setResult(null); return;
      }
      setError(''); setResult(value);
    }}>
      <label className="fl" htmlFor="pc-reference-amount">Your matching figure ({row.currency}, {row.unit})</label>
      <input className="fi" id="pc-reference-amount" type="number" step="any" inputMode="decimal" value={amount}
        aria-describedby="pc-reference-help" onChange={(e) => { setAmount(e.target.value); setResult(null); }} />
      <p id="pc-reference-help" className="note">Use a figure for {row.period} with the definition above. No currency conversion or inflation adjustment is applied. You can read the reference without entering anything.</p>
      <button type="button" className="btn btn-ghost btn-sm" aria-expanded={builderOpen} aria-controls="pc-figure-builder" onClick={() => setBuilderOpen(!builderOpen)}>Build my matching figure from parts</button>
      {builderOpen && <div id="pc-figure-builder" className="well" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16 }}>Add the parts you have checked</h2>
        <p className="note">Enter non-overlapping components in {row.currency}, {row.unit}, on the {row.period} basis. For net worth, enter liabilities as negative amounts. For income, follow every inclusion and exclusion in the published definition. No missing component is inferred.</p>
        {parts.map((value, i) => <div className="fg" key={i}><label className="fl" htmlFor={`pc-part-${i}`}>Component {i + 1} ({row.currency})</label><input className="fi" id={`pc-part-${i}`} type="number" step="any" inputMode="decimal" value={value} onChange={(e) => setParts((prev) => prev.map((item, j) => j === i ? e.target.value : item))} /></div>)}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={parts.length >= 10} onClick={() => setParts([...parts, ''])}>Add component</button>
          {parts.length > 2 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParts(parts.slice(0, -1))}>Remove last component</button>}
          <button type="button" className="btn btn-ghost btn-sm" disabled={!partsValid || Math.abs(partsTotal) > 1e12 || (!row.negativeAllowed && partsTotal < 0)} onClick={() => { setAmount(String(partsTotal)); setResult(null); setConfirmed(false); setDefinitionChecked(false); setPeriodChecked(false); }}>Use component total</button>
        </div>
        <p className="note" role="status">{partsValid && Math.abs(partsTotal) <= 1e12 ? `Component total: ${money(partsTotal)}. Check completeness before using it.` : 'Complete every component. Enter 0 explicitly for a known zero.'}</p>
      </div>}
      <h2 style={{ fontSize: 17 }}>Check that like is being compared with like</h2>
      <p className="note">{[confirmed, definitionChecked, periodChecked].filter(Boolean).length} of 3 matching checks complete. If any check is uncertain, use the published figure as context without generating a personal comparison.</p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, margin: '14px 0' }}>
        <input type="checkbox" checked={confirmed} onChange={(e) => { setConfirmed(e.target.checked); setResult(null); }} />
        My figure matches the reference population and household or person basis.
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, margin: '14px 0' }}><input type="checkbox" checked={definitionChecked} onChange={(e) => { setDefinitionChecked(e.target.checked); setResult(null); }} />My figure follows the stated income or net-worth definition.</label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, margin: '14px 0' }}><input type="checkbox" checked={periodChecked} onChange={(e) => { setPeriodChecked(e.target.checked); setResult(null); }} />My figure uses {row.currency}, {row.unit}, and the {row.period} price and reporting period.</label>
      {error && <p role="alert">{error}</p>}
      <button className="btn" type="submit">Compare matching figures</button>
      {result !== null && <div role="status" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 18 }}>Your figure and the published median</h2>
        <p>{money(result)} compared with {money(row.value)}. Your entered figure is {result > row.value ? 'above' : result < row.value ? 'below' : 'equal to'} this dated median.</p>
        <p>The absolute difference is {money(Math.abs(result - row.value))}. This is a difference between figures, not a savings shortfall or a target.</p>
        <p className="note">This gives no percentile, age ranking or financial-health score. Differences do not establish how much you need or ought to have.</p>
      </div>}
      {result !== null && <section className="well" style={{ marginTop: 18 }} aria-labelledby="pc-second-title">
        <h2 id="pc-second-title" style={{ fontSize: 17 }}>Compare a second matching figure</h2>
        <p className="note">Enter another figure using the same checked definition, population and period. This is a separate illustration; it does not replace your first entry.</p>
        <label className="fl" htmlFor="pc-second">Second matching figure ({row.currency})</label>
        <input className="fi" type="number" step="any" inputMode="decimal" id="pc-second" value={second} onChange={(e) => setSecond(e.target.value)} />
        <div aria-live="polite">{secondNumber !== null ? <p>{money(secondNumber)} is {money(Math.abs(secondNumber - row.value))} {secondNumber >= row.value ? 'above' : 'below'} the published median, and {money(Math.abs(secondNumber - result))} {secondNumber >= result ? 'higher' : 'lower'} than your first figure.</p> : <p className="note">Enter a complete, finite figure to compare. Blank is not zero.</p>}</div>
      </section>}
    </form>
    <aside className="card" aria-label="A useful next step"><h2 style={{ fontSize: 17 }}>Make it useful for your own plan</h2><p className="note">{row.unit.includes('week') || row.unit.includes('month') || row.unit.includes('year') ? 'A historical household income reference cannot determine your monthly budget. Use your current income, expenses and commitments to plan what is affordable today.' : 'A national wealth median cannot tell you what you need. Track your own assets and debts over time, keeping household and personal totals distinct.'}</p><Link className="btn btn-ghost btn-sm" to={row.unit.includes('week') || row.unit.includes('month') || row.unit.includes('year') ? '/tools/budget' : '/tools/networth'}>{row.unit.includes('week') || row.unit.includes('month') || row.unit.includes('year') ? 'Plan with my current budget' : 'Track my own net worth'}</Link></aside>
    <Methodology toolId="peercompare" market={market} />
    <MarketNote market={market} />
    <ToolFoot>Built with care by <b>FinatriX</b> · Published references, not targets</ToolFoot>
  </div>;
}
