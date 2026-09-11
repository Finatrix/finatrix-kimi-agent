import { useState } from 'react';
import { useToast } from '../ui/Toast';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { cfmtSh } from '../lib/format';
import { getJSON, setJSON } from '../lib/storage';
import { computeParkSmart, PS_DL, type ParkResult } from '../lib/parksmart';
import { useCurrency } from '../CurrencyContext';
import { useMarket } from '../MarketContext';
import { MarketNote } from '../ui/MarketNote';
import { track } from '../../lib/analytics';

interface Saved { 'ps-amount'?: string; 'ps-duration'?: string; 'ps-slab'?: string }

export default function ParkSmartPage() {
  const { notify } = useToast();
  const { cfmt, code, sym } = useCurrency();
  const { market } = useMarket();
  const park = market.park;
  const saved = getJSON<Saved>('fx_parksmart', {});
  const [amount, setAmount] = useState(saved['ps-amount'] ?? '100000');
  const [dur, setDur] = useState(saved['ps-duration'] ?? '3-6');
  // The market's own default, not a hard-coded 20%: the UAE offers only 0% and
  // the US brackets do not include 20 at all. India's stays 20, so an existing
  // user's first ranking is unchanged.
  const defaultRate = String(park.defaultRate);
  const [slab, setSlab] = useState(saved['ps-slab'] ?? defaultRate);
  const [result, setResult] = useState<ParkResult | null>(null);

  const persist = (next: Partial<Saved>) => {
    setJSON('fx_parksmart', { 'ps-amount': amount, 'ps-duration': dur, 'ps-slab': slab, ...next });
  };

  // A rate stored under a previous market may not exist in this one (30% is an
  // Indian slab, not a US bracket). Falling back keeps the select controlled.
  const rate = park.rateOptions.some((o) => String(o.value) === slab) ? slab : defaultRate;

  const submit = () => {
    const amt = Math.max(0, Number(amount) || 0);
    if (amt < park.minAmount) {
      notify(`Please enter at least ${cfmt(park.minAmount)}.`, 'error');
      return;
    }
    // computeParkSmart is synchronous — no artificial delay needed.
    setResult(computeParkSmart(amt, dur, Number(rate) / 100, park));
    track('tool_completed', { tool: 'parksmart', market: market.id });
  };

  return (
    <div className="fx-page">
      <PageHead chip="ParkSmart" chipColor="var(--teal)" chipBg="rgba(12,128,121,.09)" icon="bank" title="Idle money shouldn't idle.">
        Compare what idle cash actually earns after tax across {park.options.length} parking options
        in {market.name} — tuned to your duration, your tax rate and current rules.
      </PageHead>

      {!result ? (
        <div className="card">
          <div className="fg">
            <label className="fl" htmlFor="ps-amount">Amount to park ({sym})</label>
            <input className="fi" type="number" step="any" id="ps-amount" value={amount} min={park.minAmount} inputMode="decimal"
              onChange={(e) => { setAmount(e.target.value); persist({ 'ps-amount': e.target.value }); }} />
          </div>
          <label className="fl">Quick select</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {park.quickAmounts.map((v) => (
              <button key={v} className="btn btn-ghost btn-sm" onClick={() => { setAmount(String(v)); persist({ 'ps-amount': String(v) }); }}>{cfmtSh(v, code)}</button>
            ))}
          </div>
          <div className="grid2">
            <div className="fg">
              <label className="fl" htmlFor="ps-duration">Parking duration</label>
              <select className="fs" id="ps-duration" value={dur} onChange={(e) => { setDur(e.target.value); persist({ 'ps-duration': e.target.value }); }}>
                <option value="0-1">Under 1 month</option>
                <option value="1-3">1–3 months</option>
                <option value="3-6">3–6 months</option>
                <option value="6-12">6–12 months</option>
                <option value="12+">Over 1 year</option>
              </select>
            </div>
            <div className="fg">
              <label className="fl" htmlFor="ps-slab">{park.rateLabel}</label>
              <select className="fs" id="ps-slab" value={rate} onChange={(e) => { setSlab(e.target.value); persist({ 'ps-slab': e.target.value }); }}>
                {park.rateOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="note" style={{ marginTop: 6 }}>{park.taxNote}</p>
            </div>
          </div>
          <button className="btn" onClick={submit}>
            Find the best options
          </button>
        </div>
      ) : (
        <ParkResultView
          result={result}
          amount={Math.max(0, Number(amount) || 0)}
          dur={dur}
          money={cfmt}
          keepInMind={park.keepInMind}
          onReset={() => setResult(null)}
        />
      )}

      <MarketNote market={market} />
      <ToolFoot>Built with care by <b>FinatriX</b> · Not financial advice</ToolFoot>
    </div>
  );
}

function ParkResultView({ result, amount, dur, money, keepInMind, onReset }: {
  result: ParkResult; amount: number; dur: string;
  money: (n: number) => string; keepInMind: string; onReset: () => void;
}) {
  const { ranked, best, maxNet, split } = result;
  if (!best) return null;

  return (
    <div>
      <div className="card result-hero-anim" style={{ background: 'linear-gradient(135deg,rgba(20,184,166,.16),rgba(13,13,15,.86) 62%)' }}>
        <span className="pill" style={{ background: 'rgba(12,128,121,.12)', color: 'var(--teal)' }}>Best Match</span>
        <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.015em', marginTop: 10 }}>
          <Icon name={best.ic} size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} /> {best.n}
        </div>
        <div className="note" style={{ marginTop: 4 }}>{best.d}</div>
        <div className="grid3" style={{ textAlign: 'center', marginTop: 18 }}>
          <div><div style={{ fontSize: 19, fontWeight: 700, color: 'var(--green)' }}>{money(best.net)}</div><div className="note">Post-tax earnings</div></div>
          <div><div style={{ fontSize: 19, fontWeight: 700, color: 'var(--teal)' }}>{best.effRate.toFixed(2)}%</div><div className="note">Effective rate</div></div>
          <div><div style={{ fontSize: 19, fontWeight: 700, color: 'var(--gold)' }}>{best.risk}</div><div className="note">Risk</div></div>
        </div>
      </div>

      {split && (
        <div className="card" style={{ background: 'rgba(12,128,121,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', marginBottom: 8 }}>Smart split idea</div>
          <div className="note" style={{ lineHeight: 1.8 }}>
            {split.bestName} locks your money. Consider <b style={{ color: 'var(--ink)' }}>{money(split.core)}</b> in {split.bestName} for max
            returns + <b style={{ color: 'var(--ink)' }}>{money(split.buf)}</b> in {split.bestLiquidName} so 30% stays one tap away.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '18px 4px 12px' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>All options, ranked</div>
        <div className="note">{money(amount)} for {PS_DL[dur]}</div>
      </div>

      {ranked.map((o, i) => (
        <div key={o.n} className="card result-card-anim" style={{ padding: '18px 20px', ...(i === 0 ? { border: '1.5px solid rgba(12,128,121,.35)', boxShadow: 'var(--shadow)' } : {}) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`fx-rank${i === 0 ? ' is-top' : ''}`}>{i + 1}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24 }}><Icon name={o.ic} size={18} style={{ color: 'var(--teal)' }} /></span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{o.n}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{money(o.net)}</span>
          </div>
          <div className="note" style={{ margin: '7px 0 7px 36px' }}>{o.d}</div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink3)', marginLeft: 36, flexWrap: 'wrap' }}>
            <span>Gross {o.rate}%</span><span>Post-tax {o.effRate.toFixed(2)}%</span>
            <span className={`pill ${o.liquid ? 'pill-ok' : 'pill-bad'}`} style={{ fontSize: 10 }}>{o.liquid ? 'Liquid' : 'Locked'}</span>
            <span>Risk: {o.risk}</span>
          </div>
          <div className="bar bar-sm" style={{ margin: '9px 0 0 36px' }}>
            <div className="bar-fill" style={{ width: `${((o.net / maxNet) * 100).toFixed(0)}%`, background: i === 0 ? 'var(--teal)' : 'var(--hair)' }} />
          </div>
        </div>
      ))}

      <div className="card" style={{ background: 'var(--gold-bg)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Keep in mind</div>
        <div className="note">{keepInMind}</div>
      </div>
      <button className="btn" onClick={onReset}>Try a different amount</button>
    </div>
  );
}
