import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { store, getJSON, setJSON } from '../tools/lib/storage';
import { currentMonth } from '../tools/lib/month';
import { cfmt, currencySym, CURRENCY_CODES } from '../tools/lib/format';
import { BrandLogo } from '../components/BrandLogo';
import ThemeToggle from '../components/ThemeToggle';

/**
 * First-run onboarding — a calm, ~60-second setup that POPULATES the dashboard.
 *
 * It collects only what meaningfully lights up the dashboard, then writes to the
 * exact same localStorage shapes the tools use (fx_bb_data, fx_investmatch,
 * fx_goals, fx_currency) so every figure is real and editable in its tool. No
 * long forms, one decision per step, everything skippable, never a dead end.
 */

type Risk = 'conservative' | 'moderate' | 'aggressive';

interface Form {
  code: string;
  income: string;
  savings: string;
  risk: Risk | '';
  goalName: string;
  goalTarget: string;
  goalYears: string;
}

const RISKS: Array<{ v: Risk; l: string; d: string }> = [
  { v: 'conservative', l: 'Conservative', d: 'Safety first, steadier returns' },
  { v: 'moderate', l: 'Moderate', d: 'Balanced growth with some risk' },
  { v: 'aggressive', l: 'Aggressive', d: 'Maximum growth, more ups and downs' },
];

