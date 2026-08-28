/**
 * FinatriX scores — how good is this plan, and how well was it executed.
 *
 * TWO SCORES, TWO QUESTIONS
 * -------------------------
 *   Plan score      (Budget Builder)  — is this a good budget?
 *   Execution score (Expense Tracker) — did the month match it?
 *
 * They are deliberately separate. A beautiful plan nobody follows and a chaotic
 * month that happened to land near an arbitrary plan are different failures, and
 * a single blended number would hide both.
 *
 * THE ONE DESIGN RULE: EVERY INPUT IS A RATIO
 * -------------------------------------------
 * Not one component of either score reads an amount. Every input is a
 * proportion — saved ÷ income, wants ÷ income, spent ÷ budgeted, this month ÷
 * last month. That is what makes the same scale honest for somebody budgeting
 * 800 a month and somebody budgeting eighty million, in any currency, with no
 * thresholds to localise and nothing to re-tune as a user's income changes.
 * A rule that reads an amount is a rule that is wrong for most of the world.
 *
 * FAIRNESS ACROSS INCOMES
 * -----------------------
 * A low earner spends a high share of income on necessities and can do nothing
 * about it. So no component scores *needs* as a share of income — that would
 * grade people on their salary and call it discipline. What is scored instead:
 *
 *   • fidelity to their own plan (income-neutral by construction),
 *   • what they save (a rate, on a curve where the first few percent are worth
 *     the most — 5% saved on a small income is a real achievement),
 *   • discretionary restraint, measured on WANTS only, which is the part of
 *     spending that genuinely reflects a choice,
 *   • improvement against their own recent history, which is the only measure
 *     that is fair to everybody because everyone is compared to themselves.
 *
 * NO CURVE SATURATES INTO A DEAD ZONE
 * -----------------------------------
 * Every component is a smooth function with no cliff, so one extra percent of
 * saving always moves the number and there is no threshold to game. Components
 * that cannot be measured (no income recorded, no history yet) are *dropped*
 * and the remaining weights renormalise — never scored as zero, which would
 * punish a new user for being new.
 *
 * Everything here is pure.
 */
import { allCategories, type BudgetResult, type SectionedCats } from './budget';
import { isSpendingCategory, migrateCategory, splitOutflow, type ExpenseItem } from './expense';
import { ymLocal } from '../../lib/date';

/* ══════════════════════════════════════════════════════════════════════════
   Shared shapes
   ══════════════════════════════════════════════════════════════════════════ */

export type Grade = 'exceptional' | 'excellent' | 'strong' | 'fair' | 'building' | 'attention';

export interface ScoreComponent {
  key: string;
  /** What this component measures, in the user's words. */
  label: string;
  /** 0–100. */
  score: number;
  /** Share of the final score this component carried, after renormalisation. */
  weight: number;
  /** One sentence saying what produced this number. Never a bare figure. */
  detail: string;
}

export interface ScoreResult {
  /** 0–100, rounded. */
  score: number;
  grade: Grade;
  /** Short label for the grade — "Excellent", "Building". */
  gradeLabel: string;
  /** One sentence a person could repeat aloud. */
  headline: string;
  /** The components that were measurable, heaviest first. */
  components: ScoreComponent[];
  /** Components that could not be measured, and what would make them so. */
  unmeasured: Array<{ label: string; reason: string }>;
  /** The single highest-value thing to do next. Null when there is nothing to say. */
  nextStep: string | null;
  /** True when too little is known to score at all. */
  insufficient: boolean;
}

const GRADE_BANDS: ReadonlyArray<{ min: number; grade: Grade; label: string }> = [
  { min: 92, grade: 'exceptional', label: 'Exceptional' },
  { min: 82, grade: 'excellent', label: 'Excellent' },
  { min: 70, grade: 'strong', label: 'Strong' },
  { min: 55, grade: 'fair', label: 'Fair' },
  { min: 35, grade: 'building', label: 'Building' },
  { min: 0, grade: 'attention', label: 'Needs attention' },
];

