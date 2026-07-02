/**
 * LifeMap — data + math, ported verbatim from LM_* tables and the
 * lmBuildDecisions()/lmCalcWealth()/lmCalcScore()/lmCalcHealth() engine in
 * tools-app.html. The numeric core is pure and parity-checked against the
 * source; only display strings use the (currency-aware) short formatter `sh`.
 */
import type { IconName } from '../ui/Icon';

export interface LmGoal { k: string; ic: IconName; l: string }
export const LM_GOALS: LmGoal[] = [
  { k: 'home', ic: 'home', l: 'Own a home' }, { k: 'retire', ic: 'sun', l: 'Early retire' },
  { k: 'car', ic: 'car', l: 'Buy a car' }, { k: 'abroad', ic: 'compass', l: 'Study abroad' },
  { k: 'startup', ic: 'trending', l: 'Start a biz' }, { k: 'travel', ic: 'map', l: 'Travel world' },
  { k: 'wedding', ic: 'award', l: 'Dream wedding' }, { k: 'debtfree', ic: 'lock', l: 'Debt-free' },
  { k: 'passive', ic: 'dollar', l: 'Passive income' }, { k: 'parents', ic: 'users', l: 'Support family' },
  { k: 'luxury', ic: 'award', l: 'Luxury life' }, { k: 'education', ic: 'education', l: 'Higher studies' },
];

export const LM_CAREER_BOOST: Record<string, number> = {
  tech: 1.4, finance: 1.32, health: 1.2, creative: 0.92, govt: 1.0, startup: 1.6,
  engineering: 1.22, education: 0.86, law: 1.3, consulting: 1.45, sales: 1.16,
  design: 1.06, science: 1.1, hospitality: 0.86, agriculture: 0.82, retail: 0.96,
  defence: 1.06, sports: 1.0, freelance: 1.12, other: 1.0,
};

export interface LmMilestone { age: number; l: string; ic: IconName }
export const LM_MILESTONES: LmMilestone[] = [
  { age: 22, l: 'Graduate', ic: 'briefcase' }, { age: 25, l: 'First raise', ic: 'trending' },
  { age: 30, l: 'Peak growth', ic: 'sip' }, { age: 35, l: 'Mid-career', ic: 'award' },
  { age: 45, l: 'Wealth prime', ic: 'dollar' }, { age: 55, l: 'Pre-retire', ic: 'sun' },
  { age: 60, l: 'Retire', ic: 'sun' },
];

export interface LmCat { id: string; i?: string; ic?: IconName; n: string }
export const LM_CATS: LmCat[] = [
  { id: 'invest', i: '💰', n: 'Invest' }, { id: 'safe', ic: 'shield', n: 'Stay Safe' },
  { id: 'buys', ic: 'home', n: 'Big Buys' }, { id: 'earn', ic: 'sip', n: 'Earn More' },
  { id: 'traps', i: '⚠️', n: 'Avoid Traps' },
];

export interface LmHealthCat { k: string; l: string; c: string }
export const LM_HEALTH_CATS: LmHealthCat[] = [
  { k: 'savings', l: 'Savings rate', c: '#1d7d46' }, { k: 'investment', l: 'Investing', c: '#0071e3' },
  { k: 'debt', l: 'Debt control', c: '#b08a36' }, { k: 'protection', l: 'Protection', c: '#0c8079' },
  { k: 'growth', l: 'Income growth', c: '#6e3bd4' },
];

export interface LifeProfile {
  name: string;
  age: number;
  income: number;
  expenses: number;
  savings: number;
  emergency: number;
  invest: number;
  sip: number;
  debtTotal: number;
  debtEmi: number;
  career: string;
  goals: string[];
}

export interface Decision {
  id: string;
  cat: 'invest' | 'safe' | 'buys' | 'earn' | 'traps';
  ic: IconName;
  c: string;
  t: string;
  s: string;
  smart: number;
  bad: number;
  custom: boolean;
  ck?: 'start' | 'stepup';
  ca?: number;
  minAge: number;
  imp: string;
}

export type ShortFmt = (n: number) => string;

