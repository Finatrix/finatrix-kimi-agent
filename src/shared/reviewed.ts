/**
 * When the financial assumptions behind this site were last reviewed.
 *
 * WHY THIS REPLACED A CLOCK
 * -------------------------
 * The footer used to show a live local date, time and time zone, ticking every
 * second. It was accurate and it was useless: a clock tells a visitor something
 * their own device already tells them better, it re-rendered every second on
 * every page for nobody, and on a personal-finance site it occupied the one
 * piece of footer real estate where a date genuinely matters.
 *
 * The date that matters is this one. Every market pack in `tools/lib/markets`
 * carries an `asOf` — the month its rates, tax shapes and benchmarks were last
 * checked against their sources — and until now that date was only visible
 * inside a tool, to someone already using it. Stating it site-wide is the
 * strongest honest trust signal the footer can carry: it is checkable, it goes
 * visibly stale on its own, and it says the numbers are maintained by people on
 * a schedule rather than scraped and forgotten.
 *
 * WHY A CONSTANT AND NOT A COMPUTATION
 * ------------------------------------
 * The obvious implementation — `min(...MARKET_LIST.map(m => m.asOf))` — would
 * pull all four market packs (instrument tables, city grids, benchmark
 * matrices) into the landing page's bundle to produce seven characters. The
 * landing footer is on the critical path of the site's most-visited URL.
 *
 * So the value is stated here and `reviewed.test.ts` asserts it equals that
 * minimum, which is the same arrangement `sitemap.xml` uses: a cheap artefact,
 * with a test that fails the moment it stops describing its source. Reviewing a
 * pack and forgetting this line breaks the build rather than shipping a date
 * that quietly overstates how current the site is.
 *
 * THE MINIMUM, NOT THE MAXIMUM
 * ----------------------------
 * "Reviewed June 2026" has to be true of everything a visitor might read, so it
 * is the OLDEST pack's date. Taking the newest would let one freshly-checked
 * market vouch for three stale ones.
 *
 * Pure data. No DOM, no React, no imports.
 */

/** `YYYY-MM`. The oldest `asOf` across every market pack. */
export const ASSUMPTIONS_REVIEWED = '2026-06';

/** `"2026-06"` → `"June 2026"`. Returns the input unchanged if malformed. */
export function reviewedLabel(asOf: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(asOf);
  if (!m) return asOf;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('en', {
    month: 'long',
    year: 'numeric',
  });
}
