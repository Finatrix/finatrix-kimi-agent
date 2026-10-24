/**
 * One scan batch: take the employers due next, read each one's own board, keep the postings that sit in the
 * employer's markets, ingest them, and record what happened. Pure orchestration over a Db and a FetchContext,
 * so it runs the same under vitest, Deno and the edge runtime.
 *
 * A complete scan (status ok, nothing truncated) is the board telling us every open job, so an active
 * posting it no longer lists is marked expired. A partial or failed scan expires nothing; the search RPC
 * stops showing a posting that has not been seen for 14 days either way.
 */
import { describePosting } from '../_shared/careers-engine/describe.ts';
import { createRegistry, scanEmployers, type EmployerStatus, type ProviderRegistry } from '../_shared/careers-engine/discovery/index.ts';
import { isCareersMarket, type CareersMarket } from '../_shared/careers-engine/markets/index.ts';
import type { EmployerEntry, FetchContext, Job } from '../_shared/careers-engine/types.ts';
import { toISODate } from '../_shared/careers-engine/util/text.ts';
import { applyLivenessVerdicts, ingestJobs, type PostingDetails } from '../_shared/careers-engine/verification/ingest.ts';
import { computeListingKey } from '../_shared/careers-engine/verification/listingKey.ts';
import { postingKey } from '../_shared/careers-engine/verification/urlKey.ts';
import { SupabasePostingStore, type Db } from './store.ts';

export interface SourceRow {
  id: string;
  name: string;
  provider: string | null;
  careers_url: string;
  api_url: string | null;
  markets: string[] | null;
  options: Record<string, unknown> | null;
}

/** Provider options a source row may carry; anything else in `options` is ignored. */
const OPTION_KEYS = ['workday', 'ashby', 'smartrecruiters', 'siteNumber', 'locationId', 'max_pages', 'aggregator'] as const;

const WORKDAY_HOST_RE = /\.myworkday(?:jobs|site)\.com$/i;

function isWorkday(entry: EmployerEntry): boolean {
  if (entry.provider) return entry.provider === 'workday';
  try {
    return WORKDAY_HOST_RE.test(new URL(entry.careers_url ?? '').hostname);
  } catch {
    return false;
  }
}

export function toEmployerEntry(source: SourceRow): { entry: EmployerEntry; markets: CareersMarket[] } | null {
  const markets = (source.markets ?? []).filter(isCareersMarket);
  if (markets.length === 0) return null;
  const options = source.options ?? {};
  const entry: EmployerEntry = { name: source.name, careers_url: source.careers_url, registryId: source.id };
  if (source.provider) entry.provider = source.provider;
  if (source.api_url) entry.api = source.api_url;
  for (const key of OPTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(options, key)) (entry as unknown as Record<string, unknown>)[key] = options[key];
  }
  if (isWorkday(entry)) {
    const workday = { ...(entry.workday ?? {}) };
    if (workday.marketOnly && !isCareersMarket(workday.marketOnly)) delete workday.marketOnly;
    // A single-market employer crawls only that market's slice of a multinational board.
    if (!workday.marketOnly && markets.length === 1) workday.marketOnly = markets[0];
    entry.workday = workday;
  }
  return { entry, markets };
}