export function gradeFor(score: number): { grade: Grade; label: string } {
  const band = GRADE_BANDS.find((b) => score >= b.min) ?? GRADE_BANDS[GRADE_BANDS.length - 1];
  return { grade: band.grade, label: band.label };
}

/** Colour token per grade, so every surface paints a score the same way. */
export const GRADE_COLOR: Record<Grade, string> = {
  exceptional: 'var(--green)',
  excellent: 'var(--green)',
  strong: 'var(--blue)',
  fair: 'var(--gold)',
  building: 'var(--orange)',
  attention: 'var(--red)',
};

const clamp = (n: number, lo = 0, hi = 100): number => Math.min(hi, Math.max(lo, n));

/**
 * Combine weighted components, renormalising over whatever was measurable.
 *
 * The renormalisation is the important half. A user with no income recorded
 * cannot be scored on savings rate, and scoring them zero for it would mean the
 * product's answer to "I have not told you my income" is "you are failing".
 */
function combine(parts: Array<{ c: Omit<ScoreComponent, 'weight'>; weight: number } | null>): {
  score: number; components: ScoreComponent[];
} {
  const live = parts.filter((p): p is { c: Omit<ScoreComponent, 'weight'>; weight: number } => p !== null);
  const total = live.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) return { score: 0, components: [] };
  const components = live
    .map((p) => ({ ...p.c, weight: p.weight / total }))
    .sort((a, b) => b.weight - a.weight);
  const score = components.reduce((s, c) => s + c.score * c.weight, 0);
  return { score: clamp(score), components };
}

/* ══════════════════════════════════════════════════════════════════════════
   The curves
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Savings rate → 0–100.
 *
 * `100 · (1 − e^(−k·rate))` with k chosen so that 10% saved scores 50 and 20%
 * scores 75. Diminishing returns are the point: the first rupee saved by
 * somebody saving nothing is worth far more than the ten-thousandth saved by
 * somebody already at 40%, and a linear scale would say the opposite.
 *
 * It approaches but never reaches 100, so there is always a reason to save more
 * and never a threshold at which the number stops responding.
 */
const SAVINGS_K = Math.log(4) / 0.2; // ≈ 6.93
export function savingsRateScore(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return clamp(100 * (1 - Math.exp(-SAVINGS_K * Math.min(rate, 1))));
}

/**
 * Discretionary restraint: wants as a share of income → 0–100.
 *
 * 100 at or below 10%, falling smoothly to 0 at 40% and beyond. Wants is the
 * right numerator because it is the part of spending that is genuinely a
 * choice — scoring total spending here would grade somebody on how expensive
 * their rent is.
 *
 * Smoothstep rather than a straight line so the ends are flat: nudging 9% to 8%
 * should not move the score, and neither should 45% to 44% — those are not the
 * decisions this component is trying to reward.
 */
export function wantsShareScore(share: number): number {
  if (!Number.isFinite(share) || share <= 0.10) return 100;
  if (share >= 0.40) return 0;
  const t = (0.40 - share) / 0.30;             // 1 at 10%, 0 at 40%
  return clamp(100 * t * t * (3 - 2 * t));     // smoothstep
}

/**
 * Fidelity of one category's actual against its budget → 0–100.
 *
 * Asymmetric on purpose, and the asymmetry is the product opinion:
 *
 *   • Overspending decays exponentially. 10% over still scores 78; 50% over
 *     scores 29; double the budget scores 8. A budget that is routinely blown
 *     is not a budget.
 *   • Underspending costs very little. Coming in 20% under is 97, and spending
 *     nothing at all is still 60. Underspending is not a failure — but a
 *     category budgeted at ten times what is ever spent is a plan that is not
 *     describing reality, and the gentle slope says so without scolding.
 */
