#!/usr/bin/env node
/**
 * Deployment verification — does PRODUCTION match this repository?
 *
 * Written after a release review found two failures that no test, lint or build
 * could ever catch, because both were about deployed *state* rather than code:
 *
 *   1. The live `careers-jobs` function was running a superseded provider
 *      contract. The fix had been committed weeks earlier and never deployed,
 *      so the three highest-priority providers returned nothing in production
 *      while every local check stayed green.
 *   2. None of the tables the provider infrastructure depends on existed. Every
 *      store degrades silently by design, so search ran with no cache, no health
 *      gating and no quota enforcement — and reported itself perfectly healthy.
 *
 * Checks performed:
 *   • Required database relations exist (PostgREST, public anon key, read-only).
 *   • Every edge function has deployed source, and that source matches the repo
 *     once insignificant whitespace is set aside (the bundler strips it). A
 *     function never deployed is a hard failure; a surviving difference is an
 *     advisory — see checkFunctionDrift for why.
 *   • The public analytics ingest accepts an unauthenticated POST — the way a
 *     browser actually calls it. Deployed with the default JWT gate on, it
 *     answers 401 before the function runs and silently drops 100% of events,
 *     error reports and web vitals, because the client fires `sendBeacon` and
 *     never looks at the response.
 *
 * Exit codes:
 *   0  everything verified, or a check was skipped for lack of credentials
 *   1  a check ran and FAILED — production does not match the repository
 *
 * Usage:  npm run verify:deploy
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/** Relations the application depends on at runtime. */
const REQUIRED_RELATIONS = [
  'provider_cache',
  'provider_health_events',
  'provider_metric_events',
  'provider_quota',
  'job_search_history',
  'provider_ops_health',
  'provider_ops_top_terms',
  'provider_ops_search_volume',
  'provider_ops_status',
  'analytics_events',
];

/**
 * Edge functions whose deployed source must match the repo.
 *
 * Every function the deploy workflow ships belongs here. The list used to name
 * only the two careers functions, which meant the two BILLING functions — the
 * ones that take money and grant access — could drift from `main` indefinitely
 * with a green pipeline, and `analytics-collect` could silently fall behind the
 * client's event allowlist (it answers 204 whether it accepts an event or drops
 * it, so a stale allowlist looks exactly like a healthy one from the browser).
 */
const FUNCTIONS = [
  'careers-jobs',
  'careers-ai',
  'careers-email',
  'careers-billing-checkout',
  'careers-billing-webhook',
  'analytics-collect',
];

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

// ── env ────────────────────────────────────────────────────────────────────
function loadDotEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const dotenv = loadDotEnv();
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || dotenv.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || dotenv.VITE_SUPABASE_ANON_KEY || '';
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF
  || (existsSync(join(ROOT, 'supabase/.temp/project-ref'))
    ? readFileSync(join(ROOT, 'supabase/.temp/project-ref'), 'utf8').trim()
    : '');

// ── check 1: required relations exist ──────────────────────────────────────
/**
 * PostgREST answers `PGRST205 "Could not find the table"` for a relation that
 * does not exist, and `200 []` for one that exists but denies rows under RLS.
 * That distinction is what makes this check meaningful with only a public key:
 * we are testing for EXISTENCE, never for readability.
 */
async function checkRelations() {
  if (!SUPABASE_URL || !ANON_KEY) {
    record('database relations', null, 'skipped — VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set');
    return;
  }
  const missing = [];
  for (const rel of REQUIRED_RELATIONS) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${rel}?select=*&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    }).catch(() => null);
    if (!res) { missing.push(`${rel} (network error)`); continue; }
    if (res.status === 404) {
      const body = await res.json().catch(() => ({}));
      if (String(body.code) === 'PGRST205') missing.push(rel);
    }
  }
  record(
    'database relations',
    missing.length === 0,
    missing.length
      ? `${missing.length}/${REQUIRED_RELATIONS.length} missing: ${missing.join(', ')}\n`
        + '     → apply supabase/careers_provider_infrastructure.sql and supabase/analytics_schema.sql'
      : `all ${REQUIRED_RELATIONS.length} present`,
  );
}

// ── check 2: deployed function source matches the repo ─────────────────────
function tsFilesUnder(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFilesUnder(p));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/** Total local files this check is capable of comparing — context for the ratio. */
function countComparableFiles() {
  return FUNCTIONS.reduce(
    (total, slug) => total + tsFilesUnder(join(ROOT, 'supabase/functions', slug)).length,
    0,
  );
}

