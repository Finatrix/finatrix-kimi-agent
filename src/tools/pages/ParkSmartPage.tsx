import { useState } from 'react';
import { useToast } from '../ui/Toast';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { fmt } from '../lib/format';
import { getJSON, setJSON } from '../lib/storage';
import { computeParkSmart, PS_DL, type ParkResult } from '../lib/parksmart';

const QUICK: [number, string][] = [
  [25000, '₹25K'], [100000, '₹1L'], [500000, '₹5L'], [1000000, '₹10L'], [2500000, '₹25L'],
];

interface Saved { 'ps-amount'?: string; 'ps-duration'?: string; 'ps-slab'?: string }

export default function ParkSmartPage() {
  const { notify } = useToast();
  const saved = getJSON<Saved>('fx_parksmart', {});
  const [amount, setAmount] = useState(saved['ps-amount'] ?? '100000');
  const [dur, setDur] = useState(saved['ps-duration'] ?? '3-6');
  const [slab, setSlab] = useState(saved['ps-slab'] ?? '20');
  const [result, setResult] = useState<ParkResult | null>(null);
  const [loading, setLoading] = useState(false);

  const persist = (next: Partial<Saved>) => {
    setJSON('fx_parksmart', { 'ps-amount': amount, 'ps-duration': dur, 'ps-slab': slab, ...next });
  };

  const submit = () => {
    const amt = Math.max(0, Number(amount) || 0);
    if (amt < 1000) {
      notify('Please enter at least ₹1,000.', 'error');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setResult(computeParkSmart(amt, dur, Number(slab) / 100));
    }, 500);
  };

  return (
    <div className="fx-page">
      <PageHead chip="ParkSmart" chipColor="var(--teal)" chipBg="rgba(12,128,121,.09)" icon="bank" title="Idle money shouldn't idle.">
        Compare what ₹1 actually earns after tax across ten parking options — tuned to your duration,
        your slab, and 2026 tax rules.
      </PageHead>

      {!result ? (
        <div className="card">
          <div className="fg">
            <label className="fl" htmlFor="ps-amount">Amount to park (₹)</label>
            <input className="fi" type="number" step="any" id="ps-amount" value={amount} min={1000} inputMode="decimal"
              onChange={(e) => { setAmount(e.target.value); persist({ 'ps-amount': e.target.value }); }} />
          </div>
          <label className="fl">Quick select</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {QUICK.map(([v, l]) => (
              <button key={v} className="btn btn-ghost btn-sm" onClick={() => { setAmount(String(v)); persist({ 'ps-amount': String(v) }); }}>{l}</button>
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
              <label className="fl" htmlFor="ps-slab">Income-tax slab</label>
              <select className="fs" id="ps-slab" value={slab} onChange={(e) => { setSlab(e.target.value); persist({ 'ps-slab': e.target.value }); }}>
                <option value="0">0% (income under ₹12L, new regime)</option>
                <option value="5">5%</option>
                <option value="10">10%</option>
                <option value="15">15%</option>
                <option value="20">20%</option>
                <option value="25">25%</option>
                <option value="30">30%</option>
              </select>
            </div>
          </div>
          <button className={`btn ${loading ? 'btn-loading' : ''}`} disabled={loading} onClick={submit}>
            {loading ? 'Comparing options…' : 'Find the best options'}
          </button>
        </div>
      ) : (
        <ParkResultView result={result} amount={Math.max(0, Number(amount) || 0)} dur={dur} onReset={() => setResult(null)} />
      )}

      <ToolFoot>Rates are indicative averages, June 2026 · Built with care by <b>FinatriX</b> · Not financial advice</ToolFoot>
    </div>
  );
}

function ParkResultView({ result, amount, dur, onReset }: { result: ParkResult; amount: number; dur: string; onReset: () => void }) {
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
          <div><div style={{ fontSize: 19, fontWeight: 700, color: 'var(--green)' }}>{fmt(best.net)}</div><div className="note">Post-tax earnings</div></div>
          <div><div style={{ fontSize: 19, fontWeight: 700, color: 'var(--teal)' }}>{best.effRate.toFixed(2)}%</div><div className="note">Effective rate</div></div>
          <div><div style={{ fontSize: 19, fontWeight: 700, color: 'var(--gold)' }}>{best.risk}</div><div className="note">Risk</div></div>
        </div>
      </div>

      {split && (
        <div className="card" style={{ background: 'rgba(12,128,121,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', marginBottom: 8 }}>Smart split idea</div>
          <div className="note" style={{ lineHeight: 1.8 }}>
            {split.bestName} locks your money. Consider <b style={{ color: 'var(--ink)' }}>{fmt(split.core)}</b> in {split.bestName} for max
            returns + <b style={{ color: 'var(--ink)' }}>{fmt(split.buf)}</b> in {split.bestLiquidName} so 30% stays one tap away.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '18px 4px 12px' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>All options, ranked</div>
        <div className="note">{fmt(amount)} for {PS_DL[dur]}</div>
      </div>

      {ranked.map((o, i) => (
        <div key={o.n} className="card result-card-anim" style={{ padding: '18px 20px', ...(i === 0 ? { border: '1.5px solid rgba(12,128,121,.35)', boxShadow: 'var(--shadow)' } : {}) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: i === 0 ? 'var(--teal)' : 'var(--bg)', color: i === 0 ? 'var(--card)' : 'var(--ink2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24 }}><Icon name={o.ic} size={18} style={{ color: 'var(--teal)' }} /></span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{o.n}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{fmt(o.net)}</span>
          </div>
          <div className="note" style={{ margin: '7px 0 7px 36px' }}>{o.d}</div>
          <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink3)', marginLeft: 36, flexWrap: 'wrap' }}>
            <span>Gross {o.rate}%</span><span>Post-tax {o.effRate.toFixed(2)}%</span>
            <span className={`pill ${o.liquid ? 'pill-ok' : 'pill-bad'}`} style={{ fontSize: 10 }}>{o.liquid ? 'Liquid' : 'Locked'}</span>
            <span>Risk: {o.risk}</span>
          </div>
          <div className="bar" style={{ height: 6, margin: '9px 0 0 36px' }}>
            <div className="bar-fill" style={{ width: `${((o.net / maxNet) * 100).toFixed(0)}%`, background: i === 0 ? 'var(--teal)' : 'var(--hair)' }} />
          </div>
        </div>
      ))}

      <div className="card" style={{ background: 'var(--gold-bg)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Keep in mind</div>
        <div className="note">Returns are indicative category averages as of mid-2026 — actual fund and FD rates vary, so compare before committing. Arbitrage funds enjoy equity taxation (20% STCG, 12.5% LTCG beyond the exemption) which beats slab tax for higher earners. Debt funds bought after April 2023 are taxed at your slab with no indexation. Banks deduct TDS on FD interest above ₹50,000 a year. And whatever you choose, keep 3–6 months of expenses in something liquid.</div>
      </div>
      <button className="btn" onClick={onReset}>Try a different amount</button>
    </div>
  );
}
