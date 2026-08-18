/**
 * Unified dashboard data layer.
 *
 * Reads each tool's saved state (localStorage) and derives one connected
 * snapshot for the dashboard. It NEVER re-implements a formula — it calls the
 * exact same compute functions the tools use (computeBudget, computeGoalPlanner,
 * computeInvestMatch, …) so every number on the dashboard matches its tool to
 * the rupee. Everything is defensive: a tool that was never opened simply
 * reports `done: false`, and the UI shows a guiding empty state instead of a
 * fabricated figure. Pure/read-only; no writes, no side effects.
 */
import { store, getJSON } from './storage';
import { currentMonth } from './month';
import { computeBudget, allCategories, type BudgetStore } from './budget';
import { loadCatView } from './budgetCats';
import { loadExpenses, migrateCategory, ET_CATS } from './expense';
import { computeGoalPlanner } from './goals';
import { computeInvestMatch, IM_DEFAULTS, IM_RL, type ImAnswers } from './investmatch';
import { readActivity } from './activity';
import { changeBetween, computeNetWorth, loadAccounts, netWorthSeries, type Change } from './netWorth';

export type PillarId = 'budget' | 'expenses' | 'goals' | 'investmatch' | 'parksmart' | 'peercompare' | 'lifemap';

export interface Pillar {
  id: PillarId;
  label: string;
  href: string;
  /** The user has meaningfully used this tool. */
  done: boolean;
  /** One-line status shown under the pillar. */
  detail: string;
}

export interface SpendSlice {
  key: string;
  label: string;
  amount: number;
}

export interface DashboardSnapshot {
  currency: string;
  hasAnyData: boolean;
  activeCount: number;
  totalPillars: number;

  /** 0–100, or null when there's nothing to score yet. */
  healthScore: number | null;
  healthLabel: string;
  /** Human methodology line, e.g. "Based on 3 of 6 areas you've set up." */
  healthBasis: string;

  income: number | null;
  monthlySpend: number | null;
  netCashflow: number | null;
  savingsRatePct: number | null;

  goal: { name: string; target: number; years: number; monthlySip: number; progressPct: number } | null;
  /**
   * The current balance sheet, or null when nothing has been recorded.
   *
   * Deliberately NOT a pillar and not part of the health score: those two
   * describe how much of the journey has been set up, and quietly adding an
   * eighth area would change what every existing score meant without anything
   * about the user's finances having changed.
   */
  netWorth: {
    month: string;
    net: number;
    assets: number;
    liabilities: number;
    /** Against the previous month, when there is one to compare with. */
    change: Change | null;
  } | null;
  invest: { profile: string; monthly: number; projected: number; years: number; alloc: Array<{ label: string; pct: number }> } | null;
  topCategories: SpendSlice[];

  insights: Array<{ tone: 'ok' | 'info' | 'warn'; text: string }>;
  pillars: Pillar[];
  nextAction: { href: string; label: string; reason: string } | null;
  /** Earned/locked milestones — motivating, and strictly derived from state. */
  achievements: Array<{ id: string; label: string; desc: string; earned: boolean }>;
  /** Cross-tool "do this next" suggestions beyond the single next action. */
  recommendations: Array<{ href: string; label: string; reason: string }>;
  /** Real, timestamped tool activity (most-recent first). */
  recentActivity: Array<{ id: string; label: string; href: string; ts: number }>;
  updatedAt: number;
}

const ACTIVITY_META: Record<string, { label: string; href: string }> = {
  fx_bb_data: { label: 'Budget', href: '/tools/budget' },
  fx_expenses: { label: 'Expense Tracker', href: '/tools/expenses' },
  fx_goals: { label: 'Goal Planner', href: '/tools/goals' },
  fx_investmatch: { label: 'InvestMatch', href: '/tools/investmatch' },
  fx_parksmart: { label: 'ParkSmart', href: '/tools/parksmart' },
  fx_peercompare: { label: 'PeerCompare', href: '/tools/peercompare' },
  fx_lifemap: { label: 'LifeMap', href: '/tools/lifemap' },
  fx_networth: { label: 'Net Worth', href: '/tools/networth' },
};

