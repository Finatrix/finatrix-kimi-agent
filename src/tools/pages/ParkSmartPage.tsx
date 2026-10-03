import { useState } from 'react';
import { useToast } from '../ui/Toast';
import { AmountInput } from '../ui/AmountInput';
import { PercentField } from '../ui/MoneyField';
import { plainAmount } from '../lib/formula';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { cfmtSh } from '../lib/format';
import { getJSON, setJSON } from '../lib/storage';
import { PS_DL, PS_M, type ParkResult, type ParkOption, type ParkInstruments } from '../lib/parksmart';
import { useCurrency } from '../CurrencyContext';
import { useMarket } from '../MarketContext';
import type { MarketPack } from '../lib/markets';
import { MarketNote } from '../ui/MarketNote';
import { DepositProtectionNote } from '../ui/ReferenceDisclosure';
import { ResultExplainer, type MethodRow } from '../ui/ResultExplainer';
import { Disclosure } from '../ui/Disclosure';
import { track } from '../../lib/analytics';
import { safeParkComparison } from '../lib/comparisonAssist';

interface Saved { 'ps-amount'?: string; 'ps-duration'?: string; 'ps-slab'?: string; market?: string; currency?: string }

export default function ParkSmartPage() {
  const { notify } = useToast();
  const { cfmt, code, sym } = useCurrency();
  const { market } = useMarket();
  const park = market.park;
  const enteredRates = park.inputMode === 'net-rates';
  // Rates never cross market/currency boundaries and blank is not a zero yield.
  const [quoteRates, setQuoteRates] = useState(['', '']);
  const [quoteAccess, setQuoteAccess] = useState([true, true]);
  const [quoteNames, setQuoteNames] = useState(['', '']);
  const [liquidOnly, setLiquidOnly] = useState(false);
  const [saved] = useState(() => getJSON<Saved>('fx_parksmart', {}));
  const [amount, setAmount] = useState(String(park.quickAmounts[1] ?? park.minAmount));
  const [dur, setDur] = useState('3-6');
  // The market's own default, not a hard-coded 20%: the UAE offers only 0% and
  // the US brackets do not include 20 at all. India's stays 20, so an existing
  // user's first ranking is unchanged.
  const defaultRate = String(park.defaultRate);
  const [slab, setSlab] = useState(defaultRate);
  const [result, setResult] = useState<ParkResult | null>(null);
  const [resultPack, setResultPack] = useState<ParkInstruments>(park);

  // The amount field accepts arithmetic; everything that reads it — the checks
  // below, the result view and the dashboard reading the save — sees the plain
  // number it means. See plainAmount.
  const amountPlain = plainAmount(amount);

  const persist = (next: Partial<Saved>) => {
    setJSON('fx_parksmart', { 'ps-amount': amountPlain, 'ps-duration': dur, 'ps-slab': slab, market: market.id, currency: code, ...next });
  };

  // A rate stored under a previous market may not exist in this one (30% is an
  // Indian slab, not a US bracket). Falling back keeps the select controlled.
  const rate = park.rateOptions.some((o) => String(o.value) === slab) ? slab : defaultRate;

  const submit = () => {
    const amt = Math.max(0, Number(amountPlain) || 0);
    if (!Number.isFinite(Number(amountPlain)) || amt < park.minAmount || amt > 1e12) {
      notify(`Please enter at least ${cfmt(park.minAmount)}.`, 'error');
      return;
    }
    let options = park.options;
    if (enteredRates) {
      if (quoteRates.some((v) => !v.trim() || !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 100)) {
        notify('Enter both annual net rates, from 0% to 100%. A blank rate is not zero.', 'error');
        return;
      }
      if (dur === '0-1' && !quoteAccess.some(Boolean)) {
        notify('For under one month, include an option you can access immediately.', 'error');
        return;
      }
      options = quoteRates.map((value, i): ParkOption => ({
        n: quoteNames[i].trim() ? `${quoteNames[i].trim()} (option ${i + 1})` : `Your option ${i + 1}`, rate: Number(value), tax: 'enteredNet',
        liquid: quoteAccess[i], minM: 0, risk: 'Check provider terms', ic: 'bank',
        d: `Your entered annual net rate. ${quoteAccess[i] ? 'You marked this accessible without notice.' : 'You marked this subject to access restrictions.'} Confirm it is available for the selected duration.`,
      }));
    }
    const pack = { ...park, options };
    const comparison = safeParkComparison(amt, dur, enteredRates ? 0 : Number(rate) / 100, pack, liquidOnly);
    if (!comparison) { notify('No options match this duration and access preference. Include an accessible option or change the preference.', 'error'); return; }
    setResultPack(pack);
    setResult(comparison);
    track('tool_completed', { tool: 'parksmart', bucket: market.id });
  };

  return (
    <div className="fx-page">
      <PageHead chip="ParkSmart" chipColor="var(--teal)" chipBg="rgba(12,128,121,.09)" icon="bank" title="Idle money shouldn't idle.">
        {enteredRates ? `Compare two cash options in ${market.name} using rates you enter after taxes and fees. No bank rate or tax exemption is assumed.` : <>Compare what idle cash actually earns after tax across {park.options.length} parking options in {market.name} — tuned to your duration, your tax rate and current rules.</>}
      </PageHead>

      {!result ? (
        <div className="card">
          {saved.market === market.id && saved.currency === code && Number.isFinite(Number(saved['ps-amount'])) && Number(saved['ps-amount']) >= park.minAmount && Number(saved['ps-amount']) <= 1e12 && <div className="well" style={{ marginBottom: 18 }}>
            <p className="note">Your saved ParkSmart amount for {market.name}, {code}: {cfmt(Number(saved['ps-amount']))}. Rates must be checked again.</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAmount(saved['ps-amount']!); if (saved['ps-duration'] && Object.hasOwn(PS_M, saved['ps-duration'])) setDur(saved['ps-duration']); }}>Use saved amount and duration</button>
          </div>}
          <div className="fg">
            <label className="fl" htmlFor="ps-amount">Amount to park ({sym})</label>
            <AmountInput id="ps-amount" sym={sym} placeholder="" value={amount}
              onChange={(v) => { setAmount(v); persist({ 'ps-amount': plainAmount(v) }); }} />
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
              {!enteredRates && <><label className="fl" htmlFor="ps-slab">{park.rateLabel}</label>
              <select className="fs" id="ps-slab" value={rate} onChange={(e) => { setSlab(e.target.value); persist({ 'ps-slab': e.target.value }); }}>
                {park.rateOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select></>}
              <p className="note" style={{ marginTop: 6 }}>{park.taxNote}</p>
            </div>
          </div>
          {enteredRates && <div className="grid2">
            {quoteRates.map((value, i) => <fieldset key={i} className="fg" style={{ border: '1px solid var(--hair2)', borderRadius: 12, padding: 16, minWidth: 0 }}>
              <legend>Your option {i + 1}</legend>
              <label className="fl" htmlFor={`ps-name-${i}`}>Option {i + 1} name (optional)</label>
              <input id={`ps-name-${i}`} className="fi" type="text" maxLength={60} value={quoteNames[i]} placeholder="e.g. My savings account"
                onChange={(e) => setQuoteNames((prev) => prev.map((v, j) => j === i ? e.target.value : v))} />
              <label className="fl" htmlFor={`ps-quote-${i}`}>Annual net rate for option {i + 1} (%)</label>
              <PercentField id={`ps-quote-${i}`} value={value}
                onChange={(next) => setQuoteRates((prev) => prev.map((v, j) => j === i ? next : v))} />
              <label className="fl" htmlFor={`ps-access-${i}`}>Access for option {i + 1}</label>
              <select id={`ps-access-${i}`} className="fs" value={String(quoteAccess[i])}
                onChange={(e) => setQuoteAccess((prev) => prev.map((v, j) => j === i ? e.target.value === 'true' : v))}>
                <option value="true">Available without notice</option>
                <option value="false">Restricted access or notice required</option>
              </select>
            </fieldset>)}
          </div>}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, marginBottom: 12 }}>
            <input type="checkbox" checked={liquidOnly} onChange={(e) => setLiquidOnly(e.target.checked)} />
            Only compare options marked liquid / accessible
          </label>
          <p className="note">Liquid does not always mean instant. Check settlement times, withdrawal limits and provider terms before relying on an option for emergencies.</p>
          <button className="btn" onClick={submit}>
            Compare the options
          </button>
        </div>
      ) : (
        <ParkResultView
          result={result}
          pack={resultPack}
          liquidOnly={liquidOnly}
          amount={Math.max(0, Number(amountPlain) || 0)}
          dur={dur}
          rate={enteredRates ? 0 : Number(rate)}
          market={market}
          money={cfmt}
          currency={code}
          keepInMind={park.keepInMind}
          onReset={() => setResult(null)}
        />
      )}

      <MarketNote market={market} />
      <ToolFoot>Built with care by <b>FinatriX</b> · Not financial advice</ToolFoot>
    </div>
  );
}