/** Verbatim port of lmBuildDecisions(). `sh` is the short currency formatter. */
export function buildDecisions(p: LifeProfile, sh: ShortFmt): Decision[] {
  const surplus = p.income - p.expenses;
  const moCov = p.emergency / Math.max(1, p.expenses);
  const needsBuffer = moCov < 3;
  const hasDebt = p.debtTotal > 0;
  const incH = p.income >= 70000;
  const incM = p.income >= 35000 && p.income < 70000;
  const young = p.age <= 25;

  const list: Decision[] = [];

  /* INVEST */
  if (p.sip === 0) {
    const sug = Math.max(1000, Math.round((surplus * 0.3) / 500) * 500);
    list.push({ id: 'start_sip', cat: 'invest', ic: 'sip', c: 'rgba(0,113,227,.09)', t: `Start SIP of ${sh(sug)}/mo`, s: '~30% of surplus into a Nifty 50 index fund — tap ✏️ to set amount', smart: sug * 12 * 9, bad: 0, custom: true, ck: 'start', ca: sug, minAge: p.age, imp: `+${sh(sug * 12 * 15)} by 45` });
  } else {
    const top = Math.max(1000, Math.round((p.sip * 0.5) / 500) * 500);
    list.push({ id: 'boost_sip', cat: 'invest', ic: 'trending', c: 'rgba(0,113,227,.09)', t: `Step up SIP by ${sh(top)}/mo`, s: `Currently investing ${sh(p.sip)}/mo — tap ✏️ to customise`, smart: top * 12 * 8, bad: 0, custom: true, ck: 'stepup', ca: top, minAge: p.age, imp: `+${sh(top * 12 * 12)} by 45` });
    list.push({ id: 'stepup_10', cat: 'invest', ic: 'arrow-up', c: 'rgba(12,128,121,.09)', t: 'Increase SIP 10% every year', s: 'Match SIP growth to salary increments', smart: p.sip * 12 * 7, bad: 0, custom: false, minAge: p.age, imp: `+${sh(p.sip * 12 * 22)} extra` });
  }
  list.push({ id: 'diversify', cat: 'invest', ic: 'layers', c: 'rgba(0,113,227,.09)', t: 'Diversify: equity + debt + gold', s: 'Spread risk rather than concentrating in one bet', smart: (p.invest || 0) * 0.35 + p.income * 12, bad: 0, custom: false, minAge: p.age, imp: 'Smoother long-term growth' });
  list.push({ id: 'nps', cat: 'invest', ic: 'sun', c: 'rgba(12,128,121,.09)', t: 'Start NPS / PPF for retirement', s: 'Tax-saving + locked long-term compounding under EEE', smart: p.income * 12 * 5, bad: 0, custom: false, minAge: p.age, imp: `+${sh(p.income * 12 * 8)} by 60` });
  list.push({ id: 'elss', cat: 'invest', ic: 'bills', c: 'rgba(176,138,54,.1)', t: 'Maximise ELSS to save ₹46,800 tax/yr', s: '₹1.5L/year in ELSS covers 80C — equity returns + tax free', smart: p.income * 12 * 1.5, bad: 0, custom: false, minAge: p.age, imp: `+${sh(p.income * 3)} in tax savings` });

  /* SAFE */
  if (needsBuffer) {
    const gap = Math.max(0, p.expenses * 6 - p.emergency);
    list.push({ id: 'build_buffer', cat: 'safe', ic: 'shield', c: 'rgba(29,125,70,.09)', t: `Build emergency fund (gap: ${sh(gap)})`, s: `Only ${moCov.toFixed(1)} months covered — target 6 months = ${sh(p.expenses * 6)}`, smart: gap * 0.85, bad: 0, custom: false, minAge: p.age, imp: '+Safety & score' });
  }
  list.push({ id: 'insurance', cat: 'safe', ic: 'health', c: 'rgba(29,125,70,.09)', t: 'Get health + term life insurance', s: 'One hospital bill without cover can wipe years of savings', smart: p.savings * 0.55, bad: -p.expenses * 24, custom: false, minAge: p.age, imp: `Shields ${sh(p.savings * 3)}` });
  if (hasDebt) {
    list.push({ id: 'paydebt', cat: 'safe', ic: 'check', c: 'rgba(29,125,70,.09)', t: `Prepay debt (${sh(p.debtTotal)} outstanding)`, s: 'Pay more than the EMI — interest saved is a guaranteed return', smart: p.debtTotal * 0.42, bad: 0, custom: false, minAge: p.age, imp: `+${sh(p.debtTotal * 0.42)} saved` });
  }
  list.push({ id: 'ccwise', cat: 'safe', ic: 'emi', c: 'rgba(29,125,70,.09)', t: 'Use credit card wisely (pay in full)', s: 'Never revolve balance. Earn rewards, build credit score.', smart: p.expenses * 3, bad: 0, custom: false, minAge: p.age, imp: '+Credit score & rewards' });
  list.push({ id: 'nominees', cat: 'safe', ic: 'bills', c: 'rgba(29,125,70,.09)', t: 'Add nominees & write a basic will', s: 'Ensures your wealth reaches your family smoothly', smart: p.savings * 0.1, bad: 0, custom: false, minAge: p.age, imp: 'Peace of mind' });

  /* BIG BUYS */
  const homeLoan = incH ? 70e5 : incM ? 40e5 : 25e5;
  if (incH || incM) {
    list.push({ id: 'buy_home', cat: 'buys', ic: 'home', c: 'rgba(12,128,121,.09)', t: `Buy a home (loan ~${sh(homeLoan)})`, s: 'Builds equity vs renting — good if you plan to stay 7+ years', smart: homeLoan * 0.65, bad: -homeLoan * 0.28, custom: false, minAge: Math.max(p.age, 27), imp: `+${sh(homeLoan * 0.65)} equity by 45` });
  }
  const carLoan = incH ? 14e5 : 8e5;
  list.push({ id: 'buy_car_loan', cat: 'buys', ic: 'car', c: 'rgba(215,0,21,.07)', t: `Buy car on loan (~${sh(carLoan)})`, s: surplus < 15000 ? '⚠️ EMI will strain your tight budget' : 'Depreciating asset — consider whether you need it', smart: 0, bad: -carLoan * 1.38, custom: false, minAge: p.age, imp: `−${sh(carLoan * 1.38)} net` });
  list.push({ id: 'buy_car_cash', cat: 'buys', ic: 'car', c: 'rgba(29,125,70,.09)', t: 'Buy a used car outright in cash', s: 'Skip the EMI & heavy depreciation — smart if you save first', smart: carLoan * 0.42, bad: 0, custom: false, minAge: p.age, imp: `Saves ${sh(carLoan * 0.55)}` });
  list.push({ id: 'big_wedding', cat: 'buys', ic: 'award', c: 'rgba(215,0,21,.07)', t: 'Finance a big-fat wedding', s: 'Borrowing for one day can delay goals by 3–5 years', smart: 0, bad: -p.income * 18, custom: false, minAge: p.age, imp: `−${sh(p.income * 18)}` });

  /* EARN */
  const cCost = incH ? 150000 : incM ? 75000 : 40000;
  const hikePct = young ? 40 : 28;
  list.push({ id: 'upskill', cat: 'earn', ic: 'briefcase', c: 'rgba(176,138,54,.1)', t: `Upskill — ${sh(cCost)} course, ~${hikePct}% raise`, s: `Certification / PG in your field can fast-track income by ${hikePct}%`, smart: p.income * 12 * (hikePct / 100) * 5, bad: 0, custom: false, minAge: p.age, imp: `+${sh(p.income * 12 * (hikePct / 100) * 10)} lifetime` });
  const hustle = surplus < 10000 ? 12000 : 22000;
  list.push({ id: 'sidehustle', cat: 'earn', ic: 'zap', c: 'rgba(110,59,212,.09)', t: `Side hustle (~${sh(hustle)}/mo extra)`, s: surplus < 10000 ? 'Your surplus is thin — any extra income is high-leverage' : 'Turbocharge your investing runway', smart: hustle * 12 * 6, bad: 0, custom: false, minAge: p.age, imp: `+${sh(hustle * 12 * 10)} over 10 yrs` });
  list.push({ id: 'switchjob', cat: 'earn', ic: 'refresh', c: 'rgba(176,138,54,.1)', t: 'Switch jobs for a 30% raise', s: 'Strategic switches consistently outpace annual increments', smart: p.income * 12 * 0.3 * 5, bad: 0, custom: false, minAge: p.age, imp: `+${sh(p.income * 12 * 0.3 * 8)}` });
  list.push({ id: 'negotiate', cat: 'earn', ic: 'users', c: 'rgba(176,138,54,.1)', t: 'Negotiate salary every year', s: 'Most people never ask — those who do earn meaningfully more', smart: p.income * 12 * 2.2, bad: 0, custom: false, minAge: p.age, imp: `+${sh(p.income * 12 * 0.5)}` });
  list.push({ id: 'passive', cat: 'earn', ic: 'layers', c: 'rgba(12,128,121,.09)', t: 'Build a passive income stream', s: 'Rental yield, dividends, or monetised content — income while you sleep', smart: p.income * 12 * 3, bad: 0, custom: false, minAge: p.age, imp: `+${sh(p.income * 6)}/yr eventually` });

  /* TRAPS */
  list.push({ id: 'ccdebt', cat: 'traps', ic: 'emi', c: 'rgba(215,0,21,.07)', t: 'Revolve credit card balance', s: 'Paying only minimum due at 36%–42% annual interest — pure wealth destruction', smart: 0, bad: -p.expenses * 12, custom: false, minAge: p.age, imp: `−${sh(p.expenses * 12)}` });
  list.push({ id: 'lifestyle_creep', cat: 'traps', ic: 'shopping', c: 'rgba(215,0,21,.07)', t: 'Upgrade lifestyle with every raise', s: 'Spending rises as fast as income — savings stay flat forever', smart: 0, bad: -p.income * 12 * 0.85, custom: false, minAge: p.age, imp: `−${sh(p.income * 12 * 0.85)}` });
  list.push({ id: 'fno', cat: 'traps', ic: 'warn', c: 'rgba(215,0,21,.07)', t: 'Trade F&O / meme coins', s: '90%+ of retail F&O traders lose money — SEBI data 2024', smart: 0, bad: -(p.savings * 0.65), custom: false, minAge: p.age, imp: `−${sh(p.savings * 0.65)}` });
  list.push({ id: 'bnpl', cat: 'traps', ic: 'subs', c: 'rgba(215,0,21,.07)', t: 'Buy gadgets on BNPL / EMI every year', s: 'Latest phone every upgrade cycle — hidden interest + lifestyle trap', smart: 0, bad: -p.expenses * 5, custom: false, minAge: p.age, imp: `−${sh(p.expenses * 5)}` });
  list.push({ id: 'notrack', cat: 'traps', ic: 'warn', c: 'rgba(215,0,21,.07)', t: 'Never track spending', s: 'Untracked money leaks 15–20% of income — invisible losses compound', smart: 0, bad: -p.income * 12 * 0.55, custom: false, minAge: p.age, imp: `−${sh(p.income * 12 * 0.55)}` });
  list.push({ id: 'lend_friends', cat: 'traps', ic: 'users', c: 'rgba(215,0,21,.07)', t: 'Lend large sums to friends informally', s: 'Often never returned — both money and friendship lost', smart: 0, bad: -p.savings * 0.28, custom: false, minAge: p.age, imp: `−${sh(p.savings * 0.28)}` });
  list.push({ id: 'noinsure', cat: 'traps', ic: 'health', c: 'rgba(215,0,21,.07)', t: 'Skip health insurance to save premium', s: 'A single hospitalisation without cover erases years of savings', smart: 0, bad: -p.expenses * 36, custom: false, minAge: p.age, imp: `−${sh(p.expenses * 36)}` });

  return list;
}

