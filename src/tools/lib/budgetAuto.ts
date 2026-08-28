/**
 * The automatic budget — the user sets the envelopes, the history fills them in.
 *
 * WHAT IT DOES, AND WHAT IT DELIBERATELY DOES NOT
 * ----------------------------------------------
 * The user always decides the two things that are theirs to decide: how much
 * money there is, and how it splits across Needs, Wants and Savings. Those are
 * value judgements about their life, and no forecast has any business making
 * them.
 *
 * What this module does is the part that is genuinely arithmetic: given a fixed
 * envelope for a section, how should it be divided between the categories inside
 * it? That answer is in the user's own spending history, and working it out by
 * hand across twenty categories is exactly the kind of tedium software should
 * absorb.
 *
 * THE FORECAST
 * ------------
 * Per category, in order:
 *
 *   1. **Recency-weighted mean.** The last N months, weighted so recent months
 *      count for more (weight 2^(-age/2): last month 1.00, two months ago 0.71,
 *      three 0.50). A budget is a prediction about next month, and last month is
 *      simply better evidence about next month than last April is.
 *
 *   2. **Damped trend.** A least-squares slope across the same months, applied
 *      for one month forward and damped to 50%. Undamped extrapolation of three
 *      noisy points is how a forecast produces a number nobody recognises.
 *
 *   3. **Commitment floor, and a ceiling to match.** A category with a detected
 *      recurring bill is PINNED at that bill. Rent does not shrink because you
 *      averaged it with a month you had not moved in yet — and, just as
 *      importantly, it does not grow by 19% because the section happened to have
 *      room. A fixed cost is fixed in both directions, and scaling one up is the
 *      most obviously wrong number this feature could produce.
 *
 *   4. **A budgeted category with no history keeps its budget.** Zero spending
 *      in the window is not evidence that a category should be defunded — it is
 *      usually a bill that has not fallen due yet, or one the user pays from
 *      elsewhere. The user's own allocation is better evidence than nothing, so
 *      it becomes the forecast and the row survives.
 *
 *   5. **Fit the envelope — downward only.** If the forecasts exceed what the
 *      user allocated, everything is scaled down to fit, with pinned rows cut
 *      last. If they come in UNDER it, nothing is scaled up: the surplus is
 *      reported as unallocated rather than being sprayed across categories to
 *      make the column add up.
 *
 *      That asymmetry is the whole point. Inflating every line to absorb spare
 *      room makes the plan less true — it hands Rent 19% more than the rent, and
 *      it quietly funds categories the user has never spent in. A surplus is
 *      good news and the section says so ("room to move into savings"); pretending
 *      it was needed is how a budget stops describing anything.
 *
 *   6. **Round, without breaking the sum.** Amounts are rounded to a readable
 *      step by largest remainder, so the rows still add up to the envelope
 *      exactly. A column of tidy figures that does not sum to its own total is
 *      worse than an untidy one.
 *
 * Nothing here writes anything. It returns a proposal; the user applies it.
 *
 * Pure.
 */
import { allCategories, type BudgetCat, type CatKey, type SectionedCats } from './budget';
import { migrateCategory, type ExpenseItem } from './expense';
import { detectRecurring, type CatMeta } from './expenseAnalytics';
import { monthlySpendByCategory } from './score';
import type { IconName } from '../ui/Icon';

/** How many months of history to read. Matches the suggestions card's options. */
export type AutoLookback = 3 | 6 | 12;
export const AUTO_LOOKBACKS: readonly AutoLookback[] = [3, 6, 12];

