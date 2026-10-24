/**
 * careers-scan — scheduled direct-from-employer job discovery.
 *
 * Called by pg_cron through pg_net (supabase/migrations/20261024000300_schedule_careers_scan.sql), never by a
 * browser. Deployed with --no-verify-jwt because the caller is the database, not a signed-in user; the
 * function authorises the call itself with the CAREERS_SCAN_SECRET shared secret, compared in constant time.
 *
 * Each call scans a small batch of employers (see run.ts) and returns a summary of what it read.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createFetchContext } from '../_shared/careers-engine/util/http.ts';
import { isAuthorized, runScanBatch } from './run.ts';
import type { Db } from './store.ts';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  if (!isAuthorized(req.headers.get('x-scan-secret'), Deno.env.get('CAREERS_SCAN_SECRET'))) {
    return json(401, { error: 'unauthorized' });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as Db;
  const log = { info: (m: string) => console.log(m), warn: (m: string) => console.warn(m) };

  try {
    const summary = await runScanBatch({ db, ctx: createFetchContext({ log }) });
    console.log(
      `careers-scan: run ${summary.runId} scanned ${summary.employers.length}, kept ${summary.jobsKept}, deferred ${summary.deferred}`,
    );
    return json(200, summary);
  } catch (err) {
    console.error('careers-scan failed:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'scan failed' });
  }
});