/** Apply a custom SIP amount to a decision (port of lmConfirmDialog's mutation). */
export function updateCustomDecision(d: Decision, amt: number, sh: ShortFmt): Decision {
  const ca = Math.max(500, amt || 1000);
  if (d.ck === 'start') {
    return { ...d, ca, t: `Start SIP of ${sh(ca)}/mo`, imp: `+${sh(ca * 12 * 15)} by 45`, smart: ca * 12 * 9 };
  }
  return { ...d, ca, t: `Step up SIP by ${sh(ca)}/mo`, imp: `+${sh(ca * 12 * 12)} by 45`, smart: ca * 12 * 8 };
}

const BAD_DECISIONS = ['ccdebt', 'lifestyle_creep', 'fno', 'bnpl', 'notrack', 'lend_friends', 'noinsure', 'buy_car_loan', 'big_wedding'];

/** Verbatim port of lmCalcWealth(). */
export function calcWealth(p: LifeProfile, dec: Decision[], applied: Set<string>, age: number, smart: boolean): number {
  const years = age - p.age;
  if (years < 0) return p.savings + p.invest - p.debtTotal;
  const netStart = p.savings + p.invest - p.debtTotal;
  const surplus = p.income - p.expenses;
  const gr = smart ? 0.115 : 0.038;
  const annualSurplus = surplus * 12;
  const annualSip = p.sip * 12;
  const cb = LM_CAREER_BOOST[p.career] || 1.0;

  let base = netStart * Math.pow(1 + gr, years);
  if (annualSurplus > 0) base += (annualSurplus * (Math.pow(1 + gr, years) - 1)) / gr * (smart ? 0.68 : 0.18);
  if (annualSip > 0) base += (annualSip * (Math.pow(1 + gr, years) - 1)) / gr;

  let bonus = 0;
  const lifespan = Math.max(1, 60 - p.age);
  dec.forEach((d) => {
    if (applied.has(d.id) && age >= d.minAge) {
      const frac = Math.min(1, years / lifespan);
      bonus += (smart ? d.smart : d.bad) * frac;
    }
  });

  let smartPenalty = 0;
  if (smart) {
    BAD_DECISIONS.forEach((id) => {
      if (applied.has(id)) {
        const d = dec.find((x) => x.id === id);
        if (d) smartPenalty += d.bad * Math.min(1, years / lifespan) * 0.5;
      }
    });
  }
  return Math.max(0, base * (smart ? cb : 1.0) + bonus + (smart ? smartPenalty : 0));
}

