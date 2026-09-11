/**
 * Validating what the model sends back.
 *
 * The reply is untrusted input twice over: it is generated text, and it is
 * about to be rendered. Nothing is passed through — every field is rebuilt into
 * a typed shape with strings sanitized, arrays bounded and numbers coerced, so a
 * malformed or hostile payload becomes an empty value rather than a surprise in
 * the UI.
 *
 * The renderer never uses `dangerouslySetInnerHTML`, so markup in the answer can
 * only ever be displayed as text. Sanitizing here is defence in depth, and it
 * keeps the answer clean if it is later copied, exported or logged.
 */

import { extractJson } from '../../lib/ai/json';
import { sanitizeField, sanitizeProse } from '../../lib/sanitize';

const MAX_ANSWER_CHARS = 6_000;
const MAX_HEADLINE_CHARS = 180;
const MAX_FOLLOW_UPS = 3;
const MAX_FOLLOW_UP_CHARS = 80;
const MIN_CHART_POINTS = 2;
/** How many points each chart type can show and still be read at a glance. */
const MAX_CHART_POINTS: Record<AiChartType, number> = { bar: 8, line: 12, donut: 6 };
const MAX_HIGHLIGHTS = 4;

export interface AiChartPoint {
  label: string;
  value: number;
  /** Exact numeric field in the snapshot, e.g. data.categories.0.spent. */
  source?: string;
}

/**
 * Which picture answers the question fastest: `bar` compares things, `line`
 * shows a trend over three or more periods, `donut` shows how a total splits.
 */
export type AiChartType = 'bar' | 'line' | 'donut';
export type AiUnit = 'currency' | 'percent' | 'number';

export interface AiChart {
  title: string;
  /** Absent on charts stored before types existed; those were all bars. */
  type?: AiChartType;
  unit: AiUnit;
  points: AiChartPoint[];
  /**
   * A worked illustration in a `general` answer — hypothetical figures, never
   * the user's. Rendered with a label saying so and never in their currency,
   * so it cannot be mistaken for a chart of their money.
   */
  illustrative?: boolean;
}

export type AiTone = 'neutral' | 'good' | 'warn' | 'bad';

/** One key figure, shown as a tile so it is read at a glance rather than found in prose. */
export interface AiHighlight {
  label: string;
  value: number;
  /** Exact numeric field in the snapshot, e.g. data.categories.0.spent. */
  source?: string;
  unit: AiUnit;
  tone: AiTone;
}

/**
 * Which of the assistant's two jobs this answer was.
 *
 * `data` reads the user's own records; `general` explains how money works. The
 * distinction is not cosmetic — the confidence badge describes how many months
 * of *their* transactions an answer rests on, and hanging "Low confidence — no
 * transactions logged yet" under a correct explanation of compound interest
 * would discredit an answer that never depended on their data at all.
 */
export type AiAnswerMode = 'data' | 'general';

export interface AiAnswer {
  /** The answer in one sentence, shown first. Empty when the model gave none. */
  headline: string;
  /** Key figures as tiles. Only ever on a `data` answer — see `parseHighlights`. */
  highlights: AiHighlight[];
  /** Markdown, sanitized. Never empty — a blank reply is reported as a failure. */
  answer: string;
  mode: AiAnswerMode;
  followUps: string[];
  chart: AiChart | null;
}

/**
 * Parse a completion into an answer. Returns null when there is nothing usable,
 * which the caller surfaces as "the assistant could not answer" rather than
 * rendering an empty bubble.
 *
 * Prose is preserved, not flattened: `sanitizeProse` keeps newlines (markdown
 * needs them) while removing markup and control characters.
 */