const num = (v: string) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// Steps: 0 income · 1 savings · 2 risk · 3 goal · 4 done. (Welcome is inline on 0.)
const INPUT_STEPS = 4; // steps that count toward the progress bar

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>({
    code: store.get('fx_currency', 'INR') || 'INR',
    income: '', savings: '', risk: '', goalName: '', goalTarget: '', goalYears: '10',
  });
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const sym = currencySym(form.code);
  const income = num(form.income);
  const savings = num(form.savings);
  const savingsRate = income > 0 && savings > 0 ? Math.round((savings / income) * 100) : 0;

  useEffect(() => {
    document.title = 'Welcome — FinatriX';
  }, []);

  // Move focus to the step so screen readers announce it and keyboard users land in place.
  useEffect(() => {
    if (step === 0 || step === 1) firstFieldRef.current?.focus();
    else headingRef.current?.focus();
  }, [step]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  function persist() {
    try {
      if (form.code) store.set('fx_currency', form.code);
      if (income > 0) {
        const cm = currentMonth();
        const bstore = getJSON<Record<string, unknown>>('fx_bb_data', {});
        bstore[cm] = {
          income: String(Math.round(income)),
          n: '50', w: '30', s: '20',
          // Seed the amount set aside into a savings category so the Budget tool
          // and the dashboard's savings rate reflect it (fully editable there).
          vals: savings > 0 ? { emergency: Math.round(savings) } : {},
        };
        setJSON('fx_bb_data', bstore);
      }
      const monthly = savings >= 100 ? Math.round(savings) : income > 0 ? Math.round(income * 0.2) : 0;
      if (form.risk && income > 0 && monthly >= 100) {
        setJSON('fx_investmatch', { a: { age: 28, income: Math.round(income), monthly, risk: form.risk, horizon: '5-10', goal: 'wealth' } });
      }
      const gt = num(form.goalTarget);
      const gy = num(form.goalYears);
      if (form.goalName.trim() && gt >= 1000 && gy > 0) {
        setJSON('fx_goals', { 'gp-name': form.goalName.trim(), 'gp-target': String(Math.round(gt)), 'gp-years': String(Math.round(gy)), 'gp-existing': '0', 'gp-inflate': true });
      }
    } catch {
      /* storage blocked — onboarding still completes for the session */
    }
  }

  function finish() {
    persist();
    setStep(4);
  }

  const canContinue = step === 0 ? income > 0 : true;

  return (
    <div className="fx-onb" role="main">
      <OnbStyles />

      {/* Top bar — logo, theme, and an always-available escape (never trap). */}
      <header className="fx-onb-top">
        <Link to="/" className="fx-onb-brand" aria-label="FinatriX home">
          <BrandLogo size={22} />
          <span>Finatri<span className="fx-gold-text">X</span></span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ThemeToggle />
          <Link to="/tools/dashboard" className="fx-onb-skip">Skip for now</Link>
        </div>
      </header>

      {/* Progress */}
      {step < INPUT_STEPS && (
        <div className="fx-onb-progress" aria-hidden="true">
          {Array.from({ length: INPUT_STEPS }).map((_, i) => (
            <span key={i} className={i <= step ? 'is-on' : ''} />
          ))}
        </div>
      )}

      <div className="fx-onb-stage">
        {/* ── Step 0 · Income ── */}
        {step === 0 && (
          <section className="fx-onb-step" aria-labelledby="onb-t0">
            <span className="fx-onb-eyebrow">Welcome to FinatriX</span>
            <h1 id="onb-t0" tabIndex={-1} ref={headingRef}>Let’s build your money picture.</h1>
            <p className="fx-onb-sub">Answer a few quick questions and your dashboard fills in instantly. About a minute — everything stays on your device.</p>
            <label className="fx-onb-field">
              <span>Monthly income (after tax)</span>
              <div className="fx-onb-amount">
                <span className="fx-onb-sym">{sym}</span>
                <input
                  ref={firstFieldRef}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="50,000"
                  value={form.income}
                  onChange={(e) => set({ income: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canContinue) setStep(1); }}
                  aria-describedby="onb-cur"
                />
                <select id="onb-cur" aria-label="Currency" value={form.code} onChange={(e) => set({ code: e.target.value })}>
                  {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <span className="fx-onb-hint">{form.code} ({sym}) · used across every FinatriX tool</span>
            </label>
          </section>
        )}

        {/* ── Step 1 · Savings ── */}
        {step === 1 && (
          <section className="fx-onb-step" aria-labelledby="onb-t1">
            <span className="fx-onb-eyebrow">Step 2 of 4</span>
            <h1 id="onb-t1" tabIndex={-1} ref={headingRef}>How much do you set aside each month?</h1>
            <p className="fx-onb-sub">Savings, SIPs, anything you keep or invest. A rough number is perfect — you can fine-tune it later.</p>
            <label className="fx-onb-field">
              <span>Monthly savings &amp; investments</span>
              <div className="fx-onb-amount">
                <span className="fx-onb-sym">{sym}</span>
                <input
                  ref={firstFieldRef}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={income > 0 ? String(Math.round(income * 0.2)) : '10,000'}
                  value={form.savings}
                  onChange={(e) => set({ savings: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') setStep(2); }}
                />
              </div>
              <span className="fx-onb-hint">
                {savingsRate > 0
                  ? `That’s ${savingsRate}% of your income${savingsRate >= 20 ? ' — at or above the 20% target 🎯' : ''}`
                  : 'A healthy target is around 20% of income'}
              </span>
            </label>
          </section>
        )}

        {/* ── Step 2 · Risk ── */}
        {step === 2 && (
          <section className="fx-onb-step" aria-labelledby="onb-t2">
            <span className="fx-onb-eyebrow">Step 3 of 4 · optional</span>
            <h1 id="onb-t2" tabIndex={-1} ref={headingRef}>How do you feel about investment risk?</h1>
            <p className="fx-onb-sub">This shapes a starter portfolio in InvestMatch. No wrong answer.</p>
            <div className="fx-onb-choices" role="radiogroup" aria-label="Risk appetite">
              {RISKS.map((r) => (
                <button
                  key={r.v}
                  type="button"
                  role="radio"
                  aria-checked={form.risk === r.v}
                  className={`fx-onb-choice ${form.risk === r.v ? 'is-sel' : ''}`}
                  onClick={() => { set({ risk: r.v }); }}
                >
                  <span className="fx-onb-choice-l">{r.l}</span>
                  <span className="fx-onb-choice-d">{r.d}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Step 3 · Goal ── */}
        {step === 3 && (
          <section className="fx-onb-step" aria-labelledby="onb-t3">
            <span className="fx-onb-eyebrow">Step 4 of 4 · optional</span>
            <h1 id="onb-t3" tabIndex={-1} ref={headingRef}>What are you saving toward?</h1>
            <p className="fx-onb-sub">Name one goal and we’ll track it — and work out the monthly SIP that reaches it.</p>
            <label className="fx-onb-field">
              <span>Goal</span>
              <input className="fx-onb-text" autoComplete="off" placeholder="e.g. House down payment" value={form.goalName} onChange={(e) => set({ goalName: e.target.value })} />
            </label>
            <div className="fx-onb-row">
              <label className="fx-onb-field">
                <span>Target amount</span>
                <div className="fx-onb-amount sm">
                  <span className="fx-onb-sym">{sym}</span>
                  <input inputMode="numeric" autoComplete="off" placeholder="20,00,000" value={form.goalTarget} onChange={(e) => set({ goalTarget: e.target.value })} />
                </div>
              </label>
              <label className="fx-onb-field" style={{ maxWidth: 130 }}>
                <span>In how many years</span>
                <input className="fx-onb-text" inputMode="numeric" autoComplete="off" placeholder="10" value={form.goalYears} onChange={(e) => set({ goalYears: e.target.value })} />
              </label>
            </div>
          </section>
        )}

        {/* ── Step 4 · Done ── */}
        {step === 4 && (
          <section className="fx-onb-step fx-onb-done" aria-labelledby="onb-t4">
            <div className="fx-onb-check" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <h1 id="onb-t4" tabIndex={-1} ref={headingRef}>Your dashboard is ready.</h1>
            <p className="fx-onb-sub">
              {income > 0
                ? `We’ve set up your ${cfmt(income, form.code)}/mo picture${savings > 0 ? ` with a ${savingsRate}% savings rate` : ''}. Explore it, then refine any number in its tool.`
                : 'Jump in and add your numbers whenever you’re ready.'}
            </p>
            <Link to="/tools/dashboard" className="fx-btn-gold fx-onb-cta">
              See my dashboard
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          </section>
        )}
      </div>

      {/* Footer nav */}
      {step < INPUT_STEPS && (
        <nav className="fx-onb-nav" aria-label="Onboarding navigation">
          <button type="button" className="fx-onb-back" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {step >= 2 && (
              <button type="button" className="fx-onb-back" onClick={() => (step === 3 ? finish() : setStep((s) => s + 1))}>
                Skip
              </button>
            )}
            <button
              type="button"
              className="fx-btn-gold fx-onb-next"
              disabled={!canContinue}
              onClick={() => (step === 3 ? finish() : setStep((s) => s + 1))}
            >
              {step === 3 ? 'Finish' : 'Continue'}
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

function OnbStyles() {
  return (
    <style>{`
      .fx-onb { min-height: 100dvh; background: var(--surface-base); color: var(--ink); display: flex; flex-direction: column; padding: 0 20px calc(env(safe-area-inset-bottom, 0) + 20px); }
      .fx-onb-top { display: flex; align-items: center; justify-content: space-between; height: 60px; max-width: 560px; width: 100%; margin: 0 auto; }
      .fx-onb-brand { display: inline-flex; align-items: center; gap: 9px; font-weight: 600; font-size: 15px; letter-spacing: -.01em; color: var(--ink); text-decoration: none; }
      .fx-onb-skip { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); text-decoration: none; transition: color .2s ease; }
      .fx-onb-skip:hover { color: var(--ink); }

      .fx-onb-progress { display: flex; gap: 6px; max-width: 560px; width: 100%; margin: 8px auto 0; }
      .fx-onb-progress > span { height: 4px; flex: 1; border-radius: 980px; background: var(--hairline-2); overflow: hidden; transition: background .35s var(--ease-out); }
      .fx-onb-progress > span.is-on { background: linear-gradient(90deg,#EAD27E,#C9A23C); }

      .fx-onb-stage { flex: 1; display: flex; align-items: center; justify-content: center; max-width: 560px; width: 100%; margin: 0 auto; padding: 24px 0; }
      .fx-onb-step { width: 100%; animation: onbIn .5s var(--ease-standard) both; }
      @keyframes onbIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) { .fx-onb-step { animation: none; } }

      .fx-onb-eyebrow { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .14em; color: var(--accent-text); }
      .fx-onb-step h1 { font-size: clamp(24px, 4.2vw, 33px); font-weight: 700; letter-spacing: -.03em; line-height: 1.1; margin: 12px 0 0; color: var(--ink); outline: none; }
      .fx-onb-sub { font-size: 15px; line-height: 1.6; color: var(--ink-2); margin: 12px 0 26px; max-width: 460px; }

      .fx-onb-field { display: block; margin-bottom: 16px; }
      .fx-onb-field > span { display: block; font-size: 12px; font-weight: 600; letter-spacing: .02em; color: var(--ink-2); margin-bottom: 8px; }
      .fx-onb-hint { display: block; font-size: 12.5px; color: var(--ink-3); margin-top: 9px; font-weight: 400; letter-spacing: 0; }

      .fx-onb-amount { display: flex; align-items: center; gap: 4px; border: 1px solid var(--hairline); background: var(--tile-bg); border-radius: 16px; padding: 4px 8px 4px 16px; transition: border-color .2s ease, box-shadow .2s ease; }
      .fx-onb-amount:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(212,175,55,.14); }
      .fx-onb-amount.sm { border-radius: 12px; padding: 2px 6px 2px 12px; }
      .fx-onb-sym { font-size: 22px; font-weight: 600; color: var(--ink-3); }
      .fx-onb-amount.sm .fx-onb-sym { font-size: 16px; }
      .fx-onb-amount input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font-size: 26px; font-weight: 700; letter-spacing: -.02em; padding: 10px 6px; font-family: inherit; }
      .fx-onb-amount.sm input { font-size: 18px; padding: 9px 4px; }
      .fx-onb-amount select { border: 0; background: var(--surface-2); color: var(--ink-2); font-size: 13px; font-weight: 600; border-radius: 12px; padding: 8px 8px; cursor: pointer; font-family: inherit; }
      .fx-onb-text { width: 100%; border: 1px solid var(--hairline); background: var(--tile-bg); border-radius: 14px; padding: 14px 16px; color: var(--ink); font-size: 16px; font-family: inherit; outline: none; transition: border-color .2s ease, box-shadow .2s ease; }
      .fx-onb-text:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(212,175,55,.14); }
      .fx-onb-row { display: flex; gap: 12px; }
      .fx-onb-row .fx-onb-field { flex: 1; }

      .fx-onb-choices { display: flex; flex-direction: column; gap: 10px; }
      .fx-onb-choice { text-align: left; border: 1px solid var(--hairline); background: var(--tile-bg); border-radius: 16px; padding: 16px 18px; cursor: pointer; transition: border-color .2s ease, background .2s ease, transform .2s var(--ease-out); display: flex; flex-direction: column; gap: 3px; }
      .fx-onb-choice:hover { border-color: var(--btn-ghost-border-hover); transform: translateY(-1px); }
      .fx-onb-choice.is-sel { border-color: var(--accent); background: var(--accent-bg); box-shadow: 0 0 0 3px rgba(212,175,55,.12); }
      .fx-onb-choice-l { font-size: 15.5px; font-weight: 650; color: var(--ink); }
      .fx-onb-choice-d { font-size: 13px; color: var(--ink-2); }

      .fx-onb-nav { display: flex; align-items: center; justify-content: space-between; max-width: 560px; width: 100%; margin: 0 auto; padding: 8px 0 4px; }
      .fx-onb-back { background: none; border: 0; color: var(--ink-3); font-size: 13px; font-weight: 500; cursor: pointer; padding: 10px 6px; transition: color .2s ease; font-family: inherit; }
      .fx-onb-back:hover:not(:disabled) { color: var(--ink); }
      .fx-onb-back:disabled { opacity: 0; pointer-events: none; }
      .fx-onb-next { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 12px; text-transform: uppercase; letter-spacing: .1em; padding: 13px 26px; border-radius: 980px; display: inline-flex; align-items: center; gap: 8px; }
      .fx-onb-next:disabled { opacity: .45; cursor: not-allowed; }

      .fx-onb-done { text-align: center; display: flex; flex-direction: column; align-items: center; }
      .fx-onb-check { width: 62px; height: 62px; border-radius: 50%; display: grid; place-items: center; color: #1a1400; background: linear-gradient(150deg,#F0D779,#C49B2E); box-shadow: 0 14px 40px -12px rgba(212,175,55,.6); margin-bottom: 22px; animation: onbPop .55s var(--ease-spring) both; }
      @keyframes onbPop { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }
      @media (prefers-reduced-motion: reduce) { .fx-onb-check { animation: none; } }
      .fx-onb-done .fx-onb-sub { margin-left: auto; margin-right: auto; }
      .fx-onb-cta { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 12px; text-transform: uppercase; letter-spacing: .1em; padding: 14px 30px; border-radius: 980px; display: inline-flex; align-items: center; gap: 9px; text-decoration: none; }

      @media (max-width: 480px) {
        .fx-onb-row { flex-direction: column; gap: 0; }
        .fx-onb-row .fx-onb-field { max-width: none !important; }
      }
    `}</style>
  );
}