/** Verbatim port of lmCalcScore(). */
export function calcScore(p: LifeProfile, applied: Set<string>): number {
  const surplus = p.income - p.expenses;
  const savR = surplus / Math.max(1, p.income);
  const moCov = p.emergency / Math.max(1, p.expenses);
  const emiR = p.debtEmi / Math.max(1, p.income);

  const efPts = moCov >= 6 ? 18 : moCov >= 3 ? 13 : moCov >= 1 ? 6 : 0;
  const invPts = (p.sip > 0 ? 22 : p.invest > 0 ? 12 : 0)
    + (applied.has('start_sip') ? 22 : 0)
    + (applied.has('boost_sip') ? 10 : 0)
    + (applied.has('stepup_10') ? 6 : 0)
    + (applied.has('diversify') ? 5 : 0)
    + (applied.has('nps') ? 5 : 0)
    + (applied.has('elss') ? 5 : 0);
  const protPts = (applied.has('insurance') ? 12 : 0)
    + (applied.has('build_buffer') ? 10 : 0)
    + (applied.has('nominees') ? 4 : 0);
  const earnPts = (applied.has('upskill') ? 8 : 0)
    + (applied.has('sidehustle') ? 8 : 0)
    + (applied.has('switchjob') ? 5 : 0)
    + (applied.has('negotiate') ? 5 : 0)
    + (applied.has('passive') ? 5 : 0);
  let debtPts = emiR >= 0.4 ? -15 : emiR >= 0.25 ? -8 : emiR > 0 ? -3 : 0;
  if (applied.has('paydebt')) debtPts = Math.round(debtPts / 2);
  if (applied.has('ccwise')) debtPts += 6;
  const badPts = (applied.has('ccdebt') ? -20 : 0)
    + (applied.has('lifestyle_creep') ? -14 : 0)
    + (applied.has('fno') ? -16 : 0)
    + (applied.has('bnpl') ? -8 : 0)
    + (applied.has('notrack') ? -9 : 0)
    + (applied.has('lend_friends') ? -6 : 0)
    + (applied.has('noinsure') ? -11 : 0)
    + (applied.has('buy_car_loan') ? -5 : 0)
    + (applied.has('big_wedding') ? -8 : 0);

  const raw = Math.round(savR * 28 + Math.min(30, invPts) + efPts + protPts + earnPts + debtPts + badPts + 5);
  return Math.min(100, Math.max(0, raw));
}

