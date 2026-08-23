/**
 * The public calculator registry, and the prose forms of how many there are.
 *
 * A leaf module on purpose: it imports nothing. `TOOL_IDS` used to live in
 * `routes.ts`, which imports `publicPages.ts` — so any page registry that
 * wanted the count back had to close an import cycle, and the cycle evaluates
 * `PUBLIC_PAGE_PATHS` as `undefined`. Keeping the registry at the bottom of the
 * graph lets both sides read it without one.
 *
 * `routes.ts` re-exports `TOOL_IDS` and `ToolId`, so existing imports are
 * unchanged.
 */

/** The public calculators. Source of truth for the sitemap + edge 404s. */
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

/** How many public calculators there are. */
export const TOOL_COUNT = TOOL_IDS.length;

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve',
] as const;

/**
 * The tool count spelled out, for the prose that names it.
 *
 * Derived rather than typed, because a hardcoded number word is a claim that
 * silently becomes false the moment a tool is added. It did: every homepage
 * description, both social cards, the `ItemList` JSON-LD and the "What is
 * FinatriX?" answer read "Seven free… money tools" while `TOOL_IDS` held eight
 * and the hero rendered eight cards — and the same JSON-LD node carried
 * `numberOfItems: 8` two lines below the word "Seven". `seo.test.ts` now binds
 * the copy to this value, so the next tool updates the sentence with it.
 */
export const TOOL_COUNT_WORD: string = NUMBER_WORDS[TOOL_COUNT] ?? String(TOOL_COUNT);

/** Sentence-initial form of `TOOL_COUNT_WORD` ("Eight"). */
export const TOOL_COUNT_WORD_CAP: string =
  TOOL_COUNT_WORD.charAt(0).toUpperCase() + TOOL_COUNT_WORD.slice(1);
