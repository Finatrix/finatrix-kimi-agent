/**
 * Checking the amounts in an answer against the data it was given.
 *
 * The system prompt tells the model that every figure about the user must come
 * from the DATA block, or be one visible arithmetic step from it. A prompt is a
 * request, and this product's rule for AI is that the boundary between "the
 * model explains" and "the model authors numbers" is enforced structurally, not
 * hoped for. This module is that enforcement for the chat.
 *
 * WHAT COUNTS AS GROUNDED
 * -----------------------
 * An amount written in a currency ("₹4,237", "$1.2k", "AED 900", "1.54 L") is
 * grounded when either:
 *
 *   1. it matches a figure in the data, to the precision it was written at —
 *      "₹12,000" matches 12,345 (it is written to the thousand) but "₹12,390"
 *      does not; or
 *   2. it is one step of arithmetic — a sum, a difference, a product or a
 *      share — from grounded amounts, counts or percentages on the SAME LINE.
 *
 * The second rule is deliberately local. "One step from any two numbers in the
 * data" sounds equivalent and is useless: a snapshot holds a few hundred
 * figures, their pairwise sums and differences cover almost every plausible
 * amount, and an invented number would pass by coincidence. Requiring the
 * operands on the same line is what the prompt already asks for — show the
 * working — so a derived figure with its working shown passes, and one without
 * it is reported, which is exactly the behaviour the contract describes.
 *
 * WHAT HAPPENS TO THE REST
 * ------------------------
 * Nothing is deleted from the prose: an amount the data does not contain is
 * often a legitimate suggested target ("cap dining at ₹8,000"). It is NAMED
 * under the answer instead, so the user sees which amounts are theirs and which
 * are not. A chart is different — it is drawn in the user's currency and reads
 * as a statement of fact — so a chart with any value outside the data is
 * withheld rather than shown.
 *
 * Pure: no I/O, no model calls.
 */

import type { AiChart, AiHighlight, AiUnit } from './validate';

export interface GroundingReport {
  /** Currency amounts found in the answer and checked. */
  checked: number;
  /** Of those, how many were worked out on the page rather than read directly. */
  workedOut: number;
  /** Amounts that are neither in the data nor worked out from it, as written. */
  unmatched: string[];
  /** True when the model's chart was withheld because its values were not in the data. */
  chartWithheld: boolean;
  /** Figure tiles withheld for the same reason. Absent on turns stored before tiles existed. */
  tilesWithheld?: number;
}

/** The figures an answer may quote, split by what kind of number each is. */
export interface KnownFigures {
  /** Amounts of money, ascending. */
  money: number[];
  /** Counts, day and month numbers, and percentages. */
  counts: number[];
  percentages: number[];
  /** Exact values, with units and paths into the data supplied for this turn. */
  facts: Record<string, { value: number; unit: AiUnit }>;

}

/* ── What a key's number is ── */

/**
 * A numeric field is a count or a percentage — not money — when its name says
 * so. Explicit rather than clever: `estimatedMonthly` and `monthlyContribution`
 * are money even though they contain "month".
 */
function isCountKey(key: string): boolean {
  return /pct$|percent/i.test(key)
    || /^(days|months|weeks)[A-Z]?/.test(key)
    || /count$/i.test(key)
    || /^(years|throughDay|weekOfMonth|historyMonths|forecastUsesMonthsOfHistory|weightOnThisMonth|monthsSeen|monthsTested)$/.test(key);
}

/** Every number in the data, by kind. Walks objects and arrays of any depth. */
export function collectFigures(...sources: unknown[]): KnownFigures {
  const money = new Set<number>();
  const counts = new Set<number>();
  const percentages = new Set<number>();
  const facts: KnownFigures['facts'] = Object.create(null);
  const walk = (value: unknown, key: string, path: string) => {
    if (typeof value === 'number') {
      // Zero is kept. It is a real, checkable figure — "spent nothing this
      // month" is the honest answer for a new account — and dropping it meant a
      // correct ₹0 tile could never be verified, so it was withheld as if it
      // had been invented. It grounds nothing else: a match still has to fall
      // within the tolerance of zero.
      if (!Number.isFinite(value)) return;
      const unit = /pct$|percent/i.test(key) ? 'percent' : isCountKey(key) ? 'number' : 'currency';
      (unit === 'currency' ? money : counts).add(value);
      if (unit === 'percent') percentages.add(value);
      facts[path] = { value, unit };
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, key, `${path}.${i}`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, k, `${path}.${k}`);
    }
  };
  sources.forEach((s, i) => walk(s, '', i === 0 ? 'data' : i === 1 ? 'focus' : `source${i}`));
  return { money: [...money].sort((a, b) => a - b), counts: [...counts], percentages: [...percentages], facts };
}

