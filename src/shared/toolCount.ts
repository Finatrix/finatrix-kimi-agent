/**
 * How many money tools there are — in one place, as a number and as a word.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The site said "seven" in nineteen places. It has eight tools. The Net Worth
 * tracker shipped, `TOOLS` and `TOOL_IDS` both grew to eight, every nav bar and
 * the sitemap picked it up automatically — and every sentence of prose that had
 * counted them by hand stayed wrong. One page even contradicted itself, opening
 * with "the seven money tools are free" and answering the very next question
 * with "all eight calculators".
 *
 * A number written into prose is a number that goes stale. So the count is
 * derived from the canonical id list and interpolated, and the id list lives
 * here rather than in `routes.ts` so that every consumer — the router, the
 * sitemap, the SEO strings and the marketing copy — can read it without any of
 * them having to import each other.
 *
 * Pure data. No DOM, no React, no Node: this is bundled into the edge Worker.
 */

/** The public calculators, in nav order. The single source of truth. */
export const TOOL_IDS = [
  'budget',
  'expenses',
  'investmatch',
  'parksmart',
  'peercompare',
  'goals',
  'lifemap',
  'networth',
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

/** How many there are. Every "N tools" in the product reads this. */
export const TOOL_COUNT: number = TOOL_IDS.length;

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
] as const;

/**
 * The count as a word, for prose — "eight free money tools".
 *
 * Falls back to the digits past twelve, which is where English stops preferring
 * words anyway, and long before this product would have thirteen calculators.
 */
export const TOOL_COUNT_WORD: string = NUMBER_WORDS[TOOL_COUNT] ?? String(TOOL_COUNT);

/** Sentence-case, for the start of a sentence — "Eight free money tools…". */
export const TOOL_COUNT_WORD_CAP: string =
  TOOL_COUNT_WORD.charAt(0).toUpperCase() + TOOL_COUNT_WORD.slice(1);
