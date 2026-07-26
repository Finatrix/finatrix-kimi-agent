/**
 * Canonical brand identity — the public-facing facts about FinatriX that appear
 * on more than one surface.
 *
 * These values were previously hardcoded independently in the footer, both legal
 * pages, the shared legal chrome, `index.html`'s JSON-LD and
 * `.well-known/security.txt`. That is exactly the shape of duplication that
 * drifts: a contact address changes in four of six places and the two that were
 * missed keep publishing an address nobody reads. `brand.test.ts` asserts that
 * the two non-importable surfaces (the static HTML and security.txt) still agree
 * with this module, so the whole set moves together or CI fails.
 *
 * Pure data, no DOM, no React — importable from the app, the edge Worker and the
 * test-suite alike. Companion to `routes.ts` (which owns the canonical host).
 */

import { CANONICAL_HOST } from './routes';

/** The one published contact address. Support, privacy requests and security reports all land here. */
export const SUPPORT_EMAIL = 'finatrix.hub@gmail.com';

/** `mailto:` href for {@link SUPPORT_EMAIL}. */
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

/** Legal/display name of the brand. */
export const BRAND_NAME = 'FinatriX';

/** Absolute canonical site URL, trailing slash included (matches JSON-LD `url`). */
export const BRAND_URL = `https://${CANONICAL_HOST}/`;

/**
 * Official social profiles, in `sameAs` order.
 *
 * DELIBERATELY EMPTY. It is not an oversight and it must not be filled in
 * speculatively. The site previously published `https://twitter.com/finatrix_`
 * in three places — the footer link, `twitter:site`/`twitter:creator`, and the
 * Organization node's `sameAs` — and that handle is not registered: x.com/finatrix_
 * answers HTTP 404. So the only outbound social link on the site led to an error
 * page, X rendered every large card with an attribution to a dead profile, and
 * `sameAs` — whose entire purpose is to let a search engine CONFIRM that a brand
 * entity and a profile are the same organisation — pointed at nothing to confirm.
 *
 * To add a profile: open the URL, confirm it is FinatriX's own account, then add
 * it here. A similar-looking handle is not evidence (x.com/finatrix resolves, and
 * belongs to someone else). `brand.test.ts` enforces the shape of what goes in;
 * it cannot check ownership, which is why this comment exists.
 */
export const SOCIAL_PROFILES: readonly string[] = [];
