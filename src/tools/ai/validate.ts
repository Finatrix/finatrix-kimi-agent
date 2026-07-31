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
const MAX_FOLLOW_UPS = 3;
const MAX_FOLLOW_UP_CHARS = 80;
const MAX_CHART_POINTS = 8;
const MIN_CHART_POINTS = 2;

export interface AiChartPoint {
  label: string;
  value: number;
}

export interface AiChart {
  title: string;
  unit: 'currency' | 'percent';
  points: AiChartPoint[];
}

export interface AiAnswer {
  /** Markdown, sanitized. Never empty — a blank reply is reported as a failure. */
  answer: string;
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

  return {
    answer,
    followUps: parseFollowUps(dict.followUps),
    chart: parseChart(dict.chart),
  };
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

function parseChart(input: unknown): AiChart | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const dict = input as Record<string, unknown>;
  if (!Array.isArray(dict.points)) return null;

  const points: AiChartPoint[] = [];
  for (const p of dict.points) {
    if (!p || typeof p !== 'object') continue;
    const row = p as Record<string, unknown>;
    const label = sanitizeField(row.label, 40);
    const value = Number(row.value);
    // A non-finite or negative bar cannot be drawn honestly, so the point is
    // dropped rather than clamped into something the data never said.
    if (!label || !Number.isFinite(value) || value < 0) continue;
    points.push({ label, value });
    if (points.length >= MAX_CHART_POINTS) break;
  }
  if (points.length < MIN_CHART_POINTS) return null;

  return {
    title: sanitizeField(dict.title, 60),
    unit: dict.unit === 'percent' ? 'percent' : 'currency',
    points,
  };
}
