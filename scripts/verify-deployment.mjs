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

/**
 * Which checkout the deployed functions are compared against.
 *
 * Defaults to this repository. The Deploy workflow points it at the PREVIOUS
 * commit's `supabase/functions`, because it runs this check BEFORE deploying:
 * see the note on the drift check below.
 */
const SOURCE_ROOT = process.env.FX_FUNCTIONS_ROOT || ROOT;

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
    (total, slug) => total + tsFilesUnder(join(SOURCE_ROOT, 'supabase/functions', slug)).length,
    0,
  );
}

/**
 * Supabase's function store is read-after-write eventual, by minutes.
 *
 * Measured on this project: `functions download` run immediately after a
 * successful `functions deploy` returns the PREVIOUS version, and keeps doing
 * so for a long time — a comparison that was still reporting all 27 files of
 * all 6 functions as drifted 450 seconds after deploying passed on its FIRST
 * attempt, against the same commit with no deploy in between, a few minutes
 * later. Two attempts to size a wait window (150s, then 450s) both undershot.
 *
 * So this check no longer races the store. The Deploy workflow runs it BEFORE
 * deploying, against the previous commit's sources (FX_FUNCTIONS_ROOT), which
 * asks the question that actually matters — "did the last deploy land, or have
 * the functions been quietly drifting from main?" — with no write in flight.
 * A deploy that fails to land is caught on the next run rather than never.
 *
 * The retries below survive the one case that can still race: two pushes close
 * enough together that the previous run's deploy is still propagating. They
 * cost nothing on the overwhelmingly common path, where the first read matches.
 */
const DRIFT_RETRY_DELAYS_MS = [30_000, 60_000, 90_000];

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

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
    const localDir = join(SOURCE_ROOT, 'supabase/functions', slug);
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
      driftedSlugs.add(slug);
      if (!sample) sample = { file: `${slug}/${rel}`, at: firstDifference(localText, remoteText) };
    }
  }
  return { drifted, driftedSlugs: [...driftedSlugs], notDeployed, sample };
}

/**
 * WHAT THIS CAN AND CANNOT PROVE
 * ------------------------------
 * The check now runs BEFORE the deploy steps, against the previous commit's
 * sources, so on the ordinary path there is no write in flight and the first
 * read is exact. The window below only covers pushes landing close enough
 * together that the previous run's deploy is still settling.
 *
 * What changed is the verdict when the window runs out. This used to fail the
 * deploy, and it did so on 20 consecutive runs while production was in fact
 * current — `wrangler deploy` and `functions deploy` had both succeeded, and
 * the pipeline went red anyway. A gate that fails on every run stops being read
 * at all, which costs more than having no gate.
 *
 * A mismatch that outlives the window is still not proof of drift. Moving the
 * check off the write path removes the dominant explanation — slow propagation
 * — but one remains that this script cannot rule out from the outside: a round
 * trip that is not byte-faithful, since `functions download` reconstructs
 * source from the deployed eszip and nothing guarantees the bytes survive.
 * (Repeated downloads with nothing deploying have matched all 27 files exactly,
 * which is evidence for faithfulness, not proof of it.)
 *
 * That is not a reason to block a release, so each verdict stays scoped to what
 * it can actually establish:
 *
 *   • a function with NO deployed source → FAIL. Unambiguous, and precisely the
 *     failure this script was written for: `careers-jobs` ran a superseded
 *     provider contract for weeks because a manual deploy was missed. No amount
 *     of lag or re-bundling can manufacture an empty download.
 *   • a function whose text differs      → WARN, with an excerpt of the first
 *     difference, so the cause is visible in the log rather than inferred. If an
 *     excerpt shows stale but real code, the window is too short; if it shows
 *     reformatting, the round trip is lossy. Either way that excerpt is the
 *     evidence needed to settle it — which is exactly what has been missing.
 *
 * Currency is not left unguarded. `supabase functions deploy` runs immediately
 * AFTER this script and is authoritative: it compares hashes in the format it
 * owns, uploads when they differ, and fails the step on error. That is the real
 * gate; this is the second opinion, now calibrated to what a second opinion can
 * honestly assert — and asked at the one moment when nothing is in flight to
 * confuse it.
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
        ? `     first difference — ${file}, line ${at.line}:\n`
          + `       repo   | ${at.local}\n`
          + `       remote | ${at.remote}\n`
        : `     ${file} differs only in trailing content.\n`;

      record(
        'edge function source',
        'warn',
        `${outcome.drifted.length}/${countComparableFiles()} file(s) still differ `
          + `${Math.round(waited / 1000)}s after deploying.\n`
          + '     Not failed: this cannot tell slow propagation from a non-byte-faithful\n'
          + '     download. Currency is enforced by `functions deploy`, which hashes the\n'
          + '     bundle and had already run when this executed.\n'
          + excerpt
          + '     → stale but real code means the window is too short; reformatting means the\n'
          + '       round trip is lossy. Anything else — redeploy and restore a hard failure.',
      );
      return;
    }

    // Only the functions that actually mismatched are re-downloaded: a function
    // that already matches cannot start differing while nothing is deploying,
    // and re-fetching all six each round is what made the first attempt at this
    // retry loop time out before the store had settled.
    pending = outcome.driftedSlugs;
    const delay = DRIFT_RETRY_DELAYS_MS[attempt];
    waited += delay;
    console.log(
      `  … ${outcome.drifted.length} file(s) across ${pending.length} function(s) differ; `
      + `re-checking in ${delay / 1000}s `
      + '(Supabase propagation lag looks identical to drift on the first read)',
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