/* ── Reading amounts out of prose ── */

const NUM = String.raw`\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
const SCALE = String.raw`thousand|lakhs?|lacs?|crores?|million|billion|mn|bn|cr|k|K|L|M`;
const PREFIX = String.raw`US\$|AU\$|A\$|C\$|S\$|Rs\.?|INR|AED|AUD|USD|GBP|EUR|CAD|SGD|Dhs\.?|₹|\$|£|€`;
const SUFFIX = String.raw`INR|AED|USD|GBP|EUR|AUD|CAD|SGD|rupees?|dirhams?|pounds?|dollars?|euros?`;

const PREFIXED = new RegExp(String.raw`(?<![A-Za-z])([−-]?)\s?(?:${PREFIX})\s?([−-]?)(${NUM})(?:\s?(${SCALE})(?![A-Za-z]))?`, 'g');
const SUFFIXED = new RegExp(String.raw`(?<![\w.,$£€₹])([−-]?)(${NUM})(?:\s?(${SCALE}))?\s?(?:${SUFFIX})(?![A-Za-z])`, 'g');
const PERCENT = new RegExp(String.raw`(${NUM})\s?%`, 'g');
const BARE = new RegExp(String.raw`(?<![\w.,$£€₹\-/:])(${NUM})(?![\w%\-/:])`, 'g');

/** Plain numbers up to this are plausibly counts — days, months, items — not money. */
const MAX_PLAIN_COUNT = 60;

const SCALE_OF: Record<string, number> = {
  k: 1e3, thousand: 1e3,
  l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5,
  cr: 1e7, crore: 1e7, crores: 1e7,
  m: 1e6, mn: 1e6, million: 1e6,
  bn: 1e9, billion: 1e9,
};

export interface WrittenAmount {
  /** Exactly as it appears in the answer. */
  text: string;
  value: number;
  /** How far from `value` a figure can be and still be what was written. */
  tolerance: number;
  /** Index into the answer, so two patterns never report one amount twice. */
  at: number;
}

/**
 * The tolerance an amount was written with.
 *
 * "12,000" is written to the thousand, so 12,345 is that amount; "12,345" is
 * written to the unit. Half a unit of the last written digit — but never more
 * than 5% of the amount, because "₹2,000" for a figure of 1,675 is not rounding,
 * it is a different number. Exact unscaled amounts use half a unit of the last written digit; they do
 * not receive a relative margin that could validate a different exact amount.
 */
function toleranceOf(digits: string, scale: number, value: number): number {
  const clean = digits.replace(/,/g, '');
  const dot = clean.indexOf('.');
  const unit = dot >= 0
    ? 10 ** -(clean.length - dot - 1)
    : 10 ** Math.min((clean.match(/0*$/)?.[0].length ?? 0), clean.length - 1);
  return Math.max(0.005, Math.min((unit * scale) / 2, value * 0.05));
}

function parse(digits: string, scaleWord: string | undefined): { value: number; scale: number } {
  const scale = scaleWord ? SCALE_OF[scaleWord.toLowerCase()] ?? 1 : 1;
  return { value: Number(digits.replace(/,/g, '')) * scale, scale };
}

/** Every currency amount in `text`. */
export function amountsIn(text: string): WrittenAmount[] {
  const out: WrittenAmount[] = [];
  const seen = new Set<number>();
  for (const re of [PREFIXED, SUFFIXED]) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (seen.has(m.index)) continue;
      const digits = re === PREFIXED ? m[3] : m[2];
      const scaleWord = re === PREFIXED ? m[4] : m[3];
      const parsed = parse(digits, scaleWord);
      const negative = re === PREFIXED ? !!(m[1] || m[2]) : !!m[1];
      const value = negative ? -parsed.value : parsed.value;
      if (!Number.isFinite(value)) continue;
      seen.add(m.index);
      out.push({ text: m[0].trim(), value, tolerance: toleranceOf(digits, parsed.scale, Math.abs(value)), at: m.index + m[0].indexOf(m[0].trim()) });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/* ── Matching ── */

/** Is there a value in ascending `sorted` within `tol` of `x`? */
function near(sorted: readonly number[], x: number, tol: number): boolean {
  let lo = 0;
  let hi = sorted.length;
  const floor = x - tol;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < floor) lo = mid + 1;
    else hi = mid;
  }
  return lo < sorted.length && sorted[lo] <= x + tol;
}

/**
 * Is `target` one step of arithmetic from two of `operands`? Sum, difference,
 * product, quotient — and a percentage of an amount, which is a product with
 * the percentage divided by a hundred.
 */
function oneStepFrom(target: number, tol: number, operands: readonly number[], percents: readonly number[]): boolean {
  const close = (x: number) => Math.abs(x - target) <= tol;
  for (let i = 0; i < operands.length; i += 1) {
    const a = operands[i];
    for (const p of percents) if (close((a * p) / 100)) return true;
    for (let j = 0; j < operands.length; j += 1) {
      if (i === j) continue;
      const b = operands[j];
      if (close(a + b) || close(a - b) || close(a * b) || (b !== 0 && close(a / b))) return true;
    }
  }
  return false;
}

/**
 * Check every currency amount in an answer.
 *
 * Lines are the unit of "the working is shown": a paragraph, a list item or a
 * table row. Within one, an amount that is not in the data may be derived from
 * the grounded amounts, the counts ("over 18 days") and the percentages beside
 * it.
 */
export function checkAnswer(answer: string, known: KnownFigures): Omit<GroundingReport, 'chartWithheld'> {
  let checked = 0;
  let workedOut = 0;
  const unmatched: string[] = [];

  for (const line of answer.split('\n')) {
    const amounts = amountsIn(line);
    if (!amounts.length) continue;

    const direct = amounts.map((a) => near(known.money, a.value, a.tolerance));
    const percents = [...line.matchAll(PERCENT)].map((m) => Number(m[1].replace(/,/g, '')));
    // Plain numbers on the line that are not themselves amounts or percentages:
    // "18 days", "6 months", "×12". Positions are compared so "₹4,200" does not
    // also count as the bare number 4,200.
    const amountSpans = amounts.map((a) => [a.at, a.at + a.text.length] as const);
    // A plain number is an operand only if it is a plausible count, or is itself
    // in the data. Otherwise "5,000 plus 3,000 is ₹8,000" would ground the
    // total on two numbers nobody checked.
    const bare = [...line.matchAll(BARE)]
      .filter((m) => !amountSpans.some(([s, e]) => m.index! >= s && m.index! < e))
      .filter((m) => !/^\s?%/.test(line.slice(m.index! + m[0].length)))
      .map((m) => Number(m[1].replace(/,/g, '')))
      .filter((n) => Number.isFinite(n) && n > 0)
      .filter((n) => n <= MAX_PLAIN_COUNT || near(known.money, n, Math.max(1, n * 0.005)) || known.counts.includes(n));

    amounts.forEach((a, i) => {
      checked += 1;
      if (direct[i]) return;
      const operands = [
        ...amounts.filter((_, j) => j !== i && direct[j]).map((b) => b.value),
        ...bare,
      ];
      if (oneStepFrom(a.value, a.tolerance, operands, percents)) {
        workedOut += 1;
        return;
      }
      if (!unmatched.includes(a.text)) unmatched.push(a.text);
    });
  }
  return { checked, workedOut, unmatched };
}

/**
 * A figure tile states one number as the user's own, so it may only show one
 * that is in the data. Money against the amounts, percentages against the
 * percentages, plain numbers against either.
 */
export function highlightIsGrounded(tile: AiHighlight, known: KnownFigures, requireSource = false): boolean {
  return figureIsGrounded(tile, known, requireSource);
}

function figureIsGrounded(
  figure: { value: number; unit: AiUnit; source?: string },
  known: KnownFigures,
  requireSource: boolean,
): boolean {
  if (!Number.isFinite(figure.value)) return false;
  if (figure.source || requireSource) {
    const fact = figure.source ? known.facts[figure.source] : undefined;
    // A matching amount elsewhere in the snapshot cannot justify this source.
    return !!fact && fact.unit === figure.unit && Math.abs(fact.value - figure.value) < 0.005;
  }
  const pool = figure.unit === 'currency' ? known.money
    : figure.unit === 'percent' ? known.percentages : known.counts;
  return pool.some((value) => Math.abs(value - figure.value) < 0.005);
}

/** One unverified point invalidates the comparison, so withhold the whole chart. */
export function chartIsGrounded(chart: AiChart, known: KnownFigures, requireSource = false): boolean {
  return chart.points.every((point) => figureIsGrounded({ ...point, unit: chart.unit }, known, requireSource));
}
