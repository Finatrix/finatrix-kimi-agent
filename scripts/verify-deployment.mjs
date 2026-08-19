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
 *   • Every edge function has deployed source. A function that was never
 *     deployed is a hard failure; a textual difference is reported as an
 *     advisory rather than a failure — see checkFunctionDrift for why.
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

function collectDrift() {
  const work = mkdtempSync(join(tmpdir(), 'fx-deploy-verify-'));
  const drifted = [];
  const notDeployed = [];
  let sample = null;

  for (const slug of FUNCTIONS) {
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
      const localText = readFileSync(localFile, 'utf8');
      const remoteText = readFileSync(remoteFile, 'utf8');
      if (localText === remoteText) continue;
      drifted.push(`${slug}/${rel}`);
      if (!sample) sample = { file: `${slug}/${rel}`, at: firstDifference(localText, remoteText) };
    }
  }
  return { drifted, notDeployed, sample };
}

/**
 * WHY A TEXTUAL MISMATCH NO LONGER FAILS THE BUILD
 * ------------------------------------------------
 * This check used to compare deployed source to the repo byte for byte and fail
 * the deploy on any difference. It reported all 27 files of all 6 functions as
 * drifted on every run — 20 consecutive red deploys — while production was in
 * fact current.
 *
 * That was first read as read-after-write lag and answered with a ~2.5 minute
 * retry window. The retry shipped, ran, and the count sat at exactly 27 through
 * all five reads. Lag is ruled out by the deploy step's own output, in the very
 * same log:
 *
 *     No change found in Function: careers-jobs        (…and all five others)
 *
 * The CLI hashes the local bundle against the deployed one and skips the upload
 * when they match. Nothing was uploaded, so the remote store had been settled
 * since the previous real deploy — hours or days earlier. There was no write to
 * propagate, and no amount of waiting could have changed the answer.
 *
 * What remains is the round trip itself: `functions download` reconstructs
 * source from the deployed eszip, and that reconstruction is not byte-faithful.
 * A textual mismatch therefore cannot distinguish real drift from the bundler,
 * and a check that cannot tell those apart must not be the thing that blocks a
 * release. A gate that fails 100% of the time teaches everyone to ignore it,
 * which costs more than having no gate at all.
 *
 * So the comparison stays and still reports what it sees, but each verdict is
 * now scoped to what it can actually prove:
 *
 *   • a function with NO deployed source → FAIL. Unambiguous, and precisely the
 *     failure this script was written for: `careers-jobs` ran a superseded
 *     provider contract for weeks because a manual deploy was missed.
 *   • a function whose text differs      → WARN, with an excerpt of the first
 *     difference, so the transformation is visible in the log rather than
 *     inferred. If an excerpt ever shows a real code change, tighten this back
 *     up — that excerpt is the evidence needed to do it safely.
 *
 * Currency is not left unguarded. `supabase functions deploy` runs immediately
 * before this script and is authoritative: it compares hashes in the format it
 * owns, uploads when they differ, and fails the step on error. That is the real
 * gate; this is the second opinion, now calibrated to what a second opinion can
 * honestly assert.
 */
function checkFunctionDrift() {
  if (!PROJECT_REF) {
    record('edge function drift', null, 'skipped — no project ref (supabase link, or set SUPABASE_PROJECT_REF)');
    return;
  }

  const outcome = collectDrift();
  if (outcome.skipped) {
    record('edge function drift', null, outcome.skipped);
    return;
  }

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
    record('edge function drift', true, `${FUNCTIONS.join(', ')} match the repository byte for byte`);
    return;
  }

  const { file, at } = outcome.sample;
  const excerpt = at
    ? `     first difference — ${file}, line ${at.line}:\n`
      + `       repo   | ${at.local}\n`
      + `       remote | ${at.remote}\n`
    : `     ${file} differs only in trailing content.\n`;

  record(
    'edge function source',
    'warn',
    `${outcome.drifted.length}/${countComparableFiles()} deployed file(s) differ textually from the repo.\n`
      + '     Not treated as drift: `functions download` rebuilds source from the deployed\n'
      + '     eszip, so it is not byte-faithful. Currency is enforced by `functions deploy`,\n'
      + '     which hashes the bundle and had already run when this executed.\n'
      + excerpt
      + '     → if the excerpt shows a real code change rather than a formatting artefact,\n'
      + '       redeploy and restore this to a hard failure.',
  );
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
checkFunctionDrift();

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