export interface HealthScores { savings: number; investment: number; debt: number; protection: number; growth: number }

/** Verbatim port of lmCalcHealth(). */
export function calcHealth(p: LifeProfile, applied: Set<string>): HealthScores {
  const surplus = p.income - p.expenses;
  const savR = Math.min(1, surplus / Math.max(1, p.income));
  const moCov = p.emergency / Math.max(1, p.expenses);
  const emiR = p.debtEmi / Math.max(1, p.income);

  let savings = Math.round(savR * 200);
  savings = Math.min(100, Math.max(0, savings));

  let investment = p.sip > 0 ? 72 : p.invest > 0 ? 48 : 10;
  if (applied.has('start_sip')) investment = 78;
  if (applied.has('boost_sip') || applied.has('stepup_10')) investment = Math.min(100, investment + 14);
  if (applied.has('diversify')) investment = Math.min(100, investment + 8);
  if (applied.has('nps') || applied.has('elss')) investment = Math.min(100, investment + 6);
  if (applied.has('fno')) investment = Math.max(5, investment - 28);

  let debt = emiR >= 0.4 ? 38 : emiR >= 0.25 ? 60 : emiR > 0 ? 78 : 92;
  if (applied.has('paydebt')) debt = Math.min(100, debt + 14);
  if (applied.has('ccwise')) debt = Math.min(100, debt + 7);
  if (applied.has('ccdebt')) debt = Math.min(debt, 8);
  if (applied.has('buy_car_loan')) debt = Math.min(debt, 55);
  if (applied.has('bnpl')) debt = Math.max(0, debt - 18);
  if (applied.has('lifestyle_creep')) debt = Math.max(0, debt - 18);
  if (applied.has('notrack')) debt = Math.max(0, debt - 14);
  debt = Math.min(100, Math.max(0, debt));

  let protection = moCov >= 6 ? 78 : moCov >= 3 ? 58 : moCov >= 1 ? 32 : 12;
  if (applied.has('build_buffer')) protection = Math.max(protection, 68);
  if (applied.has('insurance')) protection = Math.min(100, protection + 20);
  if (applied.has('nominees')) protection = Math.min(100, protection + 7);
  if (applied.has('noinsure')) protection = Math.max(5, protection - 28);
  if (applied.has('lend_friends')) protection = Math.max(5, protection - 10);

  let growth = 35;
  if (applied.has('upskill')) growth = 88;
  else if (applied.has('switchjob')) growth = 75;
  else if (applied.has('sidehustle')) growth = 68;
  else if (applied.has('negotiate')) growth = 58;
  else if (applied.has('passive')) growth = 52;

  return { savings, investment, debt, protection, growth };
}

/** Profile builder — port of lmStart()'s input clamping. */
export function buildProfile(raw: {
  name: string; age: number; income: number; expenses: number; savings: number; emergency: number;
  invest: number; sipYn: boolean; sip: number; debtYn: boolean; debtTotal: number; debtEmi: number;
  career: string; goals: string[];
}): LifeProfile {
  const age = Math.min(45, Math.max(16, raw.age || 22));
  const income = Math.max(1, raw.income || 30000);
  const expenses = raw.expenses || 20000;
  const savings = raw.savings;
  const emergency = Math.min(raw.emergency, savings);
  const invest = raw.invest;
  const sip = raw.sipYn ? raw.sip || 0 : 0;
  const debtTotal = raw.debtYn ? raw.debtTotal : 0;
  const debtEmi = raw.debtYn ? raw.debtEmi : 0;
  const name = raw.name.trim() || 'Friend';
  return { name, age, income, expenses, savings, emergency, invest, sip, debtTotal, debtEmi, career: raw.career, goals: raw.goals };
}