export function fidelityScore(budget: number, actual: number): number {
  if (budget <= 0) return actual > 0 ? 0 : 100;
  const ratio = actual / budget;
  if (ratio > 1) return clamp(100 * Math.exp(-2.5 * (ratio - 1)));
  const under = 1 - ratio;
  return clamp(100 - 40 * Math.pow(under, 1.5));
}

/**
 * Improvement against the user's own recent history → 0–100.
 *
 * Centred on 60, not 0: holding steady is a perfectly good month and scoring it
 * near zero would make the only way to score well a permanent decline in
 * spending, which is neither possible nor desirable. Movement in either
 * direction is worth up to 40 points, and the two halves — consumption down,
 * saving up — are weighted equally because either one is real progress.
 */
export function momentumScore(consumptionChange: number | null, savingsChange: number | null): number {
  const parts: number[] = [];
  // A 20% fall in consumption earns the full +40; a 20% rise costs the full −40.
  if (consumptionChange !== null) parts.push(clamp(60 - (consumptionChange / 0.20) * 40));
  // A 25% rise in saving earns the full +40. Slower to reward than consumption
  // is to punish, because a single large transfer can move it a long way.
  if (savingsChange !== null) parts.push(clamp(60 + (savingsChange / 0.25) * 40));
  if (parts.length === 0) return 60;
  return parts.reduce((s, v) => s + v, 0) / parts.length;
}

/* ══════════════════════════════════════════════════════════════════════════
   Execution score — the Expense Tracker's ranking
   ══════════════════════════════════════════════════════════════════════════ */

export interface ExecutionInput {
  month: string;
  items: readonly ExpenseItem[];
  cats: SectionedCats;
  /** That month's plan, per category key. */
  budgetVals: Record<string, number>;
  /** Take-home income for the month. 0 when unknown. */
  income: number;
  now: Date;
}

const pct = (n: number): string => `${Math.round(n * 100)}%`;

/**
 * Score a month's execution.
 *
 * Weights (before renormalisation):
 *   Budget fidelity  35 — the thing the user asked to be measured most
 *   Savings rate     25 — "more savings, investments and growth is the top result"
 *   Discretionary    20 — restraint where restraint is actually a choice
 *   Momentum         20 — improvement, measured against themselves
 *
 * A part-month is scored on the part that has happened: budgets are pro-rated
 * by the fraction of the month elapsed, so a tracker opened on the 3rd does not
 * report every category as wildly under budget.
 */
