import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { useTheme } from '../../context/ThemeContext';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { getChartTheme } from '../lib/chartTheme';
import { useCurrency } from '../CurrencyContext';
import { PageHead, ToolFoot } from '../ui/common';
import { AmountInput } from '../ui/AmountInput';
import { plainAmount } from '../lib/formula';
import { ResultExplainer, type MethodRow } from '../ui/ResultExplainer';
import { MarketNote } from '../ui/MarketNote';
import { useMarket } from '../MarketContext';
import { lifeMapDecisionsForMarket } from '../lib/markets/lifeMapPresentation';
import { readLifeMapSeed, type LifeMapSeed } from '../lib/lifemapSeed';
import type { MarketPack } from '../lib/markets';
import { Icon } from '../ui/Icon';
import { getJSON, setJSON } from '../lib/storage';
import {
  LM_GOALS, LM_MILESTONES, LM_CATS, LM_HEALTH_CATS, LM_CAREER_BOOST,
  buildDecisions, buildProfile, updateCustomDecision,
  calcWealth, calcScore, calcHealth,
  type LifeProfile, type Decision,
} from '../lib/lifemap';
import { track } from '../../lib/analytics';
import { lifeMapReadiness } from '../lib/planningAutomation';
import { LifeMapSmartAssist } from '../ui/LifeMapSmartAssist';

const CAREERS: [string, string][] = [
  ['tech', 'Technology / IT'], ['finance', 'Finance / Banking'], ['health', 'Healthcare / Pharma'],
  ['creative', 'Creative / Media'], ['govt', 'Government / public sector'], ['startup', 'Startup / Entrepreneur'],
  ['engineering', 'Engineering / Manufacturing'], ['education', 'Education / Teaching'], ['law', 'Law / Legal'],
  ['consulting', 'Consulting / Strategy'], ['sales', 'Sales / Marketing'], ['design', 'Design / Architecture'],
  ['science', 'Science / Research'], ['hospitality', 'Hospitality / Tourism'], ['agriculture', 'Agriculture / Farming'],
  ['retail', 'Retail / E-commerce'], ['defence', 'Defence / Armed Forces'], ['sports', 'Sports / Fitness'],
  ['freelance', 'Freelance / Gig'], ['other', 'Other'],
];
const SCORE_TITLES = ['Just starting', 'Building base', 'On track', 'Strong foundation', 'Wealth builder', 'Financial pro'];

type Form = Record<string, string>;
const FORM_DEFAULTS: Form = {
  'lm-name': '', 'lm-age': '22', 'lm-income': '35000', 'lm-expenses': '22000',
  'lm-savings': '150000', 'lm-emergency': '60000', 'lm-invest': '50000',
  'lm-sip-yn': 'no', 'lm-sip': '3000', 'lm-debt-yn': 'no', 'lm-debt-total': '0', 'lm-debt-emi': '0', 'lm-career': 'tech',
};
const numF = (v: string) => { const n = Number(v); return isFinite(n) ? Math.max(0, n) : 0; };

/** The profile's money fields, which accept arithmetic. */
const MONEY_KEYS = ['lm-income', 'lm-expenses', 'lm-savings', 'lm-emergency', 'lm-invest', 'lm-sip', 'lm-debt-total', 'lm-debt-emi'] as const;

/**
 * The form with every money field reduced to its plain number (see
 * plainAmount). The readiness checks, the profile and the save all read this,
 * so they see exactly the strings they did before the fields took formulas —
 * and the dashboard, which rebuilds a profile from `fx_lifemap`, never meets one.
 */
function resolveAmounts(form: Form): Form {
  const out = { ...form };
  for (const k of MONEY_KEYS) if (typeof out[k] === 'string') out[k] = plainAmount(out[k]);
  return out;
}

