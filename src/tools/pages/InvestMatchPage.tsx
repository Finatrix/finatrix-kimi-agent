import { useEffect, useRef, useState } from 'react';
import { useToast } from '../ui/Toast';
import { PageHead, ToolFoot } from '../ui/common';
import { getJSON, setJSON } from '../lib/storage';
import { fmt } from '../lib/format';
import {
  IM_Q, IM_RL, IM_DEFAULTS, computeInvestMatch, clampAnswer,
  type ImAnswers, type ImNumQuestion,
} from '../lib/investmatch';

export default function InvestMatchPage() {
  const { notify } = useToast();
  const [ans, setAns] = useState<ImAnswers>(() => {
    const saved = getJSON<{ a?: Partial<ImAnswers> }>('fx_investmatch', {});
    return { ...IM_DEFAULTS, ...(saved.a || {}) };
  });
  const [step, setStep] = useState(0);
  const [numDraft, setNumDraft] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [building, setBuilding] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = IM_Q[step];

  // Seed the number draft whenever we land on a numeric question.
  useEffect(() => {
    if (q.type === 'num') setNumDraft(String(ans[q.k as keyof ImAnswers]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Persist answers (fx_investmatch shape preserved: { a: answers }).
  useEffect(() => { setJSON('fx_investmatch', { a: ans }); }, [ans]);

  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);

  const commitNum = (a: ImAnswers): ImAnswers => {
    if (q.type === 'num') {
      return { ...a, [q.k]: clampAnswer(q as ImNumQuestion, numDraft) };
    }
    return a;
  };

  const goNext = () => {
    const a = commitNum(ans);
    setAns(a);
    if (step < IM_Q.length - 1) setStep(step + 1);
  };
  const goPrev = () => {
    const a = commitNum(ans);
    setAns(a);
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
    const a = commitNum(ans);
    setAns(a);
    const preview = computeInvestMatch(a);
    if (preview.tooLow) {
      notify('Please enter a monthly investment of at least ₹100.', 'error');
      return;
    }
    setBuilding(true);
    setTimeout(() => {
      setBuilding(false);
      setShowResult(true);
    }, 500);
  };

  const reset = () => {
    setShowResult(false);
    setStep(0);
  };

  if (showResult) {
    return (
      <div className="fx-page">
        <Head />
        <InvestResult ans={ans} onReset={reset} />
        <ToolFoot>Projections use historical averages · Built with care by <b>FinatriX</b> · Not financial advice</ToolFoot>
      </div>
    );
  }

  return (
    <div className="fx-page">
      <Head />
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
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 18 }}>{q.t}</div>
          {q.type === 'num' ? (
            <input
              className="fi"
              type="number" step="any"
              id="im-input"
              value={numDraft}
              placeholder={q.ph}
              min={q.min}
              max={q.max}
              inputMode="decimal"
              autoFocus
              onChange={(e) => setNumDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { if (step < IM_Q.length - 1) goNext(); else build(); } }}
            />
          ) : (
            q.opts.map((o) => (
              <div key={o.v} className={`opt-card ${ans[q.k as keyof ImAnswers] === o.v ? 'sel' : ''}`} onClick={() => pick(q.k, o.v)}>
                <div className="ol">{o.l}</div>
                <div className="od">{o.d}</div>
              </div>
            ))
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {step > 0 && <button className="btn btn-ghost" style={{ flex: 1 }} onClick={goPrev}>Back</button>}
          {step < IM_Q.length - 1 ? (
            <button className="btn" style={{ flex: 2 }} onClick={goNext}>Next</button>
          ) : (
            <button className={`btn ${building ? 'btn-loading' : ''}`} style={{ flex: 2 }} disabled={building} onClick={build}>
              {building ? 'Building portfolio…' : 'Build my portfolio'}
            </button>
          )}
        </div>
      </div>
      <ToolFoot>Projections use historical averages · Built with care by <b>FinatriX</b> · Not financial advice</ToolFoot>
    </div>
  );
}

function Head() {
  return (
    <PageHead chip="InvestMatch" chipColor="var(--green)" chipBg="rgba(29,125,70,.09)" icon="invest" title="A portfolio shaped to you.">
      Six quick questions. One personalised allocation across Indian instruments — with horizon-aware
      risk control most tools skip.
    </PageHead>
  );
}

function InvestResult({ ans, onReset }: { ans: ImAnswers; onReset: () => void }) {
  const r = computeInvestMatch(ans);
  return (
    <div>
      <div className="result-hero-anim" style={{ textAlign: 'center', margin: '8px 0 22px' }}>
        <div style={{ fontSize: 13, color: 'var(--ink2)' }}>Your {IM_RL[r.effRisk]} portfolio could grow to</div>
        <div className="big-num" style={{ color: 'var(--green)' }}>{fmt(r.fv)}</div>
        <div className="note">in {r.years} years at ~{Math.round(r.rate * 100)}% p.a. · worth {fmt(r.realFv)} in today's money</div>
      </div>

      <div className="card">
        <div className="grid3" style={{ textAlign: 'center' }}>
          <div><div style={{ fontSize: 19, fontWeight: 700, color: 'var(--blue)' }}>{fmt(r.invested)}</div><div className="note">You invest</div></div>
          <div><div style={{ fontSize: 19, fontWeight: 700, color: 'var(--green)' }}>{fmt(r.gains)}</div><div className="note">You gain</div></div>
          <div><div style={{ fontSize: 19, fontWeight: 700, color: 'var(--gold)' }}>{r.growthPct}%</div><div className="note">Total growth</div></div>
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Recommended allocation</div>
        <div className="seg-bar">
          {r.alloc.map((a) => <div key={a.n} className="seg" style={{ width: `${a.p}%`, background: a.c }} />)}
        </div>
        {r.alloc.map((a) => (
          <div className="row-line" key={a.n}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.c, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 14 }}>{a.n}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: a.c }}>{a.p}%</div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', minWidth: 80, textAlign: 'right' }}>{fmt((ans.monthly * a.p) / 100)}/mo</div>
          </div>
        ))}
      </div>

      {r.insights.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Smart insights</div>
          {r.insights.map((i, idx) => <div className="tip tip-info" key={idx}>{i}</div>)}
        </div>
      )}

      <div className="card" style={{ background: 'var(--gold-bg)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Summary</div>
        <div className="note" style={{ lineHeight: 2 }}>
          Monthly SIP: <b style={{ color: 'var(--ink)' }}>{fmt(ans.monthly)}</b> · Risk:{' '}
          <b style={{ color: 'var(--ink)' }}>{IM_RL[r.effRisk]}</b> · Horizon:{' '}
          <b style={{ color: 'var(--ink)' }}>{r.years} years</b> · Expected CAGR:{' '}
          <b style={{ color: 'var(--ink)' }}>~{Math.round(r.rate * 100)}%</b>
        </div>
      </div>
      <button className="btn" onClick={onReset}>Recalculate</button>
    </div>
  );
}