const GOAL_KEYS = { name: 'gp-name', target: 'gp-target', years: 'gp-years', existing: 'gp-existing', inflate: 'gp-inflate' } as const;

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function healthLabelFor(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Healthy';
  if (score >= 40) return 'Building';
  return 'Getting started';
}

/** Read the whole picture. Safe to call on every render (cheap, synchronous). */
export function readDashboard(): DashboardSnapshot {
  const currency = store.get('fx_currency', 'INR') || 'INR';
  const cm = currentMonth();

  /**
   * The user's live categories, resolved once for the whole snapshot.
   *
   * "Top categories" used to label rows from `ET_CATS` alone — the RETIRED
   * pre-V4.1 table (`food`, `grocery`, `bills`…). Since the merge, transactions
   * are stored under Budget Builder's keys (`eating_out`, `groceries`,
   * `utilities`…), only four of which happen to collide with the old table. Every
   * other category — and every category the user created themselves — therefore
   * fell through to the `?? 'Other'` fallback, so the unified dashboard's
   * flagship card read "Other, Other, Other, Other" for anyone with modern data.
   *
   * `ET_CATS` is kept as the fallback because it is still the only source of a
   * readable name for a genuinely legacy key that no longer maps anywhere.
   */
  const catView = loadCatView().active;
  const flatCats = allCategories(catView);
  const validCatKeys = new Set(flatCats.map((c) => c.k));
  const catLabels = new Map(flatCats.map((c) => [c.k, c.l]));

  // ── Budget ──────────────────────────────────────────────────────────────
  let income: number | null = null;
  let savingsRatePct: number | null = null;
  let budgetDone = false;
  let budgetScore = 0;
  const budgetTips: Array<{ tone: 'ok' | 'info' | 'warn'; text: string }> = [];
  try {
    const bstore = getJSON<BudgetStore>('fx_bb_data', {});
    const months = Object.keys(bstore).sort();
    const bkey = bstore[cm] ? cm : months[months.length - 1];
    const bdata = bkey ? bstore[bkey] : undefined;
    if (bdata) {
      const r = computeBudget(
        { incomeRaw: bdata.income, needsRaw: bdata.n, wantsRaw: bdata.w, saveRaw: bdata.s, vals: bdata.vals },
        catView,
      );
      // "Meaningfully used" = they entered spending or changed income off the seed.
      const touched = r.spent > 0 || (num(bdata.income) > 0 && num(bdata.income) !== 50000);
      if (touched) {
        budgetDone = true;
        income = r.income;
        savingsRatePct = r.income > 0 ? Math.round((r.sT / r.income) * 100) : 0;
        budgetScore = Math.max(0, Math.min(100, Math.round(((savingsRatePct ?? 0) / 20) * 100)));
        if (!r.pos) budgetScore = Math.min(budgetScore, 35);
        r.tips.slice(0, 1).forEach((t) => budgetTips.push({ tone: t[0] === 'warn' ? 'warn' : t[0] === 'ok' ? 'ok' : 'info', text: t[1] }));
      }
    }
  } catch { /* budget stays empty */ }

  // ── Expenses ────────────────────────────────────────────────────────────
  let monthlySpend: number | null = null;
  let prevMonthSpend: number | null = null;
  let expensesDone = false;
  let expenseScore = 0;
  const topCategories: SpendSlice[] = [];
  try {
    const items = loadExpenses();
    if (items.length > 0) {
      expensesDone = true;
      const monthItems = items.filter((e) => (e.date || '').slice(0, 7) === cm);
      monthlySpend = monthItems.reduce((s, e) => s + num(e.amount), 0);
      // Previous calendar month (YYYY-MM) — for an honest spend-trend signal.
      const [cy, cmo] = cm.split('-').map(Number);
      const pd = new Date(cy, (cmo - 1) - 1, 1);
      const prevKey = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
      const prevItems = items.filter((e) => (e.date || '').slice(0, 7) === prevKey);
      if (prevItems.length > 0) prevMonthSpend = prevItems.reduce((s, e) => s + num(e.amount), 0);
      // Keys are migrated before summing, exactly as computeDashboard does, so a
      // legacy `food` row and a current `eating_out` row are one slice rather
      // than two competing ones.
      const byCat: Record<string, number> = {};
      monthItems.forEach((e) => {
        const k = migrateCategory(e.category, validCatKeys);
        byCat[k] = (byCat[k] || 0) + num(e.amount);
      });
      Object.entries(byCat)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .forEach(([key, amount]) => topCategories.push({
          key,
          label: catLabels.get(key) ?? ET_CATS[key]?.l ?? 'Other',
          amount,
        }));
      if (income && income > 0 && monthlySpend > 0) {
        const ratio = monthlySpend / income;
        expenseScore = Math.max(0, Math.min(100, Math.round((1 - Math.max(0, ratio - 0.5) / 0.5) * 100)));
      } else {
        expenseScore = 70;
      }
    }
  } catch { /* expenses stay empty */ }

  const netCashflow = income != null && monthlySpend != null ? income - monthlySpend : null;

  // ── Goals ───────────────────────────────────────────────────────────────
  let goal: DashboardSnapshot['goal'] = null;
  let goalsDone = false;
  let goalScore = 0;
  try {
    const g = getJSON<Record<string, string | boolean>>('fx_goals', {});
    const targetToday = num(g[GOAL_KEYS.target]);
    if (targetToday >= 1000) {
      const res = computeGoalPlanner({
        name: String(g[GOAL_KEYS.name] ?? 'Your goal'),
        targetToday,
        years: num(g[GOAL_KEYS.years]) || 10,
        existing: num(g[GOAL_KEYS.existing]),
        inflate: g[GOAL_KEYS.inflate] != null ? Boolean(g[GOAL_KEYS.inflate]) : true,
      });
      if (res.valid && res.results.length) {
        goalsDone = true;
        const path = res.results[0];
        const progressPct = res.target > 0 ? Math.max(0, Math.min(100, Math.round((num(g[GOAL_KEYS.existing]) / res.target) * 100))) : 0;
        goal = { name: res.name, target: res.target, years: res.years, monthlySip: Math.round(path.monthly), progressPct };
        goalScore = Math.min(100, 50 + Math.round(progressPct * 0.5));
      }
    }
  } catch { /* goals stay empty */ }

  // ── InvestMatch ─────────────────────────────────────────────────────────
  let invest: DashboardSnapshot['invest'] = null;
  let investDone = false;
  let investScore = 0;
  try {
    const saved = getJSON<{ a?: Partial<ImAnswers> }>('fx_investmatch', {});
    if (saved.a && Object.keys(saved.a).length > 0) {
      const ans: ImAnswers = { ...IM_DEFAULTS, ...saved.a };
      const res = computeInvestMatch(ans);
      if (!res.tooLow) {
        investDone = true;
        invest = {
          profile: IM_RL[res.effRisk] ?? 'Moderate',
          monthly: ans.monthly,
          projected: Math.round(res.fv),
          years: res.years,
          alloc: res.alloc.map((a) => ({ label: a.n, pct: a.p })),
        };
        const share = ans.income > 0 ? ans.monthly / ans.income : 0;
        investScore = Math.min(100, 80 + Math.round(Math.min(share, 0.2) / 0.2 * 20));
      }
    }
  } catch { /* invest stays empty */ }

  // ── ParkSmart / PeerCompare / LifeMap (presence only) ────────────────────
  const parkUsed = (() => { try { const s = getJSON<Record<string, string>>('fx_parksmart', {}); return num(s['ps-amount']) > 0; } catch { return false; } })();
  const peerUsed = (() => { try { const s = getJSON<Record<string, string>>('fx_peercompare', {}); return Object.keys(s).length > 0; } catch { return false; } })();
  const lifeUsed = (() => { try { const s = getJSON<Record<string, unknown>>('fx_lifemap', {}); return Object.keys(s).length > 0; } catch { return false; } })();

  // ── Net worth (read through the tool's own model, never re-derived) ──────
  const netWorth = (() => {
    try {
      const accounts = loadAccounts();
      if (!accounts.length) return null;
      const snapshot = computeNetWorth(accounts, cm);
      const series = netWorthSeries(accounts, cm);
      const prior = series.length > 1 ? series[series.length - 2] : null;
      return {
        month: cm,
        net: snapshot.net,
        assets: snapshot.assets,
        liabilities: snapshot.liabilities,
        change: prior ? changeBetween(prior.net, snapshot.net) : null,
      };
    } catch {
      return null;
    }
  })();

  // ── Pillars (the financial journey) ──────────────────────────────────────
  const pillars: Pillar[] = [
    { id: 'budget', label: 'Budget', href: '/tools/budget', done: budgetDone, detail: budgetDone && income ? 'Income & plan set' : 'Plan your 50/30/20' },
    { id: 'expenses', label: 'Track spending', href: '/tools/expenses', done: expensesDone, detail: expensesDone ? 'Logging expenses' : 'Log your first expense' },
    { id: 'goals', label: 'Set a goal', href: '/tools/goals', done: goalsDone, detail: goalsDone && goal ? goal.name : 'Work back to a monthly SIP' },
    { id: 'investmatch', label: 'Invest', href: '/tools/investmatch', done: investDone, detail: investDone && invest ? `${invest.profile} portfolio` : 'Match a portfolio to your risk' },
    { id: 'parksmart', label: 'Park cash', href: '/tools/parksmart', done: parkUsed, detail: parkUsed ? 'Idle cash optimised' : 'Best post-tax home for cash' },
    { id: 'peercompare', label: 'Benchmark', href: '/tools/peercompare', done: peerUsed, detail: peerUsed ? 'Compared to peers' : 'See where you stand' },
    { id: 'lifemap', label: 'Plan life', href: '/tools/lifemap', done: lifeUsed, detail: lifeUsed ? 'Life simulated' : 'Simulate your whole journey' },
  ];
  const activeCount = pillars.filter((p) => p.done).length;
  const totalPillars = pillars.length;
  const hasAnyData = activeCount > 0;

  // ── Health score (transparent: average of the areas actually set up) ─────
  const parts: number[] = [];
  if (budgetDone) parts.push(budgetScore);
  if (expensesDone) parts.push(expenseScore);
  if (goalsDone) parts.push(goalScore);
  if (investDone) parts.push(investScore);
  if (parkUsed) parts.push(75);
  if (peerUsed) parts.push(75);
  if (lifeUsed) parts.push(75);
  const healthScore = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
  const healthLabel = healthScore == null ? 'Not started' : healthLabelFor(healthScore);
  const healthBasis = healthScore == null
    ? 'Complete your first tool to see your score.'
    : `Based on ${parts.length} of ${totalPillars} areas you've set up.`;

  // ── Insights (honest, derived — reuse the tools' own guidance) ───────────
  const insights: DashboardSnapshot['insights'] = [];
  if (savingsRatePct != null) {
    if (savingsRatePct >= 20) insights.push({ tone: 'ok', text: `You're saving ${savingsRatePct}% of income — at or above the 20% target.` });
    else if (savingsRatePct > 0) insights.push({ tone: 'info', text: `You're saving ${savingsRatePct}% of income. Nudging toward 20% compounds meaningfully.` });
  }
  if (netCashflow != null) {
    if (netCashflow < 0) insights.push({ tone: 'warn', text: 'You spent more than you earned this month. Trimming one want gets you back to positive.' });
    else if (netCashflow > 0 && income) insights.push({ tone: 'ok', text: `Positive cashflow this month — ${Math.round((netCashflow / income) * 100)}% of income is unspent.` });
  }
  // Spend trend vs last month — honest, only when both months have data.
  if (monthlySpend != null && prevMonthSpend != null && prevMonthSpend > 0 && insights.length < 3) {
    const deltaPct = Math.round(((monthlySpend - prevMonthSpend) / prevMonthSpend) * 100);
    if (deltaPct >= 15) insights.push({ tone: 'warn', text: `Spending is up ${deltaPct}% vs last month — worth a quick look at what changed.` });
    else if (deltaPct <= -15) insights.push({ tone: 'ok', text: `Spending is down ${Math.abs(deltaPct)}% vs last month — nice discipline.` });
  }
  budgetTips.forEach((t) => { if (insights.length < 3) insights.push(t); });
  if (goal && goal.progressPct > 0 && insights.length < 3) insights.push({ tone: 'info', text: `${goal.name} is ${goal.progressPct}% funded — keep the SIP running to stay on track.` });

  // ── Next best action ─────────────────────────────────────────────────────
  const firstTodo = pillars.find((p) => !p.done);
  const nextAction = firstTodo
    ? { href: firstTodo.href, label: firstTodo.label, reason: firstTodo.detail }
    : null;

  // ── Achievements (earned strictly from real state) ───────────────────────
  const achievements = [
    { id: 'start', label: 'First step', desc: 'Set up your first tool', earned: activeCount >= 1 },
    { id: 'saver', label: 'Steady saver', desc: 'Save 20%+ of income', earned: (savingsRatePct ?? 0) >= 20 },
    { id: 'positive', label: 'In the black', desc: 'Positive monthly cashflow', earned: netCashflow != null && netCashflow >= 0 },
    { id: 'goal', label: 'Goal-setter', desc: 'Define a financial goal', earned: !!goal },
    { id: 'investor', label: 'Investor', desc: 'Create an investing plan', earned: !!invest },
    { id: 'connected', label: 'Connected', desc: 'Use four or more tools', earned: activeCount >= 4 },
  ];

  // ── Connected recommendations (cross-tool, honest) ───────────────────────
  const recommendations: DashboardSnapshot['recommendations'] = [];
  if (netCashflow != null && netCashflow < 0) recommendations.push({ href: '/tools/budget', label: 'Rebalance your budget', reason: 'You spent more than you earned this month.' });
  if ((savingsRatePct ?? 100) < 10 && income != null) recommendations.push({ href: '/tools/budget', label: 'Find room to save', reason: 'Your savings rate is under 10%.' });
  if ((savingsRatePct ?? 0) >= 15 && !goal) recommendations.push({ href: '/tools/goals', label: 'Give your savings a target', reason: "You're saving well — a goal turns it into a plan." });
  if (goal && !invest) recommendations.push({ href: '/tools/investmatch', label: 'Put your goal on autopilot', reason: 'Match a portfolio to reach it faster.' });
  if (invest && !goal) recommendations.push({ href: '/tools/goals', label: 'Give your investing a destination', reason: 'A goal keeps your SIP on track.' });
  if (income != null && monthlySpend == null) recommendations.push({ href: '/tools/expenses', label: 'See where your money goes', reason: 'Track a few days of spending.' });

  // ── Recent activity (real timestamps) ────────────────────────────────────
  const recentActivity = readActivity()
    .filter((e) => ACTIVITY_META[e.key])
    .map((e) => ({ id: e.key, label: ACTIVITY_META[e.key].label, href: ACTIVITY_META[e.key].href, ts: e.ts }));

  return {
    currency,
    hasAnyData,
    activeCount,
    totalPillars,
    healthScore,
    healthLabel,
    healthBasis,
    income,
    monthlySpend,
    netCashflow,
    savingsRatePct,
    goal,
    invest,
    netWorth,
    topCategories,
    insights: insights.slice(0, 3),
    pillars,
    nextAction,
    achievements,
    recommendations: recommendations.slice(0, 2),
    recentActivity,
    updatedAt: Date.now(),
  };
}