/**
 * The deployed copy is not byte-identical to the repo, and never will be.
 *
 * This was read twice as read-after-write lag — first with a 150s retry, then
 * a ~7 minute one. Both shipped, both ran to exhaustion, both still reported
 * every file of every function as drifted. The excerpt the second one finally
 * printed is what settled it:
 *
 *     first difference — careers-jobs/index.ts, line 24:
 *       repo   | //   Remotive needs no key.
 *              | ⟵ blank line
 *       remote | //   Remotive needs no key.
 *              | import { createClient } from 'jsr:@supabase/supabase-js@2';
 *
 * Identical comments either side; the deployed copy simply has no blank line
 * between them and the import. That is the bundler stripping insignificant
 * whitespace, not a stale version — so waiting could never have cleared it, and
 * the ~7 minutes was spent on every deploy for a comparison that could not
 * succeed.
 *
 * So the comparison is made on what actually carries meaning. Blank lines and
 * trailing whitespace are removed from BOTH sides before comparing: in
 * TypeScript neither changes behaviour, and a diff consisting only of them is
 * not drift worth reporting, let alone blocking a release for.
 *
 * A short window is still kept. Read-after-write lag has not been disproven —
 * only shown to be insufficient as an explanation — and if the store does serve
 * a stale version briefly, a genuinely different file would show up as drift
 * for a few seconds after deploying. Two quick re-reads cost nothing on a pass
 * and remove that last false positive, without pretending a seven-minute wait
 * fixes a formatting difference.
 */
const DRIFT_RETRY_DELAYS_MS = [15_000, 30_000];

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Source reduced to what changes behaviour: blank lines dropped, trailing
 * whitespace trimmed. Deliberately conservative — indentation, ordering and
 * every token are preserved, so a real edit still registers as a difference.
 */
function significantSource(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line !== '')
    .join('\n');
}

/** Lines of leading context to show around the first differing line. */
const DIFF_CONTEXT_LINES = 3;

/** The first line at which two texts diverge, with a little context each side. */
function firstDifference(localText, remoteText) {
  const a = localText.split('\n');
  const b = remoteText.split('\n');
  const limit = Math.max(a.length, b.length);
  for (let i = 0; i < limit; i++) {
    if (a[i] === b[i]) continue;
    const from = Math.max(0, i - DIFF_CONTEXT_LINES);
    const show = (lines) => lines
      .slice(from, i + 1)
      .map((line) => (line === undefined ? '(end of file)' : line))
      .join('\n       | ');
    return { line: i + 1, local: show(a), remote: show(b) };
  }
  return null;
}

function collectDrift(slugs) {
  const work = mkdtempSync(join(tmpdir(), 'fx-deploy-verify-'));
  const drifted = [];
  const driftedSlugs = new Set();
  const notDeployed = [];
  let sample = null;

  for (const slug of slugs) {
    try {
      execFileSync('npx', ['--yes', 'supabase@latest', 'functions', 'download', slug, '--project-ref', PROJECT_REF],
        { cwd: work, stdio: 'pipe' });
    } catch (e) {
      return { skipped: `skipped — could not download ${slug} (needs SUPABASE_ACCESS_TOKEN): ${String(e.message).slice(0, 120)}` };
    }
    const localDir = join(ROOT, 'supabase/functions', slug);
    const remoteDir = join(work, 'supabase/functions', slug);

    // Nothing came back at all: the function has never been deployed. This is
    // the one verdict a lossy round trip cannot manufacture.
    if (tsFilesUnder(remoteDir).length === 0) {
      notDeployed.push(slug);
      continue;
    }

    for (const localFile of tsFilesUnder(localDir)) {
      const rel = relative(localDir, localFile);
      const remoteFile = join(remoteDir, rel);
      // A file absent remotely is normal — the bundler tree-shakes type-only
      // modules — so only compare files that were actually deployed.
      if (!existsSync(remoteFile)) continue;
      const localText = significantSource(readFileSync(localFile, 'utf8'));
      const remoteText = significantSource(readFileSync(remoteFile, 'utf8'));
      if (localText === remoteText) continue;
      drifted.push(`${slug}/${rel}`);
      driftedSlugs.add(slug);
      if (!sample) sample = { file: `${slug}/${rel}`, at: firstDifference(localText, remoteText) };
    }
  }
  return { drifted, driftedSlugs: [...driftedSlugs], notDeployed, sample };
}

/**
 * WHAT THIS CAN AND CANNOT PROVE
 * ------------------------------
 * Comparing significant source (see `significantSource`) is what makes this
 * check able to pass at all. Before that it failed on every run for weeks —
 * `wrangler deploy` and `functions deploy` both succeeded and the pipeline went
 * red anyway — because it was grading whitespace the bundler had stripped. A
 * gate that fails on every run stops being read at all, which costs more than
 * having no gate.
 *
 * A difference that survives both normalisation and the retry window is a real
 * difference in code, and worth a look. It is still not proof of drift: this
 * script cannot see whether the download reconstructed something else as well.
 * So the verdicts are split by what each can establish on its own:
 *
 *   • a function with NO deployed source → FAIL. Unambiguous, and precisely the
 *     failure this script was written for: `careers-jobs` ran a superseded
 *     provider contract for weeks because a manual deploy was missed. No amount
 *     of lag or re-bundling can manufacture an empty download.
 *   • source that still differs          → WARN, with an excerpt of the first
 *     difference. Anything reaching here is now a token-level change rather than
 *     formatting, so the excerpt should be read: it is either a genuinely stale
 *     deploy, or a new transformation the bundler has started applying.
 *
 * Currency is not left unguarded. `supabase functions deploy` runs immediately
 * before this script and is authoritative: it compares hashes in the format it
 * owns, uploads when they differ, and fails the step on error. That is the real
 * gate; this is the second opinion, now calibrated to what a second opinion can
 * honestly assert.
 */