export function computeExecutionScore({
  month, items, cats, budgetVals, income, now,
}: ExecutionInput): ScoreResult {
  const flat = allCategories(cats);
  const validKeys = new Set(flat.map((c) => c.k));
  const meta = new Map(flat.map((c) => [c.k, c]));

  const monthItems = items.filter((e) => (e.date || '').slice(0, 7) === month);
  const unmeasured: ScoreResult['unmeasured'] = [];

  if (monthItems.length === 0) {
    return {
      score: 0,
      grade: 'building',
      gradeLabel: 'Not scored',
      headline: 'Log a few transactions and this month gets a score.',
      components: [],
      unmeasured: [{ label: 'Everything', reason: 'Nothing is logged for this month yet.' }],
      nextStep: 'Log this month’s spending — even a handful of entries is enough to score.',
      insufficient: true,
    };
  }

  /* ── How much of the month has actually happened ── */
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const isRunning = month === ymLocal(now);
  const elapsed = isRunning ? Math.min(daysInMonth, now.getDate()) / daysInMonth : 1;

  /* ── Spend per category, resolved the way every other figure resolves it ── */
  const spentByCat = new Map<string, number>();
  for (const e of monthItems) {
    const k = migrateCategory(e.category, validKeys);
    spentByCat.set(k, (spentByCat.get(k) ?? 0) + e.amount);
  }

  const split = splitOutflow(monthItems, validKeys, meta);

  /* ── 1. Budget fidelity, weighted by each category's share of the plan ── */
  let fidelity: Omit<ScoreComponent, 'weight'> | null = null;
  let fidelityWeight = 0;
  const overspent: Array<{ label: string; over: number }> = [];

  const planned = flat
    .map((c) => ({ c, budget: Math.max(0, Number(budgetVals[c.k]) || 0) }))
    .filter((r) => r.budget > 0);
  const plannedTotal = planned.reduce((s, r) => s + r.budget, 0);

  if (plannedTotal > 0) {
    let weighted = 0;
    for (const { c, budget } of planned) {
      const target = budget * elapsed;
      const actual = spentByCat.get(c.k) ?? 0;
      // Savings runs the other way up: exceeding a savings allocation is the
      // best thing in the ledger, so it can never lose fidelity points.
      const s = isSpendingCategory(c)
        ? fidelityScore(target, actual)
        : Math.max(fidelityScore(target, actual), actual >= target ? 100 : 0);
      weighted += s * (budget / plannedTotal);
      if (isSpendingCategory(c) && actual > target) {
        overspent.push({ label: c.l, over: (actual - target) / target });
      }
    }
    overspent.sort((a, b) => b.over - a.over);
    const worst = overspent[0];
    fidelityWeight = 35;
    fidelity = {
      key: 'fidelity',
      label: 'Budget fidelity',
      score: clamp(weighted),
      detail: overspent.length === 0
        ? `Every budgeted category is inside its plan${isRunning ? ' at this point in the month' : ''}.`
        : `${overspent.length} ${overspent.length === 1 ? 'category is' : 'categories are'} over plan — ${worst.label} by ${pct(worst.over)}.`,
    };
  } else {
    unmeasured.push({
      label: 'Budget fidelity',
      reason: 'No budget is set for this month, so there is nothing to measure spending against.',
    });
  }

  /* ── 2. Savings rate ── */
  let savings: Omit<ScoreComponent, 'weight'> | null = null;
  let savingsWeight = 0;
  const savingsRate = income > 0 ? split.setAsideTotal / income : null;
  if (savingsRate !== null) {
    savingsWeight = 25;
    savings = {
      key: 'savings',
      label: 'Savings rate',
      score: savingsRateScore(savingsRate),
      detail: split.setAsideTotal > 0
        ? `${pct(savingsRate)} of income moved into savings and investments${isRunning ? ' so far this month' : ''}.`
        : 'Nothing has been logged to a savings or investment category this month.',
    };
  } else {
    unmeasured.push({
      label: 'Savings rate',
      reason: 'No income is recorded for this month, so a savings rate cannot be calculated.',
    });
  }

  /* ── 3. Discretionary restraint (wants only) ── */
  let restraint: Omit<ScoreComponent, 'weight'> | null = null;
  let restraintWeight = 0;
  if (income > 0) {
    const wants = monthItems.reduce((s, e) => {
      const k = migrateCategory(e.category, validKeys);
      return meta.get(k)?.section === 'wants' ? s + e.amount : s;
    }, 0);
    const share = wants / income;
    restraintWeight = 20;
    restraint = {
      key: 'restraint',
      label: 'Discretionary restraint',
      score: wantsShareScore(share),
      detail: `${pct(share)} of income went on wants${isRunning ? ' so far' : ''}. Needs are excluded — they are not a choice.`,
    };
  } else {
    unmeasured.push({
      label: 'Discretionary restraint',
      reason: 'No income is recorded, so spending cannot be read as a share of it.',
    });
  }

  /* ── 4. Momentum against the previous month ── */
  const prevKey = ymLocal(new Date(y, m - 2, 1));
  const prevItems = items.filter((e) => (e.date || '').slice(0, 7) === prevKey);
  let momentum: Omit<ScoreComponent, 'weight'> | null = null;
  let momentumWeight = 0;
  if (prevItems.length > 0) {
    const prev = splitOutflow(prevItems, validKeys, meta);
    // A running month is compared like for like: the same fraction of the
    // previous month, not the whole of it. Without this, every month scores
    // "hugely improved" on the 2nd and "collapsing" on the 30th.
    const prevConsumed = prev.consumedTotal * elapsed;
    const prevSetAside = prev.setAsideTotal * elapsed;
    const consumptionChange = prevConsumed > 0
      ? (split.consumedTotal - prevConsumed) / prevConsumed : null;
    const savingsChange = prevSetAside > 0
      ? (split.setAsideTotal - prevSetAside) / prevSetAside : null;
    if (consumptionChange !== null || savingsChange !== null) {
      momentumWeight = 20;
      momentum = {
        key: 'momentum',
        label: 'Momentum',
        score: momentumScore(consumptionChange, savingsChange),
        detail: describeMomentum(consumptionChange, savingsChange),
      };
    }
  }
  if (!momentum) {
    unmeasured.push({
      label: 'Momentum',
      reason: 'There is nothing logged for the previous month to compare against.',
    });
  }

  const { score, components } = combine([
    fidelity && { c: fidelity, weight: fidelityWeight },
    savings && { c: savings, weight: savingsWeight },
    restraint && { c: restraint, weight: restraintWeight },
    momentum && { c: momentum, weight: momentumWeight },
  ]);

  if (components.length === 0) {
    return {
      score: 0,
      grade: 'building',
      gradeLabel: 'Not scored',
      headline: 'Add your income and a budget, and this month gets a score.',
      components: [],
      unmeasured,
      nextStep: 'Set this month’s income and allocations in Budget Builder.',
      insufficient: true,
    };
  }

  const rounded = Math.round(score);
  const { grade, label } = gradeFor(rounded);
  return {
    score: rounded,
    grade,
    gradeLabel: label,
    headline: executionHeadline(rounded, savingsRate, overspent.length),
    components,
    unmeasured,
    nextStep: weakestStep(components),
    insufficient: false,
  };
}

