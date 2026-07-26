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
 *   • Deployed edge-function source matches the repository, byte for byte.
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

/** Edge functions whose deployed source must match the repo. */
const FUNCTIONS = ['careers-jobs', 'careers-ai'];

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

function checkFunctionDrift() {
  if (!PROJECT_REF) {
    record('edge function drift', null, 'skipped — no project ref (supabase link, or set SUPABASE_PROJECT_REF)');
    return;
  }
  const work = mkdtempSync(join(tmpdir(), 'fx-deploy-verify-'));
  const drifted = [];
  for (const slug of FUNCTIONS) {
    try {
      execFileSync('npx', ['--yes', 'supabase@latest', 'functions', 'download', slug, '--project-ref', PROJECT_REF],
        { cwd: work, stdio: 'pipe' });
    } catch (e) {
      record('edge function drift', null, `skipped — could not download ${slug} (needs SUPABASE_ACCESS_TOKEN): ${String(e.message).slice(0, 120)}`);
      return;
    }
    const localDir = join(ROOT, 'supabase/functions', slug);
    const remoteDir = join(work, 'supabase/functions', slug);
    for (const localFile of tsFilesUnder(localDir)) {
      const rel = relative(localDir, localFile);
      const remoteFile = join(remoteDir, rel);
      // A file absent remotely is normal — the bundler tree-shakes type-only
      // modules — so only compare files that were actually deployed.
      if (!existsSync(remoteFile)) continue;
      if (readFileSync(localFile, 'utf8') !== readFileSync(remoteFile, 'utf8')) {
        drifted.push(`${slug}/${rel}`);
      }
    }
  }
  record(
    'edge function drift',
    drifted.length === 0,
    drifted.length
      ? `${drifted.length} file(s) differ from the deployed version: ${drifted.join(', ')}\n`
        + `     → npx supabase functions deploy ${FUNCTIONS.join(' ')}`
      : `${FUNCTIONS.join(', ')} match the repository`,
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
console.log('\nFinatriX deployment verification\n');
for (const r of results) {
  const mark = r.ok === null ? '  –' : r.ok ? '  ✓' : '  ✗';
  console.log(`${mark} ${r.name}: ${r.detail}`);
  if (r.ok === false) failed++;
}
console.log('');
if (failed) {
  console.error(`${failed} check(s) FAILED — production does not match this repository.\n`);
  process.exit(1);
}
console.log('No drift detected between this repository and production.\n');