export function parseAiAnswer(content: string): AiAnswer | null {
  const dict = extractJson(content);

  // A model that ignores the JSON contract and replies in plain prose is still
  // useful; treat the raw completion as the answer rather than failing.
  const raw = typeof dict.answer === 'string' && dict.answer.trim()
    ? dict.answer
    : Object.keys(dict).length === 0 ? content : '';

  const answer = sanitizeProse(raw, MAX_ANSWER_CHARS);
  if (!answer) return null;

  // Anything that is not explicitly "general" is treated as an answer about the
  // user's own money. That is the safe default in both directions: a reply that
  // dropped the JSON contract keeps its confidence badge rather than silently
  // losing it, and a model cannot suppress the badge by omitting the field.
  const mode: AiAnswerMode = dict.mode === 'general' ? 'general' : 'data';

  // A headline that merely repeats the answer's opening line adds nothing but
  // height, so it is dropped rather than shown twice.
  const headline = sanitizeField(dict.headline, MAX_HEADLINE_CHARS);
  const firstLine = answer.split('\n')[0].replace(/[*_#>`-]/g, '').trim();

  return {
    headline: headline && headline !== firstLine ? headline : '',
    // Tiles look like the user's own figures, so a general answer — whose
    // numbers are hypothetical — never gets them.
    highlights: mode === 'general' ? [] : parseHighlights(dict.highlights),
    answer,
    mode,
    followUps: parseFollowUps(dict.followUps),
    // Enforced here, not merely asked for: a chart of hypothetical figures is
    // indistinguishable on screen from one of the user's. A general answer may
    // still teach with one, but only marked as an illustration and never in a
    // currency.
    chart: parseChart(dict.chart, mode === 'general'),
  };
}

function parseUnit(v: unknown): AiUnit {
  return v === 'currency' || v === 'percent' ? v : 'number';
}

function parseHighlights(input: unknown): AiHighlight[] {
  if (!Array.isArray(input)) return [];
  const out: AiHighlight[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const label = sanitizeField(row.label, 40);
    const value = typeof row.value === 'number' ? row.value : NaN;
    if (!label || !Number.isFinite(value)) continue;
    const tone: AiTone = row.tone === 'good' || row.tone === 'warn' || row.tone === 'bad' ? row.tone : 'neutral';
    out.push({ label, value, unit: parseUnit(row.unit), tone, ...parseSource(row.source) });
    if (out.length >= MAX_HIGHLIGHTS) break;
  }
  return out;
}

function parseFollowUps(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    const s = sanitizeField(item, MAX_FOLLOW_UP_CHARS);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= MAX_FOLLOW_UPS) break;
  }
  return out;
}

function parseChart(input: unknown, illustrative: boolean): AiChart | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const dict = input as Record<string, unknown>;
  if (!Array.isArray(dict.points)) return null;
  const type: AiChartType = dict.type === 'line' || dict.type === 'donut' ? dict.type : 'bar';

  const points: AiChartPoint[] = [];
  for (const p of dict.points) {
    if (!p || typeof p !== 'object') continue;
    const row = p as Record<string, unknown>;
    const label = sanitizeField(row.label, 40);
    const value = typeof row.value === 'number' ? row.value : NaN;
    // A non-finite or negative value cannot be drawn honestly, so the point is
    // dropped rather than clamped into something the data never said. A donut
    // slice of zero is not a slice.
    if (!label || !Number.isFinite(value) || value < 0 || (type === 'donut' && value === 0)) continue;
    points.push({ label, value, ...parseSource(row.source) });
    if (points.length >= MAX_CHART_POINTS[type]) break;
  }
  if (points.length < MIN_CHART_POINTS) return null;

  // An unrecognised unit on a chart is read as money, as it always was: charts
  // of the user's data are overwhelmingly charts of amounts.
  const unit: AiUnit = dict.unit === 'percent' || dict.unit === 'number' ? dict.unit : 'currency';
  return {
    title: sanitizeField(dict.title, 60),
    type,
    // An illustration is never drawn in a currency: that is the one thing that
    // would make it look like the user's own money.
    unit: illustrative && unit === 'currency' ? 'number' : unit,
    points,
    ...(illustrative ? { illustrative: true } : {}),
  };
}

function parseSource(value: unknown): { source?: string } {
  if (typeof value !== 'string') return {};
  // No prototype keys or executable expressions; paths only index the fact map.
  return /^(data|focus)(\.[A-Za-z0-9_]+)+$/.test(value) && value.length <= 200
    ? { source: value } : {};
}