function describeMomentum(consumption: number | null, savings: number | null): string {
  const bits: string[] = [];
  if (consumption !== null) {
    const dir = consumption < 0 ? 'down' : 'up';
    bits.push(`spending ${dir} ${pct(Math.abs(consumption))} on last month`);
  }
  if (savings !== null) {
    const dir = savings < 0 ? 'down' : 'up';
    bits.push(`saving ${dir} ${pct(Math.abs(savings))}`);
  }
  if (bits.length === 0) return 'Nothing to compare with yet.';
  return `Like for like, ${bits.join(' and ')}.`;
}

function executionHeadline(score: number, savingsRate: number | null, overspentCount: number): string {
  if (score >= 92) {
    return savingsRate !== null && savingsRate >= 0.3
      ? 'An exceptional month — the plan held and a third of your income went to your future.'
      : 'An exceptional month. The plan held and the money went where you said it would.';
  }
  if (score >= 82) return 'An excellent month. Small corrections, nothing structural.';
  if (score >= 70) {
    return overspentCount > 0
      ? `A strong month, with ${overspentCount} ${overspentCount === 1 ? 'category' : 'categories'} running past plan.`
      : 'A strong month. The shape is right; there is room to save more.';
  }
  if (score >= 55) return 'A fair month. The plan and the ledger are drifting apart.';
  if (score >= 35) return 'Still building. The budget is not yet describing what actually happens.';
  return 'This month went well past the plan. One category at a time is the way back.';
}

