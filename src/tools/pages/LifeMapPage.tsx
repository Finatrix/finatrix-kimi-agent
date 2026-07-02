import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { useCurrency } from '../CurrencyContext';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { getJSON, setJSON } from '../lib/storage';
import {
  LM_GOALS, LM_MILESTONES, LM_CATS, LM_HEALTH_CATS,
  buildDecisions, buildProfile, updateCustomDecision,
  calcWealth, calcScore, calcHealth,
  type LifeProfile, type Decision,
} from '../lib/lifemap';

const CAREERS: [string, string][] = [
  ['tech', 'Technology / IT'], ['finance', 'Finance / Banking'], ['health', 'Healthcare / Pharma'],
  ['creative', 'Creative / Media'], ['govt', 'Government / PSU'], ['startup', 'Startup / Entrepreneur'],
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

export default function LifeMapPage() {
  const { cfmt, cfmtSh, code, sym } = useCurrency();
  const [form, setForm] = useState<Form>(() => ({ ...FORM_DEFAULTS, ...getJSON<Form>('fx_lifemap', {}) }));
  const [goals, setGoals] = useState<Set<string>>(new Set(['home']));
  const [profile, setProfile] = useState<LifeProfile | null>(null);
  const [dec, setDec] = useState<Decision[]>([]);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [currentAge, setCurrentAge] = useState(22);
  const [cat, setCat] = useState('invest');
  const [dialog, setDialog] = useState<{ d: Decision; amt: string } | null>(null);
  const [launching, setLaunching] = useState(false);

  const setField = (k: string, v: string) => {
    const next = { ...form, [k]: v };
    setForm(next);
    setJSON('fx_lifemap', next);
  };

  const launch = () => {
    setLaunching(true);
    setTimeout(() => {
      const p = buildProfile({
        name: form['lm-name'], age: numF(form['lm-age']), income: numF(form['lm-income']),
        expenses: numF(form['lm-expenses']), savings: numF(form['lm-savings']), emergency: numF(form['lm-emergency']),
        invest: numF(form['lm-invest']), sipYn: form['lm-sip-yn'] === 'yes', sip: numF(form['lm-sip']),
        debtYn: form['lm-debt-yn'] === 'yes', debtTotal: numF(form['lm-debt-total']), debtEmi: numF(form['lm-debt-emi']),
        career: form['lm-career'], goals: [...goals],
      });
      setProfile(p);
      setDec(buildDecisions(p, (n) => cfmtSh(n)));
      setApplied(new Set());
      setCurrentAge(p.age);
      setCat('invest');
      setLaunching(false);
    }, 700);
  };

  if (!profile) {
    return (
      <div className="fx-page" style={{ paddingBottom: 64 }}>
        <PageHead chip="LifeMap" chipColor="var(--purple)" chipBg="rgba(110,59,212,.1)" icon="lifemap" title="Simulate your entire financial life." chipPadTop={48}>
          Enter your numbers once. Travel through time. See how every decision — good or bad —
          reshapes your wealth trajectory from today to retirement.
        </PageHead>
        <SetupForm form={form} goals={goals} setField={setField} setGoals={setGoals} onLaunch={launch} launching={launching} sym={sym} />
      </div>
    );
  }

  return (
    <div className="fx-page" style={{ paddingBottom: 64 }}>
      <AppScreen
        profile={profile} dec={dec} applied={applied} currentAge={currentAge} cat={cat} code={code}
        cfmt={cfmt}
        onAge={setCurrentAge}
        onCat={setCat}
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
          onCancel={() => setDialog(null)}
          onChange={(amt) => setDialog({ ...dialog, amt })}
          onConfirm={() => {
            const amt = Math.max(500, numF(dialog.amt) || 1000);
            const updated = updateCustomDecision(dialog.d, amt, (n) => cfmtSh(n));
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

/* ───────────────────────── Setup form ───────────────────────── */
function SetupForm({ form, goals, setField, setGoals, onLaunch, launching, sym }: {
  form: Form; goals: Set<string>; setField: (k: string, v: string) => void;
  setGoals: (s: Set<string>) => void; onLaunch: () => void; launching: boolean; sym: string;
}) {
  const N = (k: string, label: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="fg">
      <label className="fl" htmlFor={k}>{label}</label>
      <input className="fi" id={k} value={form[k]} onChange={(e) => setField(k, e.target.value)} {...extra} />
    </div>
  );
  return (
    <div className="card" style={{ maxWidth: 720, margin: '0 auto 16px' }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Your financial profile</div>
      <div className="note" style={{ marginBottom: 22 }}>Your inputs are private — kept on your device as a guest, or saved to your account when signed in.</div>
      <div className="grid2">
        {N('lm-name', 'Your name', { type: 'text', placeholder: 'e.g. Nitya Prakash' })}
        {N('lm-age', 'Current age', { type: 'number', min: 16, max: 45, inputMode: 'numeric' })}
        {N('lm-income', `Monthly income (${sym})`, { type: 'number', min: 0, inputMode: 'decimal' })}
        {N('lm-expenses', `Monthly expenses (${sym})`, { type: 'number', min: 0, inputMode: 'decimal' })}
      </div>
      <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '13px 15px', fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6, marginBottom: 18 }}>
        <Icon name="zap" size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', color: 'var(--gold)' }} /> Include all loan EMIs in{' '}
        <b style={{ color: 'var(--ink)' }}>monthly expenses</b>. Savings and investments are entered separately below — don't double-count.
      </div>
      <div className="grid2">
        {N('lm-savings', `Total savings — bank + FD + cash (${sym})`, { type: 'number', min: 0, inputMode: 'decimal' })}
        {N('lm-emergency', `Of which, emergency fund (${sym})`, { type: 'number', min: 0, inputMode: 'decimal' })}
        {N('lm-invest', `Total investments so far (${sym})`, { type: 'number', min: 0, inputMode: 'decimal' })}
        <div className="fg">
          <label className="fl" htmlFor="lm-sip-yn">Do you invest monthly?</label>
          <select className="fs" id="lm-sip-yn" value={form['lm-sip-yn']} onChange={(e) => setField('lm-sip-yn', e.target.value)}>
            <option value="no">No, not yet</option><option value="yes">Yes, I do</option>
          </select>
        </div>
        {form['lm-sip-yn'] === 'yes' && N('lm-sip', `Monthly SIP / investment (${sym})`, { type: 'number', min: 0, inputMode: 'decimal' })}
        <div className="fg">
          <label className="fl" htmlFor="lm-debt-yn">Any outstanding loans / debt?</label>
          <select className="fs" id="lm-debt-yn" value={form['lm-debt-yn']} onChange={(e) => setField('lm-debt-yn', e.target.value)}>
            <option value="no">No</option><option value="yes">Yes</option>
          </select>
        </div>
        {form['lm-debt-yn'] === 'yes' && N('lm-debt-total', `Total debt outstanding (${sym})`, { type: 'number', min: 0, inputMode: 'decimal' })}
        {form['lm-debt-yn'] === 'yes' && N('lm-debt-emi', `Monthly EMI / repayment (${sym})`, { type: 'number', min: 0, inputMode: 'decimal' })}
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
              <div key={g.k} onClick={() => { const n = new Set(goals); if (n.has(g.k)) n.delete(g.k); else n.add(g.k); setGoals(n); }}
                style={{ padding: '11px 6px', borderRadius: 13, border: `1.5px solid ${on ? 'var(--gold)' : 'var(--hair2)'}`, background: on ? 'var(--gold-bg)' : 'var(--card)', textAlign: 'center', cursor: 'pointer', transition: 'all .15s' }}>
                <span style={{ display: 'flex', justifyContent: 'center', height: 24, alignItems: 'center', color: 'var(--ink2)' }}><Icon name={g.ic} size={19} /></span>
                <span style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 600, display: 'block', marginTop: 3 }}>{g.l}</span>
              </div>
            );
          })}
        </div>
      </div>
      <button className={`btn ${launching ? 'btn-loading' : ''}`} style={{ marginTop: 22 }} disabled={launching} onClick={onLaunch}>
        {launching ? 'Simulating your life…' : 'Launch my LifeMap →'}
      </button>
    </div>
  );
}

