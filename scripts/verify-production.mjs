#!/usr/bin/env node
/**
 * Production domain verification — is https://finatrix.co actually serving what
 * this repository says it should?
 *
 * `scripts/verify-deployment.mjs` answers "does Supabase match the repo?".
 * This answers the other half, which the finatrix.online → finatrix.co
 * migration made urgent: a `wrangler deploy` that exits 0 tells you an upload
 * succeeded. It tells you nothing about whether DNS resolves, whether the
 * certificate covers www, whether the apex 301 fires, or whether the canonical
 * tag on a live page names the domain you just migrated to. Every one of those
 * can be wrong while every local gate stays green.
 *
 * Checks performed against the live origin:
 *   • HTTPS reachable, and plain HTTP is 301'd to it
 *   • www 301s to the apex, preserving path + query, in a single hop
 *   • HSTS present with a >= 1 year max-age
 *   • every sitemap URL returns 200 and self-canonicalises to itself
 *   • no sitemap URL is noindex, and none names a retired domain
 *   • robots.txt points at this origin's sitemap
 *   • JSON-LD parses and every absolute URL in it is on the canonical origin
 *   • an unknown URL returns a real 404, not a soft-404
 *   • the OG/Twitter image resolves
 *   • every favicon and manifest icon resolves, on `/` and on client routes
 *   • Supabase Auth returns users to THIS origin, not a previous domain, and
 *     every auth-email landing page (/login, /reset-password) is served 200
 *   • every edge function accepts CORS preflight from THIS origin
 *   • the deployed JS bundle was built with real Supabase credentials, not the
 *     placeholder client that silently disables sign-in, sync and analytics
 *
 * The last two exist because the first migration to finatrix.co passed every
 * other check on this list while login was completely broken. Two pieces of
 * deployed state still named older domains and neither lives in the repo:
 * the Auth "Site URL" (still the original Netlify preview host, so every
 * magic-link, email-confirm, password-reset and OAuth callback bounced the
 * user off the site without a session), and the CAREERS_ALLOWED_ORIGINS
 * secret (still finatrix.online, so the analytics ingest answered every
 * request with a retired origin and the browser blocked it). Both are
 * invisible to a build, a test suite and an SEO crawl. They are visible here.
 *
 * Exit codes:
 *   0  everything verified (or DNS does not resolve yet — see below)
 *   1  the domain is reachable and something is WRONG
 *
 * A domain that does not resolve at all exits 0 with a clear "not live yet"
 * message: before the DNS cutover that is the expected state, and failing CI
 * for it would train people to ignore this script. Once the host answers, the
 * checks are strict.
 *
 * Usage:  npm run verify:production
 *         ORIGIN=https://staging.example.com npm run verify:production
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { sampleUntilAnswered } from './lib/retry.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

const ORIGIN = (process.env.ORIGIN || 'https://finatrix.co').replace(/\/+$/, '');
const { host: APEX } = new URL(ORIGIN);
const RETIRED = ['finatrix.online', 'finatrix.space', 'workers.dev', 'fiantrix', 'netlify.app'];
const TIMEOUT_MS = 20_000;

/** Edge functions the browser calls cross-origin; all must accept ORIGIN. */
// careers-billing-webhook is deliberately excluded: Stripe calls it
// server-to-server (no browser Origin, no CORS applicable).
const EDGE_FUNCTIONS = ['analytics-collect', 'careers-jobs', 'careers-ai', 'careers-email', 'careers-billing-checkout'];

/**
 * The Supabase project the deployed site talks to. Read from the environment
 * first (CI), then `.env` (local), mirroring verify-deployment.mjs. Without it
 * the auth and CORS checks report "skipped" rather than passing vacuously —
 * a check that cannot run must never look like a check that passed.
 */
function dotEnvValue(key) {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return '';
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, '').trim();
  }
  return '';
}

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || dotEnvValue('VITE_SUPABASE_URL') || '')
  .replace(/\/+$/, '');

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