export interface AutoRow {
  k: string;
  label: string;
  ic: IconName;
  section: CatKey;
  /** What the history predicts for this category, before scaling. */
  forecast: number;
  /** The proposed allocation: forecast scaled to the envelope, then rounded. */
  amount: number;
  /** What this category is budgeted at now. */
  current: number;
  /** `amount − current`. */
  difference: number;
  /** Months of evidence behind `forecast`. */
  monthsSeen: number;
  /**
   * True when a detected recurring bill fixes this row.
   *
   * A pinned row is allocated exactly the bill — never scaled up because the
   * section has room, and never scaled down because it does not.
   */
  committed: boolean;
  /** Plain-language reason, no currency, so any locale renders it. */
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AutoSection {
  section: CatKey;
  label: string;
  /** What the user allocated to this section. */
  envelope: number;
  /** What the history says the section needs. */
  forecast: number;
  /**
   * `envelope ÷ forecast`. Below 1 means the plan is tighter than history;
   * above 1 means there is room. Null when there is no history for the section.
   */
  ratio: number | null;
  rows: AutoRow[];
  /**
   * Envelope minus what was allocated. Zero when the forecast filled it or
   * overflowed it; positive when the user has given the section more than their
   * own history says it needs.
   */
  unallocated: number;
  /** One sentence about the gap between plan and history. */
  verdict: string;
}

export interface AutoBudgetResult {
  /** Months with any logged activity in the window, oldest first. */
  monthsUsed: string[];
  /** True when history is shorter than the requested lookback. */
  partial: boolean;
  sections: AutoSection[];
  /** Every row across every section, for the apply step. */
  rows: AutoRow[];
  /** True when there is not enough history to forecast anything. */
  empty: boolean;
}

export interface AutoBudgetInput {
  items: readonly ExpenseItem[];
  cats: SectionedCats;
  /** The month being planned. History is read from the months before it. */
  month: string;
  /** The user's envelopes, in currency, one per section. */
  envelopes: Record<CatKey, number>;
  /** The month's current allocations, used only to report the difference. */
  currentVals: Record<string, number>;
  lookback: AutoLookback;
}

const SECTION_LABEL: Record<CatKey, string> = {
  needs: 'Needs', wants: 'Wants', save: 'Savings & investments',
};

/**
 * Rounding steps by magnitude — the same ladder `budgetSuggest` uses, so two
 * features that both propose a budget propose it at the same granularity.
 */
const NICE_STEPS: ReadonlyArray<readonly [max: number, step: number]> = [
  [100, 5], [1_000, 10], [10_000, 50], [100_000, 100],
];
const LARGEST_STEP = 500;

function stepFor(n: number): number {
  return NICE_STEPS.find(([max]) => n < max)?.[1] ?? LARGEST_STEP;
}

/**
 * Recency weight for a month `age` months back (0 = most recent).
 * Halves every two months, so a six-month window still hears from its oldest
 * month (weight 0.18) without being led by it.
 */
function recencyWeight(age: number): number {
  return Math.pow(2, -age / 2);
}

/**
 * Least-squares slope of `values` against their index, per step.
 * Returns 0 for fewer than three points — two points define a line through
 * noise, and acting on it is how a one-off holiday becomes a trend.
 */
function slope(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Two decimals — the precision money actually carries. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Population coefficient of variation — how noisy the history is. */
function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function gradeConfidence(history: number[], committed: boolean): AutoRow['confidence'] {
  if (committed) return 'high';
  const n = history.filter((v) => v > 0).length;
  const cv = coefficientOfVariation(history);
  if (n >= 3 && cv <= 0.3) return 'high';
  if (n >= 2 && cv <= 0.7) return 'medium';
  return 'low';
}

/**
 * Divide a section's envelope between its categories.
 *
 * Three cases, and the asymmetry between the first two is the design:
 *
 *  • **The forecasts fit.** Every row gets its forecast, rounded. Whatever is
 *    left of the envelope stays unallocated — it is a surplus, and inflating
 *    the rows to absorb it would hand Rent more than the rent.
 *  • **They do not fit.** Everything is scaled down proportionally, except that
 *    pinned rows — a detected recurring bill — keep their amount and the rest
 *    absorb the whole cut. A fixed cost is the last thing to squeeze.
 *  • **The pinned rows alone exceed the envelope.** Pinning is abandoned and
 *    everything scales together: allocating past the envelope would be worse
 *    than under-funding a bill, and the section's verdict already says the
 *    envelope is too small.
 *
 * Rounding is by largest remainder rather than round-then-fix-the-last-row:
 * dumping the whole residue on one arbitrary category is how a category ends up
 * 400 away from its own forecast for no reason a user could ever explain.
 */
function allocate(targets: number[], pinned: boolean[], envelope: number): number[] {
  const n = targets.length;
  if (n === 0) return [];
  if (envelope <= 0) return targets.map(() => 0);

  const total = targets.reduce((s, v) => s + v, 0);

  if (total <= 0) {
    // No history and no existing budget anywhere in this section: split the
    // envelope evenly rather than returning zeros, so the user gets a starting
    // point to edit rather than a blank column.
    return roundToSum(targets.map(() => envelope / n), envelope);
  }

  // Fits. Each row is rounded to a readable step ON ITS OWN — there is no sum
  // to preserve, because the surplus is deliberately left unallocated. Forcing
  // an exact total here is what pushed the whole rounding residue onto the
  // largest row and handed a 30,000 rent an allocation of 30,027.
  if (total <= envelope) {
    return targets.map((v) => {
      if (v <= 0) return 0;
      const step = stepFor(v);
      return Math.round(v / step) * step;
    });
  }

  const pinnedTotal = targets.reduce((s, v, i) => s + (pinned[i] ? v : 0), 0);
  const freeIdx = targets.map((_, i) => i).filter((i) => !pinned[i]);
  const freeTotal = freeIdx.reduce((s, i) => s + targets[i], 0);

  // Does not fit, but the commitments do: cut only what is discretionary.
  if (pinnedTotal > 0 && pinnedTotal < envelope && freeTotal > 0) {
    const free = envelope - pinnedTotal;
    const out = targets.map((v, i) => (pinned[i] ? v : 0));
    const rounded = roundToSum(freeIdx.map((i) => (targets[i] / freeTotal) * free), free);
    freeIdx.forEach((i, j) => { out[i] = rounded[j]; });
    return out;
  }

  // The commitments alone are over the envelope. Everything scales.
  const scale = envelope / total;
  return roundToSum(targets.map((v) => v * scale), envelope);
}

function roundToSum(raw: number[], envelope: number): number[] {
  const step = stepFor(Math.max(1, envelope / Math.max(1, raw.length)));
  const floored = raw.map((v) => Math.floor(v / step) * step);
  let used = floored.reduce((s, v) => s + v, 0);
  // Remaining whole steps to hand out, largest fractional remainder first.
  const remainders = raw
    .map((v, i) => ({ i, rem: v - floored[i] }))
    .sort((a, b) => b.rem - a.rem);
  let idx = 0;
  while (used + step <= envelope + 1e-9 && remainders.length > 0) {
    floored[remainders[idx % remainders.length].i] += step;
    used += step;
    idx += 1;
    // One extra step per row at most: beyond that the rounding is no longer
    // rounding, and an unbounded loop is a worse bug than a residue.
    if (idx > remainders.length) break;
  }
  // Whatever is left is smaller than one step. It goes to the largest row,
  // where it is proportionally least visible, so the column sums exactly.
  const residue = envelope - floored.reduce((s, v) => s + v, 0);
  if (Math.abs(residue) > 1e-9) {
    let big = 0;
    for (let i = 1; i < floored.length; i += 1) if (floored[i] > floored[big]) big = i;
    floored[big] = Math.max(0, floored[big] + residue);
  }
  return floored;
}

export function buildAutoBudget({
  items, cats, month, envelopes, currentVals, lookback,
}: AutoBudgetInput): AutoBudgetResult {
  const flat = allCategories(cats);
  const validKeys = new Set(flat.map((c) => c.k));
  const history = monthlySpendByCategory(items, month, lookback, validKeys);

  if (history.months.length === 0) {
    return { monthsUsed: [], partial: true, sections: [], rows: [], empty: true };
  }

  /* ── Commitment floors from the recurring detector ── */
  const catMeta = new Map<string, CatMeta>(flat.map((c) => [c.k, c]));
  const floors = new Map<string, number>();
  for (const p of detectRecurring([...items], catMeta)) {
    const k = migrateCategory(p.category, validKeys);
    floors.set(k, Math.max(floors.get(k) ?? 0, p.estimatedMonthly));
  }

  /* ── Forecast each category ── */
  const seriesFor = (k: string): number[] =>
    history.months.map((m) => history.byMonth.get(m)?.get(k) ?? 0);

  const forecastOf = (k: string, current: number): { value: number; series: number[]; committed: boolean } => {
    const series = seriesFor(k);
    const floor = floors.get(k) ?? 0;
    if (series.every((v) => v === 0) && floor === 0) {
      // No history at all. If the user has budgeted for it, their own decision
      // is better evidence than nothing — a quarterly bill that has not fallen
      // due in the window must not be defunded by a forecast that cannot see it.
      return { value: current, series, committed: false };
    }
    // Recency-weighted mean. `series` is oldest-first, so age counts backwards.
    const last = series.length - 1;
    let wsum = 0;
    let acc = 0;
    series.forEach((v, i) => {
      const w = recencyWeight(last - i);
      acc += v * w;
      wsum += w;
    });
    const weighted = wsum > 0 ? acc / wsum : 0;
    // One month of damped trend on top, rounded to the precision money has.
    // Unrounded, a series of three identical 30,000s projects 30000.000000004,
    // and every comparison against it silently goes the wrong way.
    const projected = round2(weighted + slope(series) * 0.5);
    const value = Math.max(0, projected, floor);
    /**
     * Pinned only when the amount genuinely does not move, across enough months
     * to know that.
     *
     * `detectRecurring` accepts anything with a coefficient of variation under
     * 0.5, which is right for "this is a bill that recurs" and far too loose for
     * "this is a FIXED cost". Groceries every week is recurring; it is not
     * fixed, and pinning it would exempt the largest discretionary line in most
     * households from ever being scaled. A CV at or under 5% is the honest
     * boundary: rent, an EMI and a subscription sit well inside it, and a
     * grocery bill that swings by a tenth does not.
     *
     * Three observations minimum, because two points are always "constant" to
     * within a few per cent by luck — two months of eating out at 9,200 and
     * 8,600 was being reported as a fixed bill.
     */
    const observed = series.filter((v) => v > 0);
    const constant = observed.length >= 3 && coefficientOfVariation(observed) <= 0.05;
    return { value, series, committed: floor > 0 && constant };
  };

  const sections: AutoSection[] = [];
  const allRows: AutoRow[] = [];

  for (const section of ['needs', 'wants', 'save'] as CatKey[]) {
    const members: BudgetCat[] = cats[section];
    const envelope = Math.max(0, Number(envelopes[section]) || 0);
    const forecasts = members.map(
      (c) => forecastOf(c.k, Math.max(0, Number(currentVals[c.k]) || 0)),
    );
    const sectionForecast = forecasts.reduce((s, f) => s + f.value, 0);
    const amounts = allocate(
      forecasts.map((f) => f.value),
      forecasts.map((f) => f.committed),
      envelope,
    );

    const rows: AutoRow[] = members.map((c, i) => {
      const f = forecasts[i];
      const current = Math.max(0, Number(currentVals[c.k]) || 0);
      const monthsSeen = f.series.filter((v) => v > 0).length;
      return {
        k: c.k,
        label: c.l,
        ic: c.ic,
        section,
        forecast: f.value,
        amount: amounts[i],
        current,
        difference: amounts[i] - current,
        monthsSeen,
        committed: f.committed,
        confidence: gradeConfidence(f.series, f.committed),
        reason: reasonFor(f.committed, monthsSeen, history.months.length, f.series, current),
      };
    });

    // Nothing forecast and nothing budgeted is a row with no reason to exist.
    const live = rows.filter((r) => r.amount > 0 || r.current > 0 || r.forecast > 0);
    live.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));

    const ratio = sectionForecast > 0 ? envelope / sectionForecast : null;
    const allocated = amounts.reduce((sum, v) => sum + v, 0);
    sections.push({
      section,
      label: SECTION_LABEL[section],
      envelope,
      forecast: sectionForecast,
      ratio,
      rows: live,
      unallocated: Math.max(0, envelope - allocated),
      verdict: verdictFor(section, envelope, sectionForecast, ratio),
    });
    allRows.push(...live);
  }