/* ───────────────────────── App screen ───────────────────────── */
function AppScreen({ profile: p, dec, applied, currentAge, cat, code, cfmt, onAge, onCat, onToggle, onEdit }: {
  profile: LifeProfile; dec: Decision[]; applied: Set<string>; currentAge: number; cat: string; code: string;
  cfmt: (n: number) => string; onAge: (a: number) => void; onCat: (c: string) => void; onToggle: (id: string) => void; onEdit: () => void;
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

  return (
    <div id="lm-app">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0 10px' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.015em' }}>Welcome, {p.name.split(' ')[0]}</div>
          <div className="note">Your financial simulation — age {p.age} to 60</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onEdit} style={{ flexShrink: 0 }}>← Edit profile</button>
      </div>

      <div id="lm-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        <Kpi v={cfmt(sNW)} l="Net worth" color={sNW >= 0 ? 'var(--green)' : 'var(--red)'} />
        <Kpi v={cfmt(surplus)} l="Monthly surplus" color={surplus >= 0 ? 'var(--ink)' : 'var(--red)'} />
        <Kpi v={String(score)} l="Financial score" color="var(--purple)" />
        <Kpi v={`${applied.size}/${dec.length}`} l="Decisions activated" />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>⏳ Travel through time</div>
          <div style={{ background: 'var(--gold)', color: '#0A0A0A', borderRadius: 980, padding: '5px 16px', fontSize: 14, fontWeight: 600 }}>Age {currentAge}</div>
        </div>
        <input type="range" min={p.age} max={60} value={currentAge} onChange={(e) => onAge(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--gold)', height: 4, cursor: 'pointer' }} />
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Wealth projection</div>
            <div style={{ display: 'flex', gap: 14 }}>
              <Legend color="var(--gold)" label="Smart" /><Legend color="var(--red)" label="Impulsive" />
            </div>
          </div>
          <WealthChart profile={p} dec={dec} applied={applied} cfmt={cfmt} code={code} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ textAlign: 'center', padding: '22px 16px' }}>
            <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 12px' }}>
              <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
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
                <div style={{ flex: 1, height: 6, background: 'var(--bg)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 6, background: c.c, transition: 'width .6s ease', width: `${health[c.k as keyof typeof health]}%` }} />
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
                <div key={c.id} onClick={() => onCat(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 980, border: `1px solid ${on ? 'var(--gold)' : 'var(--hair2)'}`, background: on ? 'var(--gold)' : 'var(--card)', color: on ? 'var(--card)' : 'var(--ink2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .2s' }}>
                  {c.i ? c.i : c.ic ? <Icon name={c.ic} size={13} style={{ verticalAlign: '-1px' }} /> : null} {c.n} <span style={{ opacity: 0.7, fontSize: 10 }}>{cnt}</span>
                </div>
              );
            })}
          </div>
          <div>
            {dec.filter((d) => d.cat === cat).map((d) => {
              const on = applied.has(d.id);
              const good = d.smart > 0;
              return (
                <div key={d.id} onClick={() => onToggle(d.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderRadius: 14, border: `1.5px solid ${on ? (good ? 'rgba(29,125,70,.3)' : 'rgba(215,0,21,.25)') : 'var(--hair2)'}`, background: on ? (good ? 'rgba(29,125,70,.04)' : 'rgba(215,0,21,.03)') : 'var(--card)', marginBottom: 8, cursor: 'pointer', transition: 'all .2s' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: d.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--ink)' }}><Icon name={d.ic} size={18} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{d.t}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2, lineHeight: 1.4 }}>{d.s}</div>
                  </div>
                  {d.custom && <div style={{ fontSize: 11, color: 'var(--blue)', flexShrink: 0 }}>✏️</div>}
                  <div style={{ fontSize: 13, fontWeight: 700, color: good ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>{d.imp}</div>
                  {on && <div style={{ width: 22, height: 22, borderRadius: '50%', background: good ? 'rgba(29,125,70,.12)' : 'rgba(215,0,21,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>{good ? '✓' : '!'}</div>}
                </div>
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
    </div>
  );
}

function Kpi({ v, l, color }: { v: string; l: string; color?: string }) {
  return <div className="stat-cell"><div className="v" style={color ? { color } : undefined}>{v}</div><div className="l">{l}</div></div>;
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
  const ages = useMemo(() => Array.from({ length: 60 - p.age + 1 }, (_, i) => p.age + i), [p.age]);
  const smart = useMemo(() => ages.map((a) => calcWealth(p, dec, applied, a, true)), [ages, p, dec, applied]);
  const imp = useMemo(() => ages.map((a) => calcWealth(p, dec, applied, a, false)), [ages, p, dec, applied]);

  useEffect(() => {
    if (!ref.current) return;
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
          tooltip: { backgroundColor: '#15151A', borderColor: '#26262B', borderWidth: 1, titleColor: '#F5F5F0', bodyColor: '#9A9A94', callbacks: { label: (c) => ' ' + cfmt(c.raw as number) } },
        },
        scales: {
          x: { ticks: { color: '#9A9A94', font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,.06)' } },
          y: { ticks: { color: '#9A9A94', font: { size: 10 }, callback: (v) => cfmt(v as number) }, grid: { color: 'rgba(255,255,255,.06)' } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
    // Rebuild when the currency changes so axis/tooltip formatting updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    const ch = chartRef.current;
    if (!ch) return;
    ch.data.labels = ages;
    ch.data.datasets[0].data = smart;
    ch.data.datasets[1].data = imp;
    ch.update();
  }, [ages, smart, imp]);

  return <canvas ref={ref} height={185} />;
}

function SipDialog({ dialog, sh, onCancel, onChange, onConfirm }: {
  dialog: { d: Decision; amt: string }; sh: (n: number) => string;
  onCancel: () => void; onChange: (amt: string) => void; onConfirm: () => void;
}) {
  const isStart = dialog.d.ck === 'start';
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
      <div style={{ background: 'var(--card-solid)', border: '1px solid var(--hair2)', borderRadius: 20, padding: 28, maxWidth: 360, width: '100%', boxShadow: '0 30px 70px rgba(0,0,0,.6)' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{isStart ? 'Set your monthly SIP' : 'Step up your SIP'}</div>
        <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 18, lineHeight: 1.55 }}>
          {isStart ? 'How much do you want to invest every month?' : `You invest ${sh(dialog.d.ca ?? 0)}/mo. How much extra do you want to add monthly?`}
        </div>
        <input className="fi" type="number" step="any" min={500} inputMode="decimal" autoFocus value={dialog.amt}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); else if (e.key === 'Escape') onCancel(); }}
          style={{ marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 13, borderRadius: 980, border: '1px solid var(--hair)', background: 'rgba(255,255,255,.03)', color: 'var(--ink)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 2, padding: 13, borderRadius: 980, border: 'none', background: 'linear-gradient(180deg,var(--gold-2),var(--gold))', color: '#1a1400', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