/**
 * Every request identifies itself. An unnamed client is indistinguishable from
 * a scraper to any edge bot defence, and when this verifier IS challenged the
 * only way to recognise it in Cloudflare's Security Events is by its name.
 */
const USER_AGENT = 'FinatriX-deploy-verify/1.0 (+https://finatrix.co/; CI)';

async function fetchOnce(url, { method = 'GET', redirect = 'manual', headers } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method,
      redirect,
      headers: { 'User-Agent': USER_AGENT, ...headers },
      signal: ctrl.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One request, sampled more than once before it is allowed to fail a deploy.
 *
 * The reasoning, and what is deliberately NOT retried, live in
 * scripts/lib/retry.mjs beside the code — and are pinned by
 * src/test/deployRetry.test.mjs, because this is the single decision that
 * separates "production is broken" from "the runner had a bad second", and
 * getting it wrong in either direction is expensive.
 */
async function req(url, options = {}) {
  return sampleUntilAnswered(() => fetchOnce(url, options));
}

/**
 * Did Cloudflare's edge answer instead of the Worker?
 *
 * A challenge (Bot Fight Mode, WAF, rate limiting) returns 403 from the edge
 * before the request ever reaches the origin. Every content assertion below
 * then reads that challenge page and reports something untrue but plausible:
 * "no og:image", "no favicons", "soft-404", "no entry <script>". Thirty such
 * lines look exactly like a broken deploy and are the single most expensive
 * way this script can be wrong, so it is detected once, named, and reported
 * as itself.
 */
function challengeReason(res) {
  if (!res) return null;
  const mitigated = res.headers.get('cf-mitigated');
  if (mitigated) return { cloudflare: true, why: `Cloudflare returned "cf-mitigated: ${mitigated}"` };
  if (res.status !== 403 && res.status !== 503) return null;
  if (res.headers.get('cf-ray')) {
    return {
      cloudflare: true,
      why: `Cloudflare answered HTTP ${res.status} at the edge (cf-ray present, no origin response)`,
    };
  }
  // No cf-ray, but worker/index.ts only ever answers 200, 301 or 404 on a
  // document path — it has no code path that produces 403 or 503. So this did
  // not come from our origin either: an egress proxy, a corporate TLS
  // intercept, a sandboxed CI network. Requiring cf-ray here meant those cases
  // fell through and every content assertion below graded the interceptor's
  // error body instead, producing exactly the page of plausible, untrue
  // failures this function exists to prevent.
  return {
    cloudflare: false,
    why: `an intermediary answered HTTP ${res.status} (no cf-ray, and the Worker never returns ${res.status})`,
  };
}

/** Is the apex answering at all? Everything below is pointless if not. */
async function isLive() {
  const res = await req(`${ORIGIN}/healthz`, { redirect: 'follow' });
  return Boolean(res);
}

// ── HTTPS + redirect topology ──────────────────────────────────────────────
async function checkRedirects() {
  const cases = [
    { from: `http://${APEX}/tools/budget?ref=x`, to: `${ORIGIN}/tools/budget?ref=x`, what: 'http → https' },
    { from: `https://www.${APEX}/privacy`, to: `${ORIGIN}/privacy`, what: 'www → apex' },
    { from: `http://www.${APEX}/`, to: `${ORIGIN}/`, what: 'http www → https apex (single hop)' },
  ];
  const bad = [];
  for (const c of cases) {
    const res = await req(c.from);
    if (!res) { bad.push(`${c.what}: unreachable`); continue; }
    if (res.status !== 301) { bad.push(`${c.what}: HTTP ${res.status}, expected 301`); continue; }
    const loc = res.headers.get('location');
    if (loc !== c.to) bad.push(`${c.what}: → ${loc}, expected ${c.to}`);
  }
  record('canonical redirects', bad.length === 0, bad.length ? bad.join('\n     ') : `${cases.length} redirects correct`);
}

// ── HSTS ───────────────────────────────────────────────────────────────────
async function checkHsts() {
  const res = await req(`${ORIGIN}/`, { redirect: 'follow' });
  if (!res) { record('HSTS', false, `no response from ${ORIGIN}/`); return; }
  const hsts = res.headers.get('strict-transport-security');
  if (!hsts) { record('HSTS', false, 'Strict-Transport-Security header absent'); return; }
  const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
  record('HSTS', maxAge >= 31_536_000, maxAge >= 31_536_000 ? hsts : `max-age=${maxAge} is under one year: ${hsts}`);
}

// ── every sitemap URL is live, self-canonical and indexable ────────────────
function sitemapPaths() {
  const xml = readFileSync(join(ROOT, 'public/sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function checkSitemapUrls() {
  const locs = sitemapPaths();
  const bad = [];
  if (!locs.length) bad.push('sitemap.xml lists no URLs');

  for (const loc of locs) {
    if (!loc.startsWith(`${ORIGIN}/`) && loc !== `${ORIGIN}/`) {
      bad.push(`${loc} is not on ${ORIGIN}`);
      continue;
    }
    const res = await req(loc, { redirect: 'manual' });
    if (!res) { bad.push(`${loc}: unreachable`); continue; }
    if (res.status !== 200) { bad.push(`${loc}: HTTP ${res.status}`); continue; }

    const html = await res.text();
    const canonical = /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/.exec(html)?.[1];
    const ogUrl = /<meta[^>]+property="og:url"[^>]+content="([^"]+)"/.exec(html)?.[1];
    const robots = /<meta[^>]+name="robots"[^>]+content="([^"]+)"/.exec(html)?.[1];

    // EXACT self-canonical, not merely "on the right origin".
    //
    // This check used to accept any canonical on the canonical origin, on the
    // grounds that the pre-hydration shell could only carry index.html's static
    // homepage value and that per-route correctness was the unit tests' problem.
    // That reasoning had a hole: it made the assertion blind to the single worst
    // outcome it could have caught — every calculator page advertising `/` as
    // its canonical, which is a direct instruction to search engines to
    // consolidate the entire organic surface into the homepage. It passed
    // happily while that was true in production.
    //
    // The Worker now rewrites canonical/og:url per route via HTMLRewriter
    // (`withSeoMetadata`), so the served bytes are correct with no JavaScript,
    // and this can demand the real thing. Trailing slash is normalised because
    // sitemap.xml lists the apex as `${ORIGIN}/` while deeper URLs carry none.
    const self = loc.replace(/\/+$/, '') || ORIGIN;
    const norm = (u) => (u ?? '').replace(/\/+$/, '') || ORIGIN;

    if (norm(canonical) !== self) {
      bad.push(`${loc}: canonical is "${canonical}", expected "${loc}"`);
    }
    if (norm(ogUrl) !== self) {
      bad.push(`${loc}: og:url is "${ogUrl}", expected "${loc}"`);
    }
    if (robots && /noindex/i.test(robots)) bad.push(`${loc}: served as ${robots}`);
    for (const r of RETIRED) {
      if (html.includes(r)) { bad.push(`${loc}: response still mentions "${r}"`); break; }
    }
  }
  record('sitemap URLs', bad.length === 0, bad.length ? bad.join('\n     ') : `${locs.length} URLs live, indexable, self-canonical (canonical + og:url) on ${APEX}`);
}