/** Constant-time comparison of the caller's secret with the configured one. Short secrets never authorize. */
export function isAuthorized(given: string | null | undefined, secret: string | null | undefined): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(given ?? '');
  const b = enc.encode(secret ?? '');
  if (b.length < 32 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export interface EmployerSummary {
  name: string;
  status: EmployerStatus;
  fetched: number;
  inMarket: number;
  added: number;
  expired: number;
  error?: string;
}

export interface ScanBatchSummary {
  runId: string | null;
  employers: EmployerSummary[];
  jobsKept: number;
  /** Due employers left for the next run because the time budget ran out. */
  deferred: number;
}

export interface ScanBatchOptions {
  db: Db;
  ctx: FetchContext;
  registry?: ProviderRegistry;
  /** Employers taken per run. Default 8. */
  batchSize?: number;
  /** Stop starting new employers after this many ms. Default 110 s, under the edge wall-clock limit. */
  budgetMs?: number;
  /** Stop starting new employers once this many jobs have been fetched in the run. Default 600. */
  jobBudget?: number;
  /** In-market postings ingested per employer per run. Default 800. */
  maxPostingsPerEmployer?: number;
  now?: () => Date;
  clock?: () => number;
}

/**
 * The edge runtime allows about 2 s of CPU per call, and parsing a board costs CPU in proportion to its size.
 * A run therefore takes small employers together but stops after one large board; the schedule runs often
 * enough that the registry still cycles in hours (see 20261024000400_careers_scan_every_10_minutes.sql).
 */
const DEFAULT_JOB_BUDGET = 600;

/** A capped scan is reported as truncated, which also means it expires nothing. */
const DEFAULT_MAX_POSTINGS_PER_EMPLOYER = 800;

/** A run still open after this long was stopped by the runtime; the next run closes it with a note. */
const STALE_RUN_MS = 10 * 60_000;

function check<T>(what: string, result: { data: T | null; error: { message: string } | null }): T | null {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

async function bestEffort(ctx: FetchContext, what: string, query: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  try {
    const { error } = await query;
    if (error) ctx.log.warn(`careers-scan: ${what} failed: ${error.message}`);
  } catch (err) {
    ctx.log.warn(`careers-scan: ${what} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function runScanBatch(options: ScanBatchOptions): Promise<ScanBatchSummary> {
  const { db, ctx } = options;
  const now = options.now ?? (() => new Date());
  const clock = options.clock ?? Date.now;
  const budgetMs = options.budgetMs ?? 110_000;
  const jobBudget = options.jobBudget ?? DEFAULT_JOB_BUDGET;
  const maxPostings = options.maxPostingsPerEmployer ?? DEFAULT_MAX_POSTINGS_PER_EMPLOYER;
  const registry = options.registry ?? createRegistry();
  const t0 = clock();
  let fetchedInRun = 0;

  await bestEffort(
    ctx,
    'close stopped runs',
    db
      .from('scan_runs')
      .update({ finished_at: now().toISOString(), notes: 'did not finish: stopped by the edge runtime' })
      .is('finished_at', null)
      .lt('started_at', new Date(now().getTime() - STALE_RUN_MS).toISOString()),
  );

  const sources =
    (check(
      'load due employers',
      await db
        .from('career_sources')
        .select('id, name, provider, careers_url, api_url, markets, options')
        .eq('enabled', true)
        .order('last_scanned_at', { ascending: true, nullsFirst: true })
        .limit(options.batchSize ?? 8),
    ) as SourceRow[] | null) ?? [];

  const startedAt = now();
  const runRows = check(
    'open scan run',
    await db.from('scan_runs').insert({ started_at: startedAt.toISOString(), employers: 0, jobs_kept: 0 }).select('id'),
  ) as Array<{ id: string }> | null;
  const runId = runRows?.[0]?.id ?? null;

  const summary: ScanBatchSummary = { runId, employers: [], jobsKept: 0, deferred: 0 };
  const base = new SupabasePostingStore(db);

  for (const source of sources) {
    if (clock() - t0 > budgetMs || fetchedInRun >= jobBudget) {
      summary.deferred++;
      continue;
    }
    const today = now();
    const todayISO = toISODate(today);
    const mapped = toEmployerEntry(source);
    const row: EmployerSummary = { name: source.name, status: 'error', fetched: 0, inMarket: 0, added: 0, expired: 0 };
    let detail: { provider?: string; kept: number; droppedByTitle: number; duplicatesInScan: number; truncation?: { reason: string; transient: boolean }; durationMs: number } = {
      kept: 0,
      droppedByTitle: 0,
      duplicatesInScan: 0,
      durationMs: 0,
    };

    // Claim the employer before the slow part. If the edge runtime kills this call mid-ingest, the next run
    // moves on to the next employer instead of retrying this one first, forever.
    await bestEffort(ctx, 'claim employer', db.from('career_sources').update({ last_scanned_at: now().toISOString(), last_status: 'running' }).eq('id', source.id));

    if (!mapped) {
      row.error = 'source has no supported market';
    } else {
      try {
        const scan = await scanEmployers([mapped.entry], { registry, ctx, concurrency: 1 });
        const result = scan.employers[0]!;
        detail = result;
        row.status = result.status;
        row.fetched = result.fetched;
        fetchedInRun += result.fetched;
        if (result.error) row.error = result.error;

        // Read each job through the market layer once; the reading both filters and is what ingest stores.
        const details = new Map<Job, PostingDetails>();
        for (const job of scan.jobs) {
          const d = describePosting(job, mapped.markets);
          if (d) details.set(job, d);
        }
        let inMarket = [...details.keys()];
        row.inMarket = inMarket.length;
        if (inMarket.length > maxPostings) {
          inMarket = inMarket.slice(0, maxPostings);
          row.status = 'truncated';
          detail = { ...detail, truncation: { reason: 'cap', transient: false } };
        }

        // One unit of work per employer: look every key up at once, ingest in memory, then write in bulk.
        const store = base.forSource(source.id);
        await store.prefetch(inMarket.map((job) => ({ listingKey: computeListingKey(job.listingIdentity), postingKey: postingKey(job.url) })));
        const ingest = await ingestJobs(store, inMarket, { today, describe: (job) => details.get(job) ?? null, crossListings: false });
        await store.flush();
        row.added = ingest.results.filter((r) => r.disposition !== 'seen' && r.disposition !== 'reactivated').length;
        summary.jobsKept += ingest.results.length;

        // Only after the flush: the database must already know which postings this scan saw.
        if (row.status === 'ok' && !detail.truncation) {
          const unseen = await store.unseenSince(todayISO);
          if (unseen.length > 0) {
            const tally = await applyLivenessVerdicts(
              store,
              unseen.map((id) => ({ id, result: 'expired' as const, reason: 'absent from a complete board scan' })),
              today,
            );
            await store.flush();
            row.expired = tally.expired;
          }
        }
      } catch (err) {
        row.status = 'error';
        row.error = err instanceof Error ? err.message : String(err);
        ctx.log.warn(`careers-scan: ${source.name} failed: ${row.error}`);
      }
    }

    // History is best-effort: a failed write is logged and the batch carries on to the next employer.
    if (runId) {
      await bestEffort(
        ctx,
        'record employer result',
        db.from('scan_run_employers').insert({
          run_id: runId,
          source_id: source.id,
          employer: source.name,
          provider: detail.provider ?? null,
          status: row.status,
          fetched: row.fetched,
          kept: detail.kept,
          in_market: row.inMarket,
          dropped_by_title: detail.droppedByTitle,
          duplicates_in_scan: detail.duplicatesInScan,
          truncation_reason: detail.truncation?.reason ?? null,
          truncation_transient: detail.truncation?.transient ?? null,
          error: row.error?.slice(0, 500) ?? null,
          duration_ms: Math.max(0, Math.round(detail.durationMs)),
        }),
      );
    }
    await bestEffort(
      ctx,
      'mark employer scanned',
      db.from('career_sources').update({ last_scanned_at: now().toISOString(), last_status: row.status }).eq('id', source.id),
    );
    summary.employers.push(row);
  }

  if (runId) {
    check(
      'close scan run',
      await db
        .from('scan_runs')
        .update({
          finished_at: now().toISOString(),
          employers: summary.employers.length,
          jobs_kept: summary.jobsKept,
          ...(summary.deferred ? { notes: `${summary.deferred} employer(s) deferred to the next run` } : {}),
        })
        .eq('id', runId),
    );
  }
  return summary;
}
