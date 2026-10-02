import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useToast } from '../ui/Toast';
import { PageHead, ToolFoot } from '../ui/common';
import { getJSON, setJSON } from '../lib/storage';
import {
  IM_Q, IM_RL, computeInvestMatch, questionLabel, questionPlaceholder,
  type ImAnswers, type ImNumQuestion,
} from '../lib/investmatch';
import { useCurrency } from '../CurrencyContext';
import { useMarket } from '../MarketContext';
import { MarketNote } from '../ui/MarketNote';
import { ResultExplainer, type MethodRow } from '../ui/ResultExplainer';
import { Disclosure } from '../ui/Disclosure';
import type { MarketPack } from '../lib/markets';
import { track } from '../../lib/analytics';
import { investAnswerError, investScenarios } from '../lib/comparisonAssist';

interface SavedAnswers { a?: ImAnswers; market?: string; currency?: string; savedAt?: string }

export default function InvestMatchPage() {
  const { notify } = useToast();
  const { cfmt, sym, code } = useCurrency();
  const { market } = useMarket();
  const [saved] = useState(() => getJSON<SavedAnswers>('fx_investmatch', {}));
  const reusable = saved.market === market.id && saved.currency === code && saved.a && !investAnswerError(saved.a);
  const [ans, setAns] = useState<ImAnswers>(() => {
    return { ...market.invest.defaults };
  });
  const [step, setStep] = useState(0);
  const [numDraft, setNumDraft] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = IM_Q[step];

  // Seed the number draft whenever we land on a numeric question.
  useEffect(() => {
    if (q.type === 'num') setNumDraft(String(ans[q.k as keyof ImAnswers]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

  const commitNum = (a: ImAnswers): ImAnswers | null => {
    if (q.type === 'num') {
      const value = Number(numDraft);
      if (!numDraft.trim() || !Number.isFinite(value) || value < q.min || value > (q.max ?? 1e12)) {
        setError(`Enter ${q.max ? `a value from ${q.min} to ${q.max}` : `a value from ${q.min} to 1 trillion`}. Your answer will not be silently changed.`);
        return null;
      }
      setError('');
      return { ...a, [q.k]: value };
    }
    return a;
  };

  const goNext = () => {
    const a = commitNum(ans);
    if (!a) return;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setAns(a);
    if (step < IM_Q.length - 1) setStep(step + 1);
  };
  const goPrev = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    const a = commitNum(ans);
    if (a) setAns(a);
    setError('');
    if (step > 0) setStep(step - 1);
  };
  const pick = (k: string, v: string) => {
    setAns((a) => ({ ...a, [k]: v }));
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      setStep((s) => (s < IM_Q.length - 1 ? s + 1 : s));
    }, 250);
  };

  const build = () => {
    const a = reviewing ? ans : commitNum(ans);
    if (!a) return;
    const problem = investAnswerError(a);
    if (problem) { setError(problem); return; }
    setAns(a);
    const preview = computeInvestMatch(a, market.invest);
    if (preview.tooLow) {
      notify(`Please enter a monthly investment of at least ${cfmt(100)}.`, 'error');
      return;
    }
    setJSON('fx_investmatch', { ...getJSON<SavedAnswers>('fx_investmatch', {}), a, market: market.id, currency: code, savedAt: new Date().toISOString() });
    setShowResult(true);
      // Fired here rather than at `build()` so a submission rejected by the
      // minimum-investment guard above is never counted as a completion.
      track('tool_completed', { tool: 'investmatch', bucket: market.id });
  };

  const reset = () => {
    setShowResult(false);
    setReviewing(false);
    setStep(0);
  };

  if (showResult) {
    return (
      <div className="fx-page">
        <Head market={market} />
        <InvestResult ans={ans} market={market} money={cfmt} onReset={reset} />
        <MarketNote market={market} />
        <ToolFoot>Projections assume historical averages repeat, which is not guaranteed · Built with care by <b>FinatriX</b> · Not financial advice</ToolFoot>
      </div>
    );
  }

  return (
    <div className="fx-page">
      <Head market={market} />
      {step === 0 && !reviewing && reusable && <aside className="card" aria-label="Saved InvestMatch answers">
        <h2 style={{ fontSize: 17, marginTop: 0 }}>Pick up your last illustration</h2>
        <p className="note">Saved in InvestMatch for {market.name}, {code}{saved.savedAt && Number.isFinite(Date.parse(saved.savedAt)) ? ` on ${new Date(saved.savedAt).toLocaleDateString()}` : ''}. Review these figures before reusing them.</p>
        <button className="btn btn-ghost" onClick={() => { setAns({ ...saved.a! }); setReviewing(true); }}>Review saved answers</button>
      </aside>}
      {reviewing ? <div className="card">
        <h2 style={{ fontSize: 18 }}>Review your answers</h2>
        <dl className="fx-method-rows">{IM_Q.map((question) => <div key={question.k}><dt>{questionLabel(question, sym)}</dt><dd>{question.type === 'opt' ? question.opts.find((o) => o.v === ans[question.k as keyof ImAnswers])?.l : String(ans[question.k as keyof ImAnswers])}</dd></div>)}</dl>
        <p className="note">Your income, investment amount and commitments may have changed since you saved this illustration.</p>
        <button className="btn" onClick={build}>Use these answers</button>
        <button className="btn btn-ghost" onClick={() => { setReviewing(false); setNumDraft(String(ans.age)); }}>Edit answers</button>
      </div> : <>
      <div>
        <div className="steps">
          {IM_Q.map((_, i) => (
            <div key={i} className={`sd ${i <= step ? 'on' : ''}`} />
          ))}
        </div>
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)', marginBottom: 8 }}>
            Question {step + 1} of {IM_Q.length}
          </div>
          {/* The question is the visible label for whatever it precedes —
              wire it up rather than leaving the input, or the set of option
              buttons, unnamed. One id serves both branches. */}
          <div id="im-question" style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 18 }}>
            {questionLabel(q, sym)}
          </div>
          {q.type === 'num' ? (
            <>
              <input
                className="fi"
                type="number" step="any"
                id="im-input"
                value={numDraft}
                placeholder={questionPlaceholder(q as ImNumQuestion, market.invest.defaults)}
                min={q.min}
                max={q.max}
                inputMode="decimal"
                aria-labelledby="im-question"
                aria-describedby={error ? 'im-range im-error' : 'im-range'}
                aria-invalid={Boolean(error)}
                autoFocus
                onChange={(e) => { setNumDraft(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { if (step < IM_Q.length - 1) goNext(); else build(); } }}
              />
              <div id="im-range" className="note" style={{ marginTop: 8 }}>
                {q.max != null ? `Between ${q.min} and ${q.max}.` : `${q.min} or more.`}
              </div>
              {q.k === 'monthly' && Number(numDraft) > ans.income && <p className="tip tip-warn">This monthly investment is greater than your entered income. Check that you can fund it after expenses and debt payments.</p>}
            </>
          ) : (
            <div role="group" aria-labelledby="im-question">
              {q.opts.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  className={`opt-card ${ans[q.k as keyof ImAnswers] === o.v ? 'sel' : ''}`}
                  aria-pressed={ans[q.k as keyof ImAnswers] === o.v}
                  onClick={() => pick(q.k, o.v)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit' }}
                >
                  <div className="ol">{o.l}</div>
                  <div className="od">{o.d}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <p id="im-error" role="alert">{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          {step > 0 && <button className="btn btn-ghost" style={{ flex: 1 }} onClick={goPrev}>Back</button>}
          {step < IM_Q.length - 1 ? (
            <button className="btn" style={{ flex: 2 }} onClick={goNext}>Next</button>
          ) : (
            <button className="btn" style={{ flex: 2 }} onClick={build}>
              Show the allocation
            </button>
          )}
        </div>
      </div>
      </>}
      <MarketNote market={market} />
      <ToolFoot>Projections assume historical averages repeat, which is not guaranteed · Built with care by <b>FinatriX</b> · Not financial advice</ToolFoot>
    </div>
  );
}

function Head({ market }: { market: MarketPack }) {
  return (
    <PageHead chip="InvestMatch" chipColor="var(--green)" chipBg="rgba(29,125,70,.09)" icon="invest" title="An allocation, illustrated.">
      Six quick questions. An illustrative split across the instrument classes available in{' '}
      {market.name}, with the horizon-aware risk control most tools skip. It explains a shape —
      it never names a product or tells you what to buy.
    </PageHead>
  );
}

function InvestResult({ ans, market, money, onReset }: {
  ans: ImAnswers; market: MarketPack; money: (n: number) => string; onReset: () => void;
}) {
  const r = computeInvestMatch(ans, market.invest);
  // The horizon guard is the one part of this tool a reader is most likely to
  // be surprised by — they picked "aggressive" and were shown something calmer.
  // Saying so in the explanation is the difference between a tool that looks
  // broken and one that has just taught somebody why horizon outranks appetite.
  const downgraded = r.effRisk !== ans.risk;

  const inputs: MethodRow[] = [
    { label: market.invest.monthlyTerm, value: money(ans.monthly) },
    { label: 'Age', value: String(ans.age) },
    { label: 'Risk appetite chosen', value: IM_RL[ans.risk] },
    { label: 'Horizon', value: `${r.years} years` },
  ];
  const assumptions: MethodRow[] = [
    { label: 'Risk band applied', value: `${IM_RL[r.effRisk]}${downgraded ? ' (capped by horizon)' : ''}` },
    { label: 'Assumed annual return', value: `~${Math.round(r.rate * 100)}%` },
    { label: 'Inflation used for today\u2019s-money figure', value: `${Math.round(market.invest.inflation * 100)}%` },
  ];

  return (
    <div>
      <div className="result-hero-anim" style={{ textAlign: 'center', margin: '8px 0 22px' }}>
        <div style={{ fontSize: 13, color: 'var(--ink2)' }}>An illustrative {IM_RL[r.effRisk]} allocation could reach</div>
        <div className="big-num" style={{ color: 'var(--green)' }}>{money(r.fv)}</div>
        <div className="note">in {r.years} years at ~{Math.round(r.rate * 100)}% p.a. · worth {money(r.realFv)} in today's money</div>
      </div>

      <div className="card">
        <div className="grid3" style={{ textAlign: 'center' }}>
          <div><div style={{ fontSize: 19, fontWeight: 700, color: 'var(--blue)' }}>{money(r.invested)}</div><div className="note">You invest</div></div>
          <div><div style={{ fontSize: 19, fontWeight: 700, color: 'var(--green)' }}>{money(r.gains)}</div><div className="note">You gain</div></div>
          <div><div style={{ fontSize: 19, fontWeight: 700, color: 'var(--gold)' }}>{r.growthPct}%</div><div className="note">Total growth</div></div>
        </div>
      </div>

      <InvestScenarioAssist ans={ans} market={market} money={money} />

      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Illustrative allocation</div>
        <div className="seg-bar">
          {r.alloc.map((a) => <div key={a.n} className="seg" style={{ width: `${a.p}%`, background: a.c }} />)}
        </div>
        {r.alloc.map((a) => (
          <div className="row-line" key={a.n}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.c, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 14 }}>{a.n}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: a.c }}>{a.p}%</div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', minWidth: 80, textAlign: 'right' }}>{money((ans.monthly * a.p) / 100)}/mo</div>
          </div>
        ))}
      </div>

      {r.insights.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>What stands out</div>
          {r.insights.map((i, idx) => <div className="tip tip-info" key={idx}>{i}</div>)}
        </div>
      )}

      <div className="card" style={{ background: 'var(--gold-bg)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Summary</div>
        <div className="note" style={{ lineHeight: 2 }}>
          {market.invest.monthlyTerm}: <b style={{ color: 'var(--ink)' }}>{money(ans.monthly)}</b> · Risk:{' '}
          <b style={{ color: 'var(--ink)' }}>{IM_RL[r.effRisk]}</b> · Horizon:{' '}
          <b style={{ color: 'var(--ink)' }}>{r.years} years</b> · Assumed return:{' '}
          <b style={{ color: 'var(--ink)' }}>~{Math.round(r.rate * 100)}% a year</b>
        </div>
      </div>

      <ResultExplainer
        toolId="investmatch"
        market={market}
        inputs={inputs}
        assumptions={assumptions}
        meaning={
          <>
            {downgraded ? (
              <>You asked for {IM_RL[ans.risk]} exposure, but a {r.years}-year horizon is short enough that
                the split shown is the {IM_RL[r.effRisk]} one instead — over that period a fall has less time
                to recover than it needs. </>
            ) : (
              <>Answers like yours describe a {IM_RL[r.effRisk]} appetite, and the split above is what that
                shape of allocation conventionally looks like. </>
            )}
            At an assumed {Math.round(r.rate * 100)}% a year, {money(ans.monthly)} a month for {r.years} years
            reaches {money(r.fv)} — worth {money(r.realFv)} in today&rsquo;s money once inflation is taken
            out. The return is an assumption, not a promise: real markets deliver that average through years
            well above and well below it, and the order those years arrive in changes the outcome.
          </>
        }
      />

      <button className="btn" onClick={onReset}>Recalculate</button>
    </div>
  );
}

function InvestScenarioAssist({ ans, market, money }: { ans: ImAnswers; market: MarketPack; money: (n: number) => string }) {
  const scenarios = investScenarios(ans, market.invest);
  const [preview, setPreview] = useState<ImAnswers>(ans);
  const result = computeInvestMatch(preview, market.invest);
  const baseline = computeInvestMatch(ans, market.invest);
  const emergency = ans.goal === 'emergency';
  return <section className="card" aria-labelledby="im-smart-title">
    <h2 id="im-smart-title" style={{ fontSize: 18, marginTop: 0 }}>Explore what changes the outcome</h2>
    <p className="note">These scenarios reuse this calculator and the same market assumptions. Each changes one input; your saved answers stay as entered. Returns are illustrative, before fees and taxes.</p>
    {/* A what-if explorer under the answer, so one press away rather than in
        front of the allocation it is a variation on. */}
    <Disclosure variant="inline" showLabel="Show the scenario explorer" hideLabel="Hide the scenario explorer">
    <h3 style={{ fontSize: 14 }}>Change the monthly contribution</h3>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {scenarios.contributions.map((s) => <button key={s.factor} type="button" className="btn btn-ghost btn-sm"
        aria-pressed={preview.monthly === s.monthly && preview.horizon === ans.horizon}
        onClick={() => setPreview({ ...ans, monthly: s.monthly })}>{s.factor === 1 ? 'Current' : s.factor < 1 ? '20% less' : '20% more'} · {money(s.monthly)}/mo</button>)}
    </div>
    <h3 style={{ fontSize: 14 }}>Change the time horizon</h3>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {scenarios.horizons.map((s) => <button key={s.horizon} type="button" className="btn btn-ghost btn-sm"
        aria-pressed={preview.horizon === s.horizon && preview.monthly === ans.monthly}
        onClick={() => setPreview({ ...ans, horizon: s.horizon })}>{s.result.years} years · {IM_RL[s.result.effRisk]}</button>)}
    </div>
    <div role="status" style={{ marginTop: 18 }}>
      <p><b>{money(result.fv)}</b> illustrated future value from {money(preview.monthly)}/month over {result.years} years. {money(result.invested)} contributed; {money(result.realFv)} in today’s money.</p>
      <p className="note">{result.fv === baseline.fv ? 'Your current illustration.' : `${money(Math.abs(result.fv - baseline.fv))} ${result.fv > baseline.fv ? 'more' : 'less'} than your original illustration.`} Applied risk: {IM_RL[result.effRisk]}; assumed return {(result.rate * 100).toFixed(1)}% a year. {result.riskNote}</p>
      {preview.monthly > ans.income && <p className="tip tip-warn">This scenario exceeds your monthly income. It is a mathematical illustration, not an affordability recommendation.</p>}
    </div>
    </Disclosure>
    {/* The next step stays visible: it answers "what now?". */}
    <div className="tip tip-info">{emergency ? 'You chose an emergency fund. An investment allocation can fluctuate and is not a substitute for accessible cash.' : ans.goal === 'house' || ans.goal === 'retirement' ? 'Turn this illustration into a goal with an amount, deadline and existing savings.' : 'Before increasing a contribution, check the amount left after essentials, debt payments and your cash buffer.'}</div>
    <Link className="btn btn-ghost btn-sm" to={emergency ? '/tools/parksmart' : ans.goal === 'house' || ans.goal === 'retirement' ? '/tools/goals' : '/tools/budget'}>{emergency ? 'Compare accessible cash' : ans.goal === 'house' || ans.goal === 'retirement' ? 'Plan this goal' : 'Check my monthly budget'}</Link>
  </section>;
}