export default function LifeMapPage() {
  const { cfmt, cfmtSh, code, sym } = useCurrency();
  const { market } = useMarket();
  // Read once, before the first paint. Order matters: FinatriX's own records
  // beat the placeholder defaults, and anything the user has typed into LifeMap
  // before beats both — a seeded figure is a head start, never an overwrite.
  const [seed, setSeed] = useState<LifeMapSeed>(() => {
    const fresh = readLifeMapSeed();
    const saved = getJSON<Form>('fx_lifemap', {});
    const sources = Object.fromEntries(Object.entries(fresh.sources).filter(([key]) => saved[key] === undefined));
    return { ...fresh, sources, from: fresh.from.filter((source) => Object.values(sources).includes(source)) };
  });
  const [form, setForm] = useState<Form>(() => ({
    ...FORM_DEFAULTS, ...(market.planningNote ? { 'lm-income': String(market.invest.defaults.income), 'lm-expenses': '', 'lm-savings': '', 'lm-emergency': '', 'lm-invest': '', 'lm-sip': '' } : {}), ...seed.values, ...getJSON<Form>('fx_lifemap', {}),
  }));
  const [goals, setGoals] = useState<Set<string>>(new Set(['home']));
  const [profile, setProfile] = useState<LifeProfile | null>(null);
  const [dec, setDec] = useState<Decision[]>([]);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [currentAge, setCurrentAge] = useState(22);
  const [cat, setCat] = useState('invest');
  const [dialog, setDialog] = useState<{ d: Decision; amt: string } | null>(null);

  const setField = (k: string, v: string) => {
    const next = { ...form, [k]: v };
    setForm(next);
    setJSON('fx_lifemap', resolveAmounts(next));
    if (seed.sources[k]) {
      const sources = { ...seed.sources };
      delete sources[k];
      setSeed({ ...seed, sources, from: seed.from.filter((source) => Object.values(sources).includes(source)) });
    }
  };

  const launch = () => {
    const v = resolveAmounts(form);
    if (lifeMapReadiness(v).length) return;
      const p = buildProfile({
        name: v['lm-name'], age: numF(v['lm-age']), income: numF(v['lm-income']),
        expenses: numF(v['lm-expenses']), savings: numF(v['lm-savings']), emergency: numF(v['lm-emergency']),
        invest: numF(v['lm-invest']), sipYn: v['lm-sip-yn'] === 'yes', sip: numF(v['lm-sip']),
        debtYn: v['lm-debt-yn'] === 'yes', debtTotal: numF(v['lm-debt-total']), debtEmi: numF(v['lm-debt-emi']),
        career: v['lm-career'], goals: [...goals],
      });
      setProfile(p);
      setDec(lifeMapDecisionsForMarket(buildDecisions(p, (n) => cfmtSh(n)), market));
      setApplied(new Set());
      setCurrentAge(p.age);
      setCat('invest');
      track('tool_completed', { tool: 'lifemap' });
  };

  if (!profile) {
    return (
      <div className="fx-page" style={{ paddingBottom: 64 }}>
        <PageHead chip="LifeMap" chipColor="var(--purple)" chipBg="rgba(110,59,212,.1)" icon="lifemap" title="Simulate your entire financial life." chipPadTop={48}>
          Enter your numbers once. Travel through time. See how every decision — good or bad —
          reshapes your wealth trajectory from today to retirement. Everything past today is a
          projection from stated assumptions, not a forecast of what will happen.
        </PageHead>
        <LifeMapIntro seed={seed} />
        <SetupForm form={form} goals={goals} seed={seed} setField={setField} setGoals={setGoals} onLaunch={launch} sym={sym} monthlyTerm={market.invest.monthlyTerm} onRefresh={() => {
          const fresh = readLifeMapSeed();
          setSeed(fresh);
          const next = { ...form, ...fresh.values };
          setForm(next);
          setJSON('fx_lifemap', resolveAmounts(next));
        }} />
        <MarketNote market={market} />
      </div>
    );
  }

  return (
    <div className="fx-page" style={{ paddingBottom: 64 }}>
      {market.planningNote && <p className="note" style={{ marginBottom: 16 }}>LifeMap uses a shared illustrative simulation, not country-specific salary forecasts or statutory benefits. Indian tax-product and fixed-price decision cards are excluded for this market. The remaining effects are model assumptions.</p>}
      <AppScreen
        profile={profile} dec={dec} applied={applied} currentAge={currentAge} cat={cat} code={code}
        cfmt={cfmt} market={market} seed={seed}
        onAge={setCurrentAge}
        onCat={setCat}
        onResetDecisions={() => setApplied(new Set())}
        onToggle={(id) => {
          const d = dec.find((x) => x.id === id);
          if (!d) return;
          if (d.custom && !applied.has(id)) { setDialog({ d, amt: String(d.ca ?? 1000) }); return; }
          setApplied((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
        }}
        onEdit={() => { setProfile(null); }}
      />
      {dialog && (
        <SipDialog
          dialog={dialog}
          sh={(n) => cfmtSh(n)}
          sym={sym}
          onCancel={() => setDialog(null)}
          onChange={(amt) => setDialog({ ...dialog, amt })}
          onConfirm={() => {
            const raw = plainAmount(dialog.amt);
            const amt = Number(raw);
            if (!raw || !Number.isFinite(amt) || amt < 500 || amt > 1e12) return;
            const updated = lifeMapDecisionsForMarket([updateCustomDecision(dialog.d, amt, (n) => cfmtSh(n))], market)[0];
            setDec((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
            setApplied((prev) => new Set(prev).add(updated.id));
            setDialog(null);
          }}
        />
      )}
      <ToolFoot>Projections are illustrative — actual returns vary · Built with care by <b>FinatriX</b> · Not financial advice</ToolFoot>
    </div>
  );
}

/* ───────────────────────── Intro / empty state ───────────────────────── */

/**
 * What LifeMap is, before a stranger has typed anything.
 *
 * The page opened straight onto eleven money fields, which asks for a great deal
 * of private information from someone who has not yet been told what they get
 * for it, what happens to it, or how literally to take the answer. Four short
 * lines, and — when FinatriX already holds the figures — the fact that most of
 * the form is already filled in.
 */
function LifeMapIntro({ seed }: { seed: LifeMapSeed }) {
  return (
    <div className="card" style={{ maxWidth: 720, margin: '0 auto 16px' }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Before you start</div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <li style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink2)' }}>
          <b style={{ color: 'var(--ink)' }}>What it does.</b> Takes today&rsquo;s position and carries
          it to age 60 under two sets of habits, so you can see what a decision costs or earns over
          decades rather than months.
        </li>
        <li style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink2)' }}>
          <b style={{ color: 'var(--ink)' }}>What it needs.</b> Your monthly income and outgoings, what
          you hold, and what you owe. Estimates are fine — the shape of the answer survives rough
          numbers, and you can change any of them afterwards.
        </li>
        <li style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink2)' }}>
          <b style={{ color: 'var(--ink)' }}>Why it helps.</b> A monthly budget cannot show you the
          cost of a habit you keep for twenty years. This can, and the gap is usually larger than
          people expect.
        </li>
        <li style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink2)' }}>
          <b style={{ color: 'var(--ink)' }}>Where it stays.</b> On this device as a guest, or in your
          account when you are signed in. Nothing is sent anywhere to produce the projection.
        </li>
      </ul>
      {seed.from.length > 0 && (
        <p className="tip tip-info" style={{ marginTop: 14, marginBottom: 0 }}>
          <b>Some of this is already filled in</b> from your {listSources(seed.from)}. Change anything
          that is out of date — editing here does not alter the original records.
        </p>
      )}
    </div>
  );
}

/** `['Budget','Net Worth']` → `"Budget and Net Worth"`. */
function listSources(from: readonly string[]): string {
  if (from.length === 1) return from[0];
  return `${from.slice(0, -1).join(', ')} and ${from[from.length - 1]}`;
}

/* ───────────────────────── Setup form ───────────────────────── */
function SetupForm({ form, goals, seed, setField, setGoals, onLaunch, sym, monthlyTerm, onRefresh }: {
  form: Form; goals: Set<string>; seed: LifeMapSeed; setField: (k: string, v: string) => void;
  setGoals: (s: Set<string>) => void; onLaunch: () => void; sym: string;
  monthlyTerm: string; onRefresh: () => void;
}) {
  const values = resolveAmounts(form);
  const issues = lifeMapReadiness(values);
  /** A labelled field, with a note when its value was seeded from another tool. */
  const field = (k: string, label: string, control: (hintId: string | undefined) => React.ReactNode) => {
    const from = seed.sources[k];
    const hintId = from ? `${k}-from` : undefined;
    return (
      <div className="fg">
        <label className="fl" htmlFor={k}>{label}</label>
        {control(hintId)}
        {from && (
          <p id={hintId} className="note" style={{ marginTop: 5 }}>
            From your {from}
          </p>
        )}
      </div>
    );
  };
  const N = (k: string, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => field(k, label, (hintId) => (
    <input className="fi" id={k} value={form[k]} aria-describedby={hintId} onChange={(e) => setField(k, e.target.value)} {...extra} />
  ));
  // Money is text with a decimal keypad, never `type="number"`: see MoneyField.
  const M = (k: string, label: string) => field(k, label, (hintId) => (
    <AmountInput id={k} sym={sym} placeholder="" value={form[k]} describedBy={hintId} onChange={(v) => setField(k, v)} />
  ));
  return (
    <div className="card" style={{ maxWidth: 720, margin: '0 auto 16px' }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Your financial profile</div>
      <div className="note" style={{ marginBottom: 22 }}>Your inputs are private — kept on your device as a guest, or saved to your account when signed in.</div>
      <details style={{ marginBottom: 20 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Refresh from your other tools</summary>
        <p className="note">Replace available income, spending, savings, investment and debt fields with your latest saved Budget, Expenses, Net Worth and InvestMatch figures. Fields without a source stay as entered. Review partial-month spending before continuing.</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRefresh}>Use latest saved figures</button>
      </details>
      <div className="grid2">
        {N('lm-name', 'Your name', { type: 'text', placeholder: 'e.g. Nitya Prakash' })}
        {N('lm-age', 'Current age', { type: 'number', min: 16, max: 45, inputMode: 'numeric' })}
        {M('lm-income', `Monthly income (${sym})`)}
        {M('lm-expenses', `Monthly expenses (${sym})`)}
      </div>
      <div className="well" style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6, marginBottom: 18 }}>
        <Icon name="zap" size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', color: 'var(--gold)' }} /> Include all loan EMIs in{' '}
        <b style={{ color: 'var(--ink)' }}>monthly expenses</b>. Savings and investments are entered separately below — don't double-count.
      </div>
      <div className="grid2">
        {M('lm-savings', `Total savings — bank + FD + cash (${sym})`)}
        {M('lm-emergency', `Of which, emergency fund (${sym})`)}
        {M('lm-invest', `Total investments so far (${sym})`)}
        <div className="fg">
          <label className="fl" htmlFor="lm-sip-yn">Do you invest monthly?</label>
          <select className="fs" id="lm-sip-yn" value={form['lm-sip-yn']} onChange={(e) => setField('lm-sip-yn', e.target.value)}>
            <option value="no">No, not yet</option><option value="yes">Yes, I do</option>
          </select>
        </div>
        {form['lm-sip-yn'] === 'yes' && M('lm-sip', `Monthly ${monthlyTerm.toLowerCase()} (${sym})`)}
        <div className="fg">
          <label className="fl" htmlFor="lm-debt-yn">Any outstanding loans / debt?</label>
          <select className="fs" id="lm-debt-yn" value={form['lm-debt-yn']} onChange={(e) => setField('lm-debt-yn', e.target.value)}>
            <option value="no">No</option><option value="yes">Yes</option>
          </select>
        </div>
        {form['lm-debt-yn'] === 'yes' && M('lm-debt-total', `Total debt outstanding (${sym})`)}
        {form['lm-debt-yn'] === 'yes' && M('lm-debt-emi', `Monthly EMI / repayment (${sym})`)}
        <div className="fg">
          <label className="fl" htmlFor="lm-career">Career field</label>
          <select className="fs" id="lm-career" value={form['lm-career']} onChange={(e) => setField('lm-career', e.target.value)}>
            {CAREERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <div className="fg" style={{ marginBottom: 6 }}>
        <label className="fl">Your top financial goals (pick any)</label>
        <div className="lm-goals-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 4 }}>
          {LM_GOALS.map((g) => {
            const on = goals.has(g.k);
            return (
              <button key={g.k} type="button" aria-pressed={on}
                onClick={() => { const n = new Set(goals); if (n.has(g.k)) n.delete(g.k); else n.add(g.k); setGoals(n); }}
                style={{ padding: '11px 6px', borderRadius: 13, border: `1.5px solid ${on ? 'var(--gold)' : 'var(--hair2)'}`, background: on ? 'var(--gold-bg)' : 'var(--card)', textAlign: 'center', cursor: 'pointer', transition: 'all .15s', fontFamily: 'inherit' }}>
                <span style={{ display: 'flex', justifyContent: 'center', height: 24, alignItems: 'center', color: 'var(--ink2)' }}><Icon name={g.ic} size={19} /></span>
                <span style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 600, display: 'block', marginTop: 3 }}>{g.l}</span>
              </button>
            );
          })}
        </div>
      </div>
      {issues.length > 0 && <div className="tip tip-info" role="status" style={{ marginTop: 16 }}><b>Check these inputs before simulating</b><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
      {Number(values['lm-expenses']) >= Number(values['lm-income']) && <p className="note">Expenses meet or exceed income. The model has no positive monthly surplus to grow.</p>}
      {form['lm-sip-yn'] === 'yes' && Number(values['lm-sip']) > Math.max(0, Number(values['lm-income']) - Number(values['lm-expenses'])) && <p className="note">Your monthly investment exceeds income minus expenses. Check whether you have counted it twice or are drawing on existing savings.</p>}
      <button className="btn" style={{ marginTop: 22 }} disabled={issues.length > 0} onClick={onLaunch}>
        Launch my LifeMap →
      </button>
    </div>
  );
}

/* ───────────────────────── App screen ───────────────────────── */
function AppScreen({ profile: p, dec, applied, currentAge, cat, code, cfmt, market, seed, onAge, onCat, onToggle, onEdit, onResetDecisions }: {
  profile: LifeProfile; dec: Decision[]; applied: Set<string>; currentAge: number; cat: string; code: string;
  cfmt: (n: number) => string; market: MarketPack; seed: LifeMapSeed;
  onAge: (a: number) => void; onCat: (c: string) => void; onToggle: (id: string) => void; onEdit: () => void; onResetDecisions: () => void;
}) {
  const score = calcScore(p, applied);
  const health = calcHealth(p, applied);
  const surplus = p.income - p.expenses;
  const sNW = calcWealth(p, dec, applied, currentAge, true);
  const compareAt = Math.max(40, currentAge);
  const s40 = calcWealth(p, dec, applied, compareAt, true);
  const i40 = calcWealth(p, dec, applied, compareAt, false);
  const diff = Math.abs(s40 - i40);
  const sDebt = applied.has('paydebt') ? 0 : Math.round((p.debtTotal || 0) * 0.15);
  const iDebt = Math.round((p.debtTotal || 0) * 0.85 + i40 * 0.22);
  const stops = [p.age, Math.round(p.age + (60 - p.age) * 0.25), Math.round(p.age + (60 - p.age) * 0.5), Math.round(p.age + (60 - p.age) * 0.75), 60];
  const milestones = LM_MILESTONES.filter((m) => m.age >= p.age - 1 && m.age <= 60);
  const scoreTitle = SCORE_TITLES[Math.floor(score / 20)] || 'Financial pro';

  // Inputs are what the reader supplied — including the fields FinatriX filled
  // in from their own records, which are named so the disclosure is complete.
  const seededNote = (key: string) => (seed.sources[key] ? ` · from your ${seed.sources[key]}` : '');
  const inputs: MethodRow[] = [
    { label: 'Age today', value: `${p.age}` },
    { label: 'Monthly income', value: cfmt(p.income) + seededNote('lm-income') },
    { label: 'Monthly expenses', value: cfmt(p.expenses) + seededNote('lm-expenses') },
    { label: 'Savings held', value: cfmt(p.savings) + seededNote('lm-savings') },
    { label: 'Invested', value: cfmt(p.invest) + seededNote('lm-invest') },
    { label: 'Monthly contribution', value: p.sip > 0 ? cfmt(p.sip) + seededNote('lm-sip') : 'None' },
    { label: 'Debt outstanding', value: cfmt(p.debtTotal) + seededNote('lm-debt-total') },
    { label: 'Career field', value: CAREERS.find(([v]) => v === p.career)?.[1] ?? p.career },
  ];
  // Every figure the model supplies rather than the reader. Stated as rates so
  // a reader can disagree with a specific number instead of the whole chart.
  const assumptions: MethodRow[] = [
    { label: 'Projected to', value: 'Age 60' },
    { label: 'Growth on the disciplined path', value: '11.5% a year' },
    { label: 'Growth on the impulsive path', value: '3.8% a year' },
    { label: 'Share of surplus invested', value: '68% disciplined · 18% impulsive' },
    { label: 'Career field multiplier', value: `${LM_CAREER_BOOST[p.career] ?? 1}×` },
    { label: 'Inflation applied', value: 'None — future values are nominal, not adjusted for purchasing power' },
  ];

  return (
    <div id="lm-app">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0 10px' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.015em' }}>Welcome, {p.name.split(' ')[0]}</div>
          <div className="note">Your financial simulation — age {p.age} to 60</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onEdit} style={{ flexShrink: 0 }}>← Edit profile</button>
      </div>

      {/* Which figures are yours and which are modelled. The net-worth tile is
          the one that changes meaning as the slider moves — at your current age
          it is the balance you entered, and at every later age it is a
          projection. Labelling it is the difference between a simulation and a
          promise. */}
      <div id="lm-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        <Kpi
          v={cfmt(currentAge > p.age ? sNW : p.savings + p.invest - p.debtTotal)}
          l={currentAge > p.age ? `Projected net worth at ${currentAge}` : 'Net worth today'}
          color={sNW >= 0 ? 'var(--green)' : 'var(--red)'}
          tag={currentAge > p.age ? 'Projected' : 'You entered'}
        />
        <Kpi v={cfmt(surplus)} l="Monthly surplus" color={surplus >= 0 ? 'var(--ink)' : 'var(--red)'} tag="You entered" />
        <Kpi v={String(score)} l="Financial score" color="var(--purple)" tag="Derived" />
        <Kpi v={`${applied.size}/${dec.length}`} l="Decisions activated" tag="Your choices" />
      </div>

      <LifeMapSmartAssist profile={p} decisions={dec} applied={applied} age={currentAge} money={cfmt} onToggle={onToggle} onReset={onResetDecisions} onAge={onAge} />

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>⏳ Travel through time</div>
          <div style={{ background: 'var(--gold)', color: '#0A0A0A', borderRadius: 980, padding: '5px 16px', fontSize: 14, fontWeight: 600 }}>Age {currentAge}</div>
        </div>
        <input
          type="range"
          min={p.age}
          max={60}
          value={currentAge}
          onChange={(e) => onAge(parseInt(e.target.value))}
          aria-label="Travel through time — your age"
          aria-valuetext={`Age ${currentAge}`} style={{ width: '100%', accentColor: 'var(--gold)', height: 4, cursor: 'pointer' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink3)', marginTop: 7 }}>{stops.map((s, i) => <span key={i}>{s}</span>)}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 8, left: 0, right: 0, height: 1, background: 'var(--hair2)' }} />
          {milestones.map((m) => (
            <div key={m.age} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, position: 'relative' }}>
              <div title={m.l} style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--hair2)', background: currentAge >= m.age ? 'var(--ink)' : 'var(--card)', borderColor: currentAge >= m.age ? 'var(--ink)' : 'var(--hair2)', transition: 'all .3s', zIndex: 1, boxSizing: 'border-box' }} />
              <div style={{ fontSize: 10, color: 'var(--ink3)' }}>{m.age}</div>
              <div style={{ fontSize: 10, color: 'var(--ink3)', textAlign: 'center', maxWidth: 56 }}>{m.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="lm-chart-row" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          {/* `flexWrap` because the heading now carries the "modelled, not
              forecast" qualifier: without it, title + legend exceed a 360px
              card and the whole page scrolls sideways. The qualifier stays —
              a projection chart that does not say it is a projection is the
              thing this label exists to prevent — so the row wraps instead. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, minWidth: 0 }}>Wealth projection <span style={{ fontWeight: 500, color: 'var(--ink3)', fontSize: 12 }}>· modelled, not forecast</span></div>
            <div style={{ display: 'flex', gap: 14 }}>
              <Legend color="var(--gold)" label="Smart" /><Legend color="var(--red)" label="Impulsive" />
            </div>
          </div>
          <WealthChart profile={p} dec={dec} applied={applied} cfmt={cfmt} code={code} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ textAlign: 'center', padding: '22px 16px' }}>
            <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 12px' }}>
              <svg aria-hidden="true" width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--hair2)" strokeWidth="9" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--ink)" strokeWidth="9" strokeLinecap="round" strokeDasharray="251.2" strokeDashoffset={251.2 - (score / 100) * 251.2} style={{ transition: 'stroke-dashoffset .8s ease' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>{score}</div>
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{scoreTitle}</div>
            <div className="note">Financial health score</div>
          </div>
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Health breakdown</div>
            {LM_HEALTH_CATS.map((c) => (
              <div key={c.k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                <div style={{ fontSize: 12, color: 'var(--ink2)', width: 86, flexShrink: 0 }}>{c.l}</div>
                <div className="bar bar-sm" style={{ flex: 1 }}>
                  <div className="bar-fill" style={{ background: c.c, width: `${health[c.k as keyof typeof health]}%` }} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, width: 28, textAlign: 'right' }}>{health[c.k as keyof typeof health]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lm-dec-uni-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Life decisions</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {LM_CATS.map((c) => {
              const cnt = dec.filter((d) => d.cat === c.id).length;
              if (!cnt) return null;
              const on = cat === c.id;
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => onCat(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 980, border: `1px solid ${on ? 'var(--gold)' : 'var(--hair2)'}`, background: on ? 'var(--gold)' : 'var(--card)', color: on ? 'var(--card)' : 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .2s', fontFamily: 'inherit' }}>
                  {c.i ? c.i : c.ic ? <Icon name={c.ic} size={13} style={{ verticalAlign: '-1px' }} /> : null} {c.n} <span style={{ opacity: 0.7, fontSize: 10 }}>{cnt}</span>
                </button>
              );
            })}
          </div>
          <div>
            {dec.filter((d) => d.cat === cat).map((d) => {
              const on = applied.has(d.id);
              const good = d.smart > 0;
              return (
                <button key={d.id} type="button" aria-pressed={on} onClick={() => onToggle(d.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderRadius: 14, border: `1.5px solid ${on ? (good ? 'rgba(29,125,70,.3)' : 'rgba(215,0,21,.25)') : 'var(--hair2)'}`, background: on ? (good ? 'rgba(29,125,70,.04)' : 'rgba(215,0,21,.03)') : 'var(--card)', marginBottom: 8, cursor: 'pointer', transition: 'border-color .2s, background-color .2s', width: '100%', textAlign: 'left', fontFamily: 'inherit', color: 'inherit' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: d.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--ink)' }}><Icon name={d.ic} size={18} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{d.t}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2, lineHeight: 1.4 }}>{d.s}</div>
                  </div>
                  {d.custom && <div style={{ fontSize: 11, color: 'var(--blue)', flexShrink: 0 }}>✏️</div>}
                  <div style={{ fontSize: 13, fontWeight: 700, color: good ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>{d.imp}</div>
                  {on && <div style={{ width: 22, height: 22, borderRadius: '50%', background: good ? 'rgba(29,125,70,.12)' : 'rgba(215,0,21,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>{good ? '✓' : '!'}</div>}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Parallel universe</div>
          <div className="card">
            <div className="note" style={{ marginBottom: 6 }}>At age <b style={{ color: 'var(--ink)' }}>{compareAt}</b>, the gap between smart &amp; impulsive you:</div>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.025em', color: 'var(--green)', margin: '10px 0 4px' }}>{cfmt(diff)}</div>
            <div className="note" style={{ marginBottom: 16 }}>in wealth — every decision counts</div>
            <div className="lm-compare-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <CompareCol title="✅ Smart you" color="var(--green)" bg="rgba(29,125,70,.06)" border="rgba(29,125,70,.14)" nw={cfmt(s40)} inv={cfmt(s40 * 0.62)} debt={cfmt(sDebt)} debtColor="var(--green)" />
              <CompareCol title="⚡ Impulsive you" color="var(--red)" bg="rgba(215,0,21,.04)" border="rgba(215,0,21,.12)" nw={cfmt(i40)} inv={cfmt(i40 * 0.18)} debt={cfmt(iDebt)} debtColor="var(--red)" />
            </div>
          </div>
        </div>
      </div>

      <ResultExplainer
        toolId="lifemap"
        market={market}
        inputs={inputs}
        assumptions={assumptions}
        meaning={
          <>
            Carrying today&rsquo;s position forward on the assumptions above, the two paths are{' '}
            {cfmt(s40)} and {cfmt(i40)} apart by age {compareAt} — a gap of {cfmt(diff)} produced by
            habits, not by income. Almost all of it is compounding: the early years contribute the
            least on the chart and matter the most, because they are the ones that have time to
            grow.{' '}
            {surplus <= 0
              ? <>Your entered outgoings currently match or exceed your income, so the projection has
                  no monthly surplus to work with. That single figure moves this chart more than any
                  decision on the list.</>
              : <>Your {cfmt(surplus)} monthly surplus is the engine of both lines; the decisions only
                  change how much of it survives and where it goes.</>}{' '}
            None of these figures is a forecast. They are what these assumptions imply, and a real
            forty years will not resemble a smooth curve.
          </>
        }
      />
    </div>
  );
}

function Kpi({ v, l, color, tag }: { v: string; l: string; color?: string; tag?: string }) {
  return (
    <div className="stat-cell">
      <div className="v" style={color ? { color } : undefined}>{v}</div>
      <div className="l">{l}</div>
      {tag && (
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink3)', marginTop: 4 }}>
          {tag}
        </div>
      )}
    </div>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  return <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink2)' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />{label}</span>;
}
function CompareCol({ title, color, bg, border, nw, inv, debt, debtColor }: { title: string; color: string; bg: string; border: string; nw: string; inv: string; debt: string; debtColor: string }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: 15 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>{title}</div>
      <div className="row-line"><span className="note">Net worth</span><b style={{ color }}>{nw}</b></div>
      <div className="row-line"><span className="note">Invested</span><b>{inv}</b></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', fontSize: 13 }}><span className="note">Debt left</span><b style={{ color: debtColor }}>{debt}</b></div>
    </div>
  );
}

function WealthChart({ profile: p, dec, applied, cfmt, code }: { profile: LifeProfile; dec: Decision[]; applied: Set<string>; cfmt: (n: number) => string; code: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const { theme } = useTheme();
  const ages = useMemo(() => Array.from({ length: 60 - p.age + 1 }, (_, i) => p.age + i), [p.age]);
  const smart = useMemo(() => ages.map((a) => calcWealth(p, dec, applied, a, true)), [ages, p, dec, applied]);
  const imp = useMemo(() => ages.map((a) => calcWealth(p, dec, applied, a, false)), [ages, p, dec, applied]);

  useEffect(() => {
    if (!ref.current) return;
    const ct = getChartTheme(theme);
    chartRef.current = new Chart(ref.current, {
      type: 'line',
      data: {
        labels: ages,
        datasets: [
          { label: 'Smart', data: smart, borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,.08)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0 },
          { label: 'Impulsive', data: imp, borderColor: '#FF5A52', backgroundColor: 'rgba(255,90,82,.05)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0 },
        ],
      },
      options: {
        responsive: true, animation: { duration: 450 },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, borderWidth: 1, titleColor: ct.tooltipTitle, bodyColor: ct.tooltipBody, callbacks: { label: (c) => ' ' + cfmt(c.raw as number) } },
        },
        scales: {
          x: { ticks: { color: ct.tick, font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: ct.grid } },
          y: { ticks: { color: ct.tick, font: { size: 10 }, callback: (v) => cfmt(v as number) }, grid: { color: ct.grid } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
    // Rebuild when the currency OR theme changes so axis/tooltip match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, theme]);

  useEffect(() => {
    const ch = chartRef.current;
    if (!ch) return;
    ch.data.labels = ages;
    ch.data.datasets[0].data = smart;
    ch.data.datasets[1].data = imp;
    ch.update();
  }, [ages, smart, imp]);

  // Text alternative for the projection (WCAG 1.1.1) — without it the entire
  // point of the page, the gap between the two paths, is unavailable to a
  // screen-reader user. Summarised at the endpoints rather than dumping ~40
  // yearly values, which would be read aloud as an unusable wall of numbers;
  // the figures come from the same `smart`/`imp` series the chart plots.
  const summary = useMemo(() => {
    const last = ages.length - 1;
    if (last < 0) return 'Wealth projection chart. No projection available yet.';
    return `Line chart projecting net worth from age ${ages[0]} to ${ages[last]}. `
      + `The smart-decision path ends at ${cfmt(smart[last])}, `
      + `the impulsive path at ${cfmt(imp[last])}.`;
  }, [ages, smart, imp, cfmt]);

  return <canvas ref={ref} height={185} role="img" aria-label={summary} />;
}

function SipDialog({ dialog, sh, sym, onCancel, onChange, onConfirm }: {
  dialog: { d: Decision; amt: string }; sh: (n: number) => string; sym: string;
  onCancel: () => void; onChange: (amt: string) => void; onConfirm: () => void;
}) {
  const isStart = dialog.d.ck === 'start';
  const amt = plainAmount(dialog.amt);
  const validAmount = amt !== '' && Number.isFinite(Number(amt)) && Number(amt) >= 500 && Number(amt) <= 1e12;
  const cardRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  // `aria-modal` below claims the rest of the page is inert; this is what makes
  // that true for the keyboard, and what puts focus back on the decision the
  // user opened this from rather than dropping it at the top of the document.
  useDialogFocus({ containerRef: cardRef, open: true, initialFocusRef: amountRef });
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
      <div ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="lm-sip-title" style={{ background: 'var(--card-solid)', border: '1px solid var(--hair2)', borderRadius: 20, padding: 28, maxWidth: 360, width: '100%', boxShadow: '0 30px 70px rgba(0,0,0,.6)' }}>
        <div id="lm-sip-title" style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{isStart ? 'Set your monthly SIP' : 'Step up your SIP'}</div>
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 18, lineHeight: 1.55 }}>
          {isStart ? 'How much do you want to invest every month?' : `You invest ${sh(dialog.d.ca ?? 0)}/mo. How much extra do you want to add monthly?`}
        </div>
        <div style={{ marginBottom: 16 }}>
          <AmountInput id="lm-sip-amount" inputRef={amountRef} sym={sym} placeholder="" value={dialog.amt} invalid={!validAmount}
            errorId={validAmount ? undefined : 'lm-sip-amount-error'}
            ariaLabel={isStart ? 'Monthly SIP amount' : 'Extra monthly SIP amount'}
            onChange={onChange}
            onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); else if (e.key === 'Escape') onCancel(); }} />
        </div>
        {!validAmount && <p id="lm-sip-amount-error" className="note" role="status">Enter an amount from 500 to 1 trillion.</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onCancel} style={{ flex: 1, padding: 13, borderRadius: 980, border: '1px solid var(--hair)', background: 'rgba(255,255,255,.03)', color: 'var(--ink)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button type="button" onClick={onConfirm} disabled={!validAmount} style={{ flex: 2, padding: 13, borderRadius: 980, border: 'none', background: 'linear-gradient(180deg,var(--gold-2),var(--gold))', color: '#1a1400', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