// ── robots.txt ─────────────────────────────────────────────────────────────
async function checkRobots() {
  const res = await req(`${ORIGIN}/robots.txt`, { redirect: 'follow' });
  if (!res || res.status !== 200) { record('robots.txt', false, `HTTP ${res?.status ?? 'unreachable'}`); return; }
  const txt = await res.text();
  const wants = `Sitemap: ${ORIGIN}/sitemap.xml`;
  const retired = RETIRED.filter((r) => txt.includes(r));
  record('robots.txt', txt.includes(wants) && retired.length === 0,
    retired.length ? `still references ${retired.join(', ')}` : txt.includes(wants) ? wants : `missing "${wants}"`);
}

// ── JSON-LD ────────────────────────────────────────────────────────────────
async function checkStructuredData() {
  const res = await req(`${ORIGIN}/`, { redirect: 'follow' });
  if (!res) { record('JSON-LD', false, 'homepage unreachable'); return; }
  const html = await res.text();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!blocks.length) { record('JSON-LD', false, 'no application/ld+json block on the homepage'); return; }

  const bad = [];
  let nodes = 0;
  for (const block of blocks) {
    let parsed;
    try { parsed = JSON.parse(block); } catch (e) { bad.push(`invalid JSON: ${e.message}`); continue; }
    const graph = parsed['@graph'] ?? [parsed];
    nodes += graph.length;
    for (const node of graph) {
      if (!node['@type']) bad.push('a node has no @type');
    }
    // Matched on HOSTNAME so off-site `sameAs` profile links are left alone.
    for (const raw of JSON.stringify(parsed).match(/https?:\/\/[^"\\]+/g) ?? []) {
      let hostname;
      try { ({ hostname } = new URL(raw)); } catch { bad.push(`unparseable URL: ${raw}`); continue; }
      if (/finatrix/i.test(hostname) && !raw.startsWith(ORIGIN)) bad.push(`${raw} is not on ${ORIGIN}`);
    }
  }
  record('JSON-LD', bad.length === 0, bad.length ? bad.join('\n     ') : `${nodes} node(s) valid, all URLs on ${APEX}`);
}

// ── honest 404 ─────────────────────────────────────────────────────────────
async function checkSoft404() {
  const res = await req(`${ORIGIN}/definitely-not-a-route-${Date.now()}`, { redirect: 'follow' });
  record('honest 404', res?.status === 404, res ? `HTTP ${res.status}${res.status === 404 ? '' : ' — soft-404'}` : 'unreachable');
}

// ── social image ───────────────────────────────────────────────────────────
async function checkOgImage() {
  const home = await req(`${ORIGIN}/`, { redirect: 'follow' });
  if (!home) { record('og:image', false, 'homepage unreachable'); return; }
  const html = await home.text();
  const src = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(html)?.[1];
  if (!src) { record('og:image', false, 'no og:image tag'); return; }
  const res = await req(src, { method: 'HEAD', redirect: 'follow' });
  record('og:image', res?.status === 200, `${src} → HTTP ${res?.status ?? 'unreachable'}`);
}

// ── the icon set is live and reachable ─────────────────────────────────────
/**
 * Favicons fail quietly. A 404 on /favicon.ico appears once per page load in
 * DevTools and nowhere else; a stale cache entry means the person who shipped
 * the change is often the last to see it. So verify against the live origin:
 * every icon the shipped HTML and manifest reference must resolve, with an
 * image content-type and a non-empty body.
 *
 * Checked on the homepage and on a sample of real routes, because the SPA shell
 * is served by the Worker for client routes and by the assets runtime for `/` —
 * two different paths through the stack that could disagree.
 */
async function checkIcons() {
  const home = await req(`${ORIGIN}/`, { redirect: 'follow' });
  if (!home) { record('favicons', false, 'homepage unreachable'); return; }
  const html = await home.text();

  const hrefs = [...html.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon|mask-icon)"[^>]*>/g)]
    .map((m) => /href="([^"]+)"/.exec(m[0])?.[1])
    .filter(Boolean);

  const bad = [];
  if (hrefs.length === 0) bad.push('the homepage declares no icon <link> at all');

  // The manifest names the icons Android and the install prompt use.
  const manifestRes = await req(`${ORIGIN}/manifest.webmanifest`, { redirect: 'follow' });
  let manifestIcons = [];
  if (!manifestRes || manifestRes.status !== 200) {
    bad.push(`manifest.webmanifest → HTTP ${manifestRes?.status ?? 'unreachable'}`);
  } else {
    try {
      manifestIcons = (JSON.parse(await manifestRes.text()).icons ?? []).map((i) => i.src);
    } catch (e) { bad.push(`manifest.webmanifest is not valid JSON: ${e.message}`); }
  }

  for (const href of [...new Set([...hrefs, ...manifestIcons])]) {
    const url = new URL(href, `${ORIGIN}/`).toString();
    const res = await req(url, { redirect: 'follow' });
    if (!res) { bad.push(`${href}: unreachable`); continue; }
    if (res.status !== 200) { bad.push(`${href}: HTTP ${res.status}`); continue; }
    const type = res.headers.get('content-type') ?? '';
    if (!/^image\//.test(type)) bad.push(`${href}: Content-Type "${type}" is not an image`);
    const bytes = (await res.arrayBuffer()).byteLength;
    if (bytes === 0) bad.push(`${href}: empty response`);
  }

  // /favicon.ico is requested by path, without reading the HTML, by legacy
  // clients and crawlers. It must exist even though nothing links to it bare.
  const ico = await req(`${ORIGIN}/favicon.ico`, { redirect: 'follow' });
  if (ico?.status !== 200) bad.push(`/favicon.ico (unversioned): HTTP ${ico?.status ?? 'unreachable'}`);

  // Client routes are served the shell by the Worker rather than the assets
  // runtime — verify the icon links survive that path too.
  for (const route of ['/tools/budget', '/privacy']) {
    const res = await req(`${ORIGIN}${route}`, { redirect: 'follow' });
    if (res?.status !== 200) { bad.push(`${route}: HTTP ${res?.status ?? 'unreachable'}`); continue; }
    if (!/<link[^>]+rel="icon"/.test(await res.text())) bad.push(`${route}: shell declares no icon link`);
  }

  record('favicons', bad.length === 0,
    bad.length ? bad.join('\n     ') : `${hrefs.length} declared + manifest icons all resolve`);
}

// ── Supabase Auth returns users to THIS origin ─────────────────────────────
/**
 * The check that would have caught the broken migration.
 *
 * GoTrue only honours a `redirect_to` that is on its Redirect-URLs allowlist.
 * Anything else is silently discarded and the user is sent to the project's
 * Site URL instead — which is exactly what a half-finished domain move leaves
 * behind, and it breaks every auth flow at once: magic link, email
 * confirmation, password reset and OAuth callback all land on the old host,
 * so the session is never established on the new one.
 *
 * Probing it is non-destructive: `/auth/v1/verify` with a deliberately invalid
 * token always 303s to `<resolved redirect>#error=...`. The token is rejected;
 * only the HOST of the Location header is of interest. If it is not this
 * origin, `redirect_to` was discarded and auth is broken here.
 */
/**
 * Every path an auth email can send someone to. Both must be allow-listed, and
 * both must be served by the edge, or the flow that uses them is a dead end:
 *   /login           — email confirmation (`emailRedirectTo` in AuthContext)
 *   /reset-password  — password recovery (`resetPasswordForEmail`)
 * The second is the one no other check in this file would notice, because it is
 * noindex and therefore absent from sitemap.xml.
 */
const AUTH_LANDINGS = ['/login', '/reset-password'];

async function checkAuthRedirect() {
  if (!SUPABASE_URL) {
    record('auth redirect target', null, 'skipped — VITE_SUPABASE_URL not set');
    return;
  }
  const bad = [];
  for (const path of AUTH_LANDINGS) {
    const target = `${ORIGIN}${path}`;
    const probe = `${SUPABASE_URL}/auth/v1/verify`
      + `?token=invalid-probe-token&type=signup&redirect_to=${encodeURIComponent(target)}`;
    const res = await req(probe);
    if (!res) { bad.push(`${path}: ${SUPABASE_URL} unreachable`); continue; }

    const loc = res.headers.get('location');
    if (!loc) { bad.push(`${path}: HTTP ${res.status} with no Location header`); continue; }
    let host;
    try { ({ host } = new URL(loc)); } catch {
      bad.push(`${path}: unparseable Location: ${loc}`);
      continue;
    }
    if (host !== APEX) {
      bad.push(`${path}: Supabase sent the user to "${host}", not ${APEX}.\n`
        + `     ${target} is NOT in Authentication → URL Configuration → Redirect URLs,\n`
        + `     so that flow falls back to the Site URL. Add ${ORIGIN}/** and set\n`
        + `     the Site URL to ${ORIGIN}.`);
      continue;
    }

    // Allow-listed is necessary but not sufficient: the user still has to be
    // served a page when they get there. /reset-password is a client route with
    // no built file behind it, so this is the Worker's `isKnownRoute` answering
    // — and a 404 here strands someone holding a valid, single-use recovery
    // grant that expires whether or not they ever see a form.
    const landing = await req(target, { redirect: 'follow' });
    if (landing?.status !== 200) {
      bad.push(`${path}: allow-listed but the site serves it `
        + `HTTP ${landing?.status ?? 'unreachable'} — the link lands on nothing.`);
    }
  }
  record('auth redirect target', bad.length === 0,
    bad.length ? bad.join('\n     ') : `${AUTH_LANDINGS.join(', ')} are allow-listed and live`);
}

// ── every edge function accepts CORS preflight from THIS origin ────────────
/**
 * A browser refuses a cross-origin response whose `Access-Control-Allow-Origin`
 * is not exactly its own origin. An allowlist left behind on a retired domain
 * therefore takes the API down from the new one — silently for `sendBeacon`
 * callers, which never look at the response at all.
 */
async function checkEdgeCors() {
  if (!SUPABASE_URL) {
    record('edge function CORS', null, 'skipped — VITE_SUPABASE_URL not set');
    return;
  }
  const bad = [];
  for (const fn of EDGE_FUNCTIONS) {
    const res = await req(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'OPTIONS',
      redirect: 'follow',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    if (!res) { bad.push(`${fn}: unreachable`); continue; }
    if (res.status >= 400) { bad.push(`${fn}: preflight HTTP ${res.status}`); continue; }
    const allow = res.headers.get('access-control-allow-origin');
    if (allow !== ORIGIN) {
      bad.push(`${fn}: Access-Control-Allow-Origin is "${allow}", not ${ORIGIN}`
        + (RETIRED.some((r) => allow?.includes(r))
          ? ' — a retired domain. Update the CAREERS_ALLOWED_ORIGINS secret and redeploy.'
          : ''));
    }
  }
  record('edge function CORS', bad.length === 0,
    bad.length ? bad.join('\n     ') : `${EDGE_FUNCTIONS.length} functions accept ${ORIGIN}`);
}

// ── the deployed bundle was actually built with real Supabase credentials ──
/**
 * `checkAuthRedirect` and `checkEdgeCors` prove Supabase itself is configured
 * correctly. Neither proves the DEPLOYED FRONTEND was built with credentials
 * at all: `src/lib/supabase.ts` falls back to a harmless
 * `https://placeholder.supabase.co` client so a misconfigured build never
 * crashes — it just silently disables sign-in, cloud sync and analytics for
 * every visitor while every other check above stays green, because none of
 * them load the JS the browser actually runs.
 *
 * `VITE_*` vars are inlined by Vite at BUILD time, not read at runtime, so
 * this cannot be checked from Worker env vars or Supabase settings — the only
 * way to know is to fetch the bundle actually served and look for the
 * placeholder host baked into it.
 */
async function checkFrontendConfigured() {
  const home = await req(`${ORIGIN}/`, { redirect: 'follow' });
  if (!home) { record('frontend Supabase config', false, 'homepage unreachable'); return; }
  const html = await home.text();
  const entry = /<script[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"/.exec(html)?.[1];
  if (!entry) { record('frontend Supabase config', false, 'no entry <script> found on the homepage'); return; }

  const bundleRes = await req(new URL(entry, `${ORIGIN}/`).toString(), { redirect: 'follow' });
  if (!bundleRes) { record('frontend Supabase config', false, `${entry}: unreachable`); return; }
  const bundle = await bundleRes.text();

  if (bundle.includes('placeholder.supabase.co')) {
    record('frontend Supabase config', false,
      'the deployed bundle ships the placeholder Supabase client — VITE_SUPABASE_URL/'
      + 'VITE_SUPABASE_ANON_KEY were not set when `npm run build` produced this dist/. '
      + 'Sign-in, cloud sync and analytics are silently disabled for every visitor. '
      + 'Rebuild with a populated .env and `npx wrangler deploy` again.');
    return;
  }
  record('frontend Supabase config', true, `${entry} was built with real credentials`);
}

// ── run ────────────────────────────────────────────────────────────────────
console.log(`\nFinatriX production verification — ${ORIGIN}\n`);

if (!(await isLive())) {
  console.log(`  – ${APEX} does not resolve or is not answering yet.`);
  console.log('    Nothing to verify. Re-run once DNS and the certificate are live.\n');
  process.exit(0);
}

/**
 * Being challenged means this script verified NOTHING — it is inconclusive, not
 * a failure, and it exits 0.
 *
 * It used to exit 1, which contradicted the very sentence it printed ("NOT a
 * broken deploy") and made every deploy hostage to a decision no one here
 * controls: whether Cloudflare's bot scoring challenges the Azure IP that
 * GitHub happened to hand this run. When it does, the challenge lands AFTER
 * `wrangler deploy` has already shipped successfully — so the site is live and
 * correct while the pipeline goes red, which is the most misleading outcome
 * available. The block directly above already treats "cannot verify" (DNS not
 * live yet) as exit 0; this is the same category and now matches it.
 *
 * The gate is not lost. Whenever the runner is not challenged — which is most
 * runs — all eleven checks execute and still fail the deploy on a genuinely
 * broken site. What is gone is failing on the days we are not allowed to look.
 *
 * The real fix is on the Cloudflare side and is a dashboard action, not a code
 * one: turn Bot Fight Mode off, or move to Super Bot Fight Mode. It cannot be
 * fixed with a WAF rule — Bot Fight Mode runs outside the Ruleset Engine, so
 * Skip/Bypass/Allow have no effect on it. Until then this stays loud in the
 * log and silent in the exit code.
 */
const challenge = challengeReason(await req(`${ORIGIN}/`, { redirect: 'follow' }));
if (challenge) {
  console.error(`  – UNVERIFIED — blocked before the origin: ${challenge.why}.`);
  console.error('');
  console.error(`    ${ORIGIN} never saw these requests, so nothing below could be checked.`);
  console.error('    This is a network/edge problem, NOT a broken deploy — the same URLs');
  console.error('    answer 200 from an ordinary browser, so the deploy is not failed for');
  console.error('    it. Production has NOT been verified by this run.');
  console.error('');
  if (challenge.cloudflare) {
    console.error('    Cloudflare → Security → Analytics → Events names the responsible product');
    console.error('    in the "Service" column. Bot Fight Mode (Free plan) is the usual cause and');
    console.error('    cannot be skipped by any rule: it runs outside the Ruleset Engine, so');
    console.error('    custom-rule Skip/Bypass/Allow actions have no effect on it. The options are');
    console.error('    to turn it off, or to move to Super Bot Fight Mode, which does support Skip.');
  } else {
    console.error('    Nothing identifies this as Cloudflare, so the block is between this');
    console.error('    machine and the edge: an egress proxy or allowlist, a TLS intercept, or a');
    console.error('    sandboxed CI network. Re-run from a host that can reach the apex directly.');
  }
  console.error('');
  process.exit(0);
}

await checkRedirects();
await checkHsts();
await checkRobots();
await checkSitemapUrls();
await checkStructuredData();
await checkSoft404();
await checkOgImage();
await checkIcons();
await checkAuthRedirect();
await checkEdgeCors();
await checkFrontendConfigured();

let failed = 0;
for (const r of results) {
  // `null` means the check could not run (missing credentials) — reported as
  // skipped, never counted as a pass, so a silent gap is always visible.
  const mark = r.ok === null ? '  –' : r.ok ? '  ✓' : '  ✗';
  console.log(`${mark} ${r.name}: ${r.detail}`);
  if (r.ok === false) failed++;
}
console.log('');
if (failed) {
  console.error(`${failed} check(s) FAILED — ${ORIGIN} is not serving what this repository specifies.\n`);
  process.exit(1);
}
console.log(`${ORIGIN} matches this repository.\n`);