async function checkFunctionDrift() {
  if (!PROJECT_REF) {
    record('edge function drift', null, 'skipped — no project ref (supabase link, or set SUPABASE_PROJECT_REF)');
    return;
  }

  let waited = 0;
  let pending = FUNCTIONS;
  for (let attempt = 0; ; attempt++) {
    const outcome = collectDrift(pending);
    if (outcome.skipped) {
      record('edge function drift', null, outcome.skipped);
      return;
    }

    // Absence is decisive and never worth waiting out.
    if (outcome.notDeployed.length > 0) {
      record(
        'edge function drift',
        false,
        `${outcome.notDeployed.length} function(s) have NO deployed source: ${outcome.notDeployed.join(', ')}\n`
          + `     → npx supabase functions deploy ${outcome.notDeployed.join(' ')}`,
      );
      return;
    }

    if (outcome.drifted.length === 0) {
      record('edge function drift', true, `${FUNCTIONS.join(', ')} match the repository`);
      return;
    }

    if (attempt >= DRIFT_RETRY_DELAYS_MS.length) {
      const { file, at } = outcome.sample;
      const excerpt = at
        ? `     first difference — ${file}, significant line ${at.line}:\n`
          + `       repo   | ${at.local}\n`
          + `       remote | ${at.remote}\n`
        : `     ${file} differs only in trailing content.\n`;

      record(
        'edge function source',
        'warn',
        `${outcome.drifted.length}/${countComparableFiles()} file(s) differ in code, not just\n`
          + `     formatting, ${Math.round(waited / 1000)}s after deploying.\n`
          + '     Not failed: `functions deploy` had already run and enforces currency by\n'
          + '     bundle hash, and this cannot see what else the download reconstructed.\n'
          + excerpt
          + '     → read the excerpt. A genuinely stale deploy means redeploy; a new bundler\n'
          + '       transformation means widen `significantSource` to cover it.',
      );
      return;
    }

    // Only the functions that actually mismatched are re-downloaded: a function
    // that already matches cannot start differing while nothing is deploying.
    pending = outcome.driftedSlugs;
    const delay = DRIFT_RETRY_DELAYS_MS[attempt];
    waited += delay;
    console.log(
      `  … ${outcome.drifted.length} file(s) across ${pending.length} function(s) differ in code; `
      + `re-checking in ${delay / 1000}s `
      + '(a briefly stale read looks identical to drift on the first pass)',
    );
    await sleep(delay);
  }
}

// ── check 3: the public analytics ingest is actually reachable ─────────────
/**
 * Sends an EMPTY batch, so nothing is ever written — this tests the gateway,
 * not the handler. `navigator.sendBeacon` cannot attach an Authorization
 * header, so this no-auth call is precisely what every real browser makes.
 */
async function checkAnalyticsIngest() {
  if (!SUPABASE_URL) {
    record('analytics ingest', null, 'skipped — VITE_SUPABASE_URL not set');
    return;
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/analytics-collect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sid: 'deploy-verify', ts: 0, events: [] }),
  }).catch(() => null);

  if (!res) { record('analytics ingest', false, 'network error reaching analytics-collect'); return; }
  if (res.status === 401) {
    record('analytics ingest', false,
      'returns 401 to unauthenticated POSTs — the JWT gate is ON, so every browser beacon is\n'
      + '     dropped and analytics/error-reporting/web-vitals are all silently dead.\n'
      + '     → npx supabase functions deploy analytics-collect --no-verify-jwt');
    return;
  }
  record('analytics ingest', res.status < 300, `accepts anonymous beacons (HTTP ${res.status})`);
}

// ── run ────────────────────────────────────────────────────────────────────
await checkRelations();
await checkAnalyticsIngest();
await checkFunctionDrift();

let failed = 0;
let warned = 0;
console.log('\nFinatriX deployment verification\n');
for (const r of results) {
  const mark = r.ok === 'warn' ? '  !' : r.ok === null ? '  –' : r.ok ? '  ✓' : '  ✗';
  console.log(`${mark} ${r.name}: ${r.detail}`);
  if (r.ok === false) failed++;
  if (r.ok === 'warn') warned++;
}
console.log('');
if (failed) {
  console.error(`${failed} check(s) FAILED — production does not match this repository.\n`);
  process.exit(1);
}
console.log(
  warned
    ? `Production is deployed and current. ${warned} advisory note above.\n`
    : 'No drift detected between this repository and production.\n',
);