  return {
    monthsUsed: history.months,
    partial: history.months.length < lookback,
    sections,
    rows: allRows,
    empty: allRows.length === 0,
  };
}

function reasonFor(
  committed: boolean, monthsSeen: number, windowLength: number, series: number[], current: number,
): string {
  if (committed) return 'A recurring bill fixes this category — it is not scaled with the rest.';
  if (monthsSeen === 0) {
    return current > 0
      ? 'Nothing logged here in the window, so your own budget is kept rather than defunding it.'
      : 'Never spent here, and nothing budgeted — allocated only if the section has room.';
  }
  const trend = slope(series);
  const mean = series.reduce((s, v) => s + v, 0) / Math.max(1, series.length);
  const drift = mean > 0 ? (trend / mean) * 100 : 0;
  const seen = `${monthsSeen} of ${windowLength} month${windowLength === 1 ? '' : 's'}`;
  if (drift > 12) return `Rising — up across ${seen}, and the forecast follows it part of the way.`;
  if (drift < -12) return `Falling — down across ${seen}, and the forecast follows it part of the way.`;
  return `Steady across ${seen}; recent months weigh more than older ones.`;
}

function verdictFor(section: CatKey, envelope: number, forecast: number, ratio: number | null): string {
  const name = section === 'save' ? 'savings' : section;
  if (envelope <= 0) return `Nothing is allocated to ${name} for this month.`;
  if (ratio === null || forecast <= 0) {
    return `No history for ${name} yet — the envelope is split evenly as a starting point.`;
  }
  if (section === 'save') {
    // Savings runs the other way up: allocating more than history is the point.
    if (ratio >= 1.1) return `You are committing ${Math.round((ratio - 1) * 100)}% more to savings than you have been managing. That is the direction that matters.`;
    if (ratio <= 0.9) return `This is ${Math.round((1 - ratio) * 100)}% less than you have actually been setting aside — worth a second look.`;
    return 'The savings envelope matches what you have been managing.';
  }
  if (ratio < 0.9) {
    return `Your history says ${name} needs ${Math.round((1 / ratio - 1) * 100)}% more than this envelope. The allocations below fit the envelope; expect pressure.`;
  }
  if (ratio > 1.05) {
    return `Your history only needs ${Math.round((1 / ratio) * 100)}% of this envelope. The rest is left unallocated rather than inflating the rows — it is room to move into savings.`;
  }
  return `The envelope matches what you actually spend on ${name}.`;
}