/** The component with the most points left on the table, phrased as an action. */
function weakestStep(components: ScoreComponent[]): string | null {
  const ranked = [...components]
    .map((c) => ({ c, headroom: (100 - c.score) * c.weight }))
    .sort((a, b) => b.headroom - a.headroom);
  const worst = ranked[0];
  if (!worst || worst.headroom < 3) return null;
  switch (worst.c.key) {
    case 'fidelity':
      return 'Bring the categories that are over plan back inside it, or raise their budget to what you actually spend — either one makes the plan true again.';
    case 'savings':
      return 'Move the savings transfer to the day after payday. A rate set before the month starts is the one that survives it.';
    case 'restraint':
      return 'Wants are the movable part of the budget. Trimming a tenth there is the cheapest way to lift every other number on this page.';
    case 'momentum':
      return 'Pick one category to bring down against last month. One is a decision; five is a diet.';
    case 'coverage':
      return 'Record the rest of the month’s spending — the score only knows what the ledger knows.';
    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Plan score — Budget Builder's ranking
   ══════════════════════════════════════════════════════════════════════════ */

export interface PlanInput {
  /** The computed budget for the month being planned. */
  budget: BudgetResult;
  cats: SectionedCats;
  /** The month's allocations, per category key. */
  vals: Record<string, number>;
  /** The month being planned, "YYYY-MM". */
  month: string;
  /** The whole ledger — used to judge whether the plan matches reality. */
  items: readonly ExpenseItem[];
  /** How many months of history to test the plan against. */
  lookback?: number;
}

/**
 * Score a budget as a plan.
 *
 * Weights (before renormalisation):
 *   Savings commitment  30 — what the plan sets aside, as a rate
 *   Realism             25 — does it match what this person actually spends
 *   Coverage            25 — is the income allocated, and do the sections add up
 *   Discretionary       20 — how much of the plan is wants
 *
 * Realism is dropped entirely when there is no history — a first budget cannot
 * be unrealistic, only untested.
 */
export function computePlanScore({
  budget, cats, vals, month, items, lookback = 3,
}: PlanInput): ScoreResult {
  const unmeasured: ScoreResult['unmeasured'] = [];
  const income = budget.income;

  if (income <= 0) {
    return {
      score: 0,
      grade: 'building',
      gradeLabel: 'Not scored',
      headline: 'Add your income and the plan gets a score.',
      components: [],
      unmeasured: [{ label: 'Everything', reason: 'No income is recorded for this month.' }],
      nextStep: 'Enter what you actually take home each month — every figure below is a share of it.',
      insufficient: true,
    };
  }

  /* ── 1. Savings commitment ── */
  const plannedSaveRate = budget.sT / income;
  const savings: Omit<ScoreComponent, 'weight'> = {
    key: 'savings',
    label: 'Savings commitment',
    score: savingsRateScore(plannedSaveRate),
    detail: budget.sT > 0
      ? `The plan sets aside ${pct(plannedSaveRate)} of income for savings, investments and growth.`
      : 'Nothing is allocated to savings or investments yet.',
  };

  /* ── 2. Coverage & coherence ──
     Three things a plan has to get right before anything else matters: the
     percentages add up, every section fits inside the share it was given, and
     the income is actually allocated rather than left as a vague surplus. */
  const allocatedRatio = budget.spent / income;
  // A plan that allocates 100% of income scores 100. Leaving money unassigned
  // costs points slowly (it is unplanned, not spent); allocating MORE than the
  // income costs points fast, because that plan cannot be executed at all.
  const allocationScore = allocatedRatio > 1
    ? clamp(100 - (allocatedRatio - 1) * 400)
    : clamp(100 - Math.pow(1 - allocatedRatio, 1.2) * 130);
  const sectionsFit = [
    budget.nT <= budget.nL + 0.5,
    budget.wT <= budget.wL + 0.5,
  ].filter(Boolean).length;
  const coherence = (budget.splitWarn ? 0 : 100) * 0.35 + (sectionsFit / 2) * 100 * 0.25 + allocationScore * 0.40;
  const coverage: Omit<ScoreComponent, 'weight'> = {
    key: 'coverage',
    label: 'Coverage & coherence',
    score: clamp(coherence),
    detail: budget.splitWarn
      ? `The Needs, Wants and Savings shares add up to ${budget.nPct + budget.wPct + budget.sPct}%, not 100%.`
      : allocatedRatio > 1.001
        ? `The plan allocates ${pct(allocatedRatio)} of income — ${pct(allocatedRatio - 1)} more than there is.`
        : allocatedRatio < 0.98
          ? `${pct(1 - allocatedRatio)} of income is not allocated to anything yet.`
          : 'Income is fully allocated and every section fits its share.',
  };

  /* ── 3. Discretionary share ── */
  const wantsShare = budget.wT / income;
  const restraint: Omit<ScoreComponent, 'weight'> = {
    key: 'restraint',
    label: 'Discretionary share',
    score: wantsShareScore(wantsShare),
    detail: `${pct(wantsShare)} of income is planned for wants. Needs are excluded — they are not a choice.`,
  };

  /* ── 4. Realism: does the plan match what this person actually spends? ── */
  let realism: Omit<ScoreComponent, 'weight'> | null = null;
  const flat = allCategories(cats);
  const validKeys = new Set(flat.map((c) => c.k));
  const history = monthlySpendByCategory(items, month, lookback, validKeys);

  if (history.months.length > 0) {
    const budgeted = flat
      .map((c) => ({ c, v: Math.max(0, Number(vals[c.k]) || 0) }))
      .filter((r) => r.v > 0 || (history.avg.get(r.c.k) ?? 0) > 0);
    const totalWeight = budgeted.reduce(
      (s, r) => s + Math.max(r.v, history.avg.get(r.c.k) ?? 0), 0,
    );
    if (totalWeight > 0) {
      let weighted = 0;
      let worst: { label: string; ratio: number } | null = null;
      for (const { c, v } of budgeted) {
        const avg = history.avg.get(c.k) ?? 0;
        const w = Math.max(v, avg) / totalWeight;
        // Both directions matter here, and they are different mistakes:
        // budgeting below history is a plan that will break, budgeting far
        // above it is a plan that is not describing anything.
        const s = avg > 0 ? fidelityScore(v, avg) : (v > 0 ? 70 : 100);
        weighted += s * w;
        if (avg > 0 && v > 0 && avg / v > (worst?.ratio ?? 1.15)) {
          worst = { label: c.l, ratio: avg / v };
        }
      }
      realism = {
        key: 'realism',
        label: 'Realism',
        score: clamp(weighted),
        detail: worst
          ? `Against the last ${history.months.length} month${history.months.length === 1 ? '' : 's'}, ${worst.label} is budgeted ${pct(worst.ratio - 1)} below what you actually spend.`
          : `The plan lines up with what you actually spent over the last ${history.months.length} month${history.months.length === 1 ? '' : 's'}.`,
      };
    }
  }
  if (!realism) {
    unmeasured.push({
      label: 'Realism',
      reason: 'There is no logged spending yet to test the plan against.',
    });
  }

  const { score, components } = combine([
    { c: savings, weight: 30 },
    realism && { c: realism, weight: 25 },
    { c: coverage, weight: 25 },
    { c: restraint, weight: 20 },
  ]);

  const rounded = Math.round(score);
  const { grade, label } = gradeFor(rounded);
  return {
    score: rounded,
    grade,
    gradeLabel: label,
    headline: planHeadline(rounded, plannedSaveRate, budget.splitWarn, allocatedRatio),
    components,
    unmeasured,
    nextStep: planStep(components),
    insufficient: false,
  };
}

function planHeadline(score: number, saveRate: number, splitWarn: boolean, allocated: number): string {
  if (splitWarn) return 'The three shares do not add up to 100% — fix that and the rest of the plan follows.';
  if (allocated > 1.001) return 'This plan spends more than it earns. Something has to come down before the month starts.';
  if (score >= 92) return `An exceptional plan — ${pct(saveRate)} of income committed to your future, and every share coherent.`;
  if (score >= 82) return 'An excellent plan. Well shaped, well funded, and it matches how you actually spend.';
  if (score >= 70) return 'A strong plan. The structure is right; the savings line has room to grow.';
  if (score >= 55) return 'A workable plan with a soft spot or two — see the breakdown below.';
  if (score >= 35) return 'The plan is taking shape, but it is not yet doing much for your future self.';
  return 'This plan needs work before the month starts. Begin with the weakest line below.';
}

function planStep(components: ScoreComponent[]): string | null {
  const ranked = [...components]
    .map((c) => ({ c, headroom: (100 - c.score) * c.weight }))
    .sort((a, b) => b.headroom - a.headroom);
  const worst = ranked[0];
  if (!worst || worst.headroom < 3) return null;
  switch (worst.c.key) {
    case 'savings':
      return 'Raise the savings allocation before you raise anything else — it is the only line in the plan that pays you back.';
    case 'realism':
      return 'Bring the under-budgeted categories up to what you actually spend. A plan you break in week two is not a plan.';
    case 'coverage':
      return 'Give every rupee of income a job. Money with no category is money that gets spent by default.';
    case 'restraint':
      return 'Wants are over a third of the plan. Moving a slice of that into savings changes the shape of the year.';
    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Shared history helper
   ══════════════════════════════════════════════════════════════════════════ */

export interface CategoryHistory {
  /** Months with any logged activity in the window, oldest first. */
  months: string[];
  /** Mean spend per category across `months`. Zero months are genuine zeros. */
  avg: Map<string, number>;
  /** Spend per month per category, for anything that wants the shape not the mean. */
  byMonth: Map<string, Map<string, number>>;
}

/**
 * How far back to look for months that actually have activity, beyond the
 * requested window. Two years is long enough to reach real history from a
 * budget planned a year ahead, and short enough that nothing prehistoric
 * creeps into a forecast.
 */
const HISTORY_REACH = 24;

/**
 * Per-category spend across the most recent `count` months **with activity**
 * before `month`.
 *
 * The denominator is *months the user logged anything at all*, not months in
 * which this category happened to appear. A month where groceries were logged
 * and travel was not is a genuine zero for travel, and averaging it in is what
 * stops one holiday becoming a permanent monthly allowance.
 *
 * WHY IT REACHES PAST THE WINDOW
 * ------------------------------
 * This used to read exactly the `count` calendar months before `month`. That is
 * the same thing for a budget planned this month or next — and it returns
 * NOTHING for one planned four months ahead, because the intervening months
 * have not happened yet. Planning December in August produced "there is no
 * logged spending to forecast from" while a year of history sat one month
 * further back.
 *
 * So it walks back until it has `count` months that contain something, or until
 * it has looked far enough that anything older would not be evidence about next
 * month anyway. Callers report which months were used (`months`), so a window
 * that skipped a gap is visible rather than implied.
 */
export function monthlySpendByCategory(
  items: readonly ExpenseItem[],
  month: string,
  count: number,
  validKeys: ReadonlySet<string>,
): CategoryHistory {
  const [y, m] = month.split('-').map(Number);

  // Spend per (month, category) for everything strictly before `month`.
  const byMonth = new Map<string, Map<string, number>>();
  for (const e of items) {
    const mk = (e.date || '').slice(0, 7);
    if (!mk || mk >= month) continue;
    const k = migrateCategory(e.category, validKeys);
    let row = byMonth.get(mk);
    if (!row) { row = new Map(); byMonth.set(mk, row); }
    row.set(k, (row.get(k) ?? 0) + e.amount);
  }

  // The most recent `count` months that have anything in them, newest first.
  const picked: string[] = [];
  for (let i = 1; i <= HISTORY_REACH && picked.length < count; i += 1) {
    const mk = ymLocal(new Date(y, m - 1 - i, 1));
    if (byMonth.has(mk)) picked.push(mk);
  }
  const months = picked.reverse(); // oldest first, as every caller expects

  const avg = new Map<string, number>();
  if (months.length > 0) {
    const keys = new Set<string>();
    for (const mk of months) for (const k of byMonth.get(mk)!.keys()) keys.add(k);
    for (const k of keys) {
      const total = months.reduce((s, mk) => s + (byMonth.get(mk)?.get(k) ?? 0), 0);
      avg.set(k, total / months.length);
    }
  }
  return { months, avg, byMonth };
}