function ParkScenarioAssist({ result, pack, liquidOnly, amount, dur, rate, money, enteredRates }: {
  result: ParkResult; pack: ParkInstruments; liquidOnly: boolean; amount: number; dur: string; rate: number;
  money: (n: number) => string; enteredRates: boolean;
}) {
  const [selectedDuration, setSelectedDuration] = useState(dur);
  const [alternative, setAlternative] = useState(result.ranked[1]?.n ?? result.best?.n ?? '');
  const scenario = safeParkComparison(amount, selectedDuration, rate / 100, pack, liquidOnly);
  const other = result.ranked.find((o) => o.n === alternative);
  const accessible = result.ranked.find((o) => o.liquid);
  const best = result.best!;
  return <section className="card" aria-labelledby="ps-smart-title">
    <h2 id="ps-smart-title" style={{ fontSize: 18, marginTop: 0 }}>Make the trade-offs visible</h2>
    <p className="note">{liquidOnly ? 'Only options marked liquid / accessible are included.' : 'Both liquid and restricted-access options are included.'} This ranking compares modeled earnings; it does not assess provider safety or suitability.</p>
    {/* The explorer is a second tool under the answer; the ranking below is
        the answer. Collapsed, it no longer pushes the ranked list ~650px
        down a phone screen. */}
    <Disclosure variant="inline" showLabel="Show the comparison tools" hideLabel="Hide the comparison tools">
    <label className="fl" htmlFor="ps-alternative">Compare the leader with</label>
    <select id="ps-alternative" className="fs" value={alternative} onChange={(e) => setAlternative(e.target.value)}>
      {result.ranked.map((o) => <option key={o.n} value={o.n}>{o.n}</option>)}
    </select>
    {other && <div role="status"><p>{best.n} earns {money(best.net)}; {other.n} earns {money(other.net)} over the selected period. The modeled difference is <b>{money(best.net - other.net)}</b>.</p>
      <p className="note">Access: {best.liquid ? 'liquid' : 'restricted'} versus {other.liquid ? 'liquid' : 'restricted'}. Risk labels: {best.risk} versus {other.risk}. {enteredRates ? 'Both rates were entered by you after taxes and fees.' : `Modeled tax difference: ${money((best.gross - best.net) - (other.gross - other.net))}. Provider charges or exit penalties may reduce actual earnings.`}</p></div>}
    <h3 style={{ fontSize: 14 }}>What if you need the money sooner?</h3>
    <label className="fl" htmlFor="ps-scenario-duration">Explore another holding period</label>
    <select id="ps-scenario-duration" className="fs" value={selectedDuration} onChange={(e) => setSelectedDuration(e.target.value)}>
      {Object.entries(PS_DL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
    <div role="status">
      {scenario?.best ? <p><b>{scenario.best.n}</b> leads with {money(scenario.best.net)} modeled earnings over {PS_M[selectedDuration]} months, the representative period used for “{PS_DL[selectedDuration]}”. {scenario.ranked.length} eligible options.</p> : <p>No supplied options match this holding period and access preference.</p>}
    </div>
    <p className="note">The same entered amount, rates and tax model are used. Rates are not forecasts for a different term. Recheck quoted rates, minimum term and access conditions before acting.</p>
    </Disclosure>
    {/* Outside the toggle: whether the leader can be reached in a hurry is a
        caveat on the answer itself, not part of the explorer. */}
    <div className="tip tip-info">{!best.liquid && accessible ? `Keeping the full amount in ${accessible.n}, the highest-earning liquid option here, reduces modeled earnings by ${money(best.net - accessible.net)} over your selected period. Decide whether access is worth that difference.` : best.liquid ? 'The highest-earning eligible option is marked liquid. Confirm how quickly withdrawals reach your bank and whether any limits apply.' : 'All eligible options have restricted access. If this is emergency money, add an accessible option before relying on the comparison.'}</div>
  </section>;
}

function ParkResultView({ result, pack, liquidOnly, amount, dur, rate, market, money, currency, keepInMind, onReset }: {
  result: ParkResult; amount: number; dur: string; rate: number; market: MarketPack;
  pack: ParkInstruments; liquidOnly: boolean;
  money: (n: number) => string;
  /** The display currency, so a statutory limit is only compared like for like. */
  currency: string;
  keepInMind: string; onReset: () => void;
}) {
  const { ranked, best, maxNet, split } = result;
  const enteredRates = market.park.inputMode === 'net-rates';
  if (!best) return null;

  // The runner-up, so the "what this means" line can say how much the ranking
  // is actually worth. A gap of a few hundred rupees over six months is a
  // different decision from a gap of several thousand, and the number is the
  // only honest way to say which one this is.
  const runnerUp = ranked[1];
  const gap = runnerUp ? best.net - runnerUp.net : 0;

  const inputs: MethodRow[] = [
    { label: 'Amount', value: money(amount) },
    { label: 'Duration', value: PS_DL[dur] },
    { label: market.park.rateLabel, value: `${rate}%` },
  ];
  const assumptions: MethodRow[] = [
    { label: 'Options compared', value: String(ranked.length) },
    { label: enteredRates ? 'Entered annual net rates' : 'Gross rate range', value: `${Math.min(...ranked.map((o) => o.rate))}–${Math.max(...ranked.map((o) => o.rate))}%` },
    { label: 'Tax treatment', value: market.park.taxNote },
  ];

  return (
    <div>
      <div className="card result-hero-anim" style={{ background: 'linear-gradient(135deg,rgba(20,184,166,.16),rgba(13,13,15,.86) 62%)' }}>
        <span className="pill" style={{ background: 'rgba(12,128,121,.12)', color: 'var(--teal)' }}>{enteredRates ? 'Highest modeled earnings from your inputs' : 'Highest post-tax return'}</span>
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

      <ParkScenarioAssist result={result} pack={pack} liquidOnly={liquidOnly} amount={amount} dur={dur} rate={rate} money={money} enteredRates={enteredRates} />

      {split && (
        <div className="card" style={{ background: 'rgba(12,128,121,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', marginBottom: 8 }}>One way to split it</div>
          <div className="note" style={{ lineHeight: 1.8 }}>
            {split.bestName} locks your money up. Splitting it — <b style={{ color: 'var(--ink)' }}>{money(split.core)}</b> in {split.bestName}{' '}
            and <b style={{ color: 'var(--ink)' }}>{money(split.buf)}</b> in {split.bestLiquidName} — trades a little return for keeping 30%
            reachable. Which side of that trade suits you depends on how likely you are to need the money.
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
            <span>{enteredRates ? 'Entered net' : 'Gross'} {o.rate}%</span><span>Post-tax {o.effRate.toFixed(2)}%</span>
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

      {/* On the page rather than inside the methodology drawer, because the
          protection limit bears directly on where a large balance should sit —
          it is part of the answer, not background to it. Reads from the
          reference registry, so the figure carries its own effective date and
          a market with no verified scheme says so instead of showing a number. */}
      <DepositProtectionNote market={market.id} amount={amount} amountCurrency={currency} />

      <ResultExplainer
        toolId="parksmart"
        market={market}
        subject={{ amount, currency }}
        inputs={inputs}
        assumptions={assumptions}
        meaning={
          <>
            On {money(amount)} held for {PS_DL[dur]} {enteredRates ? 'using your entered net rates' : `at a ${rate}% marginal rate`}, {best.n} keeps the most
            after tax — {money(best.net)}, an effective {best.effRate.toFixed(2)}%.
            {runnerUp && gap > 0 ? (
              <> That is {money(gap)} more than {runnerUp.n}, which is {runnerUp.liquid ? 'liquid' : 'locked'} where
                this one is {best.liquid ? 'liquid' : 'locked'} — so the ranking is a return comparison, not a
                verdict on which suits you.</>
            ) : (
              <> The options are close enough that liquidity and effort matter more than the return gap.</>
            )}{' '}
            Rates move and the ranking moves with them.
          </>
        }
      />

      <button className="btn" onClick={onReset}>Try a different amount</button>
    </div>
  );
}
