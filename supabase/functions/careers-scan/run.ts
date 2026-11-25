/**
 * One scan batch: take the employers due next, read each one's own board, keep the postings that sit in the
 * employer's markets, ingest them, and record what happened. Pure orchestration over a Db and a FetchContext,
 * so it runs the same under vitest, Deno and the edge runtime.
 *
 * A complete scan (status ok, nothing truncated) is the board telling us every open job, so an active
 * posting it no longer lists is marked expired. A partial or failed scan expires nothing; the search RPC
 * stops showing a posting that has not been seen for 14 days either way.
 *
 * A board too big for one call is read as a pass over several runs (see ScanPass): each run carries on from the
 * provider's cursor, and the run that reads the last of the board expires what the whole pass did not see.
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
  scan_pass?: unknown;
}

/**
 * A pass over a board too big for one run (career_sources.scan_pass): where the provider paused, the day the pass
 * began (a posting not seen since then has left the board), and whether any run of it saw less than its whole part,
 * in which case the pass expires nothing.
 */
interface ScanPass {
  started_on: string;
  cursor: unknown;
  lossy: boolean;
}

function readPass(raw: unknown): ScanPass | null {
  if (!raw || typeof raw !== 'object') return null;
  const pass = raw as Record<string, unknown>;
  if (typeof pass.started_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(pass.started_on)) return null;
  return { started_on: pass.started_on, cursor: pass.cursor ?? null, lossy: pass.lossy === true };
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
    const asked: unknown = workday.marketOnly;
    // verify-employers.mjs writes `true`: crawl only the employer's own markets.
    if (asked === true) workday.marketOnly = markets.length === 1 ? markets[0] : markets;
    else if (asked !== undefined && !isCareersMarket(asked)) delete workday.marketOnly;
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
  /** In-market postings ingested per employer per run, and the most a resumable board reads per run. Default 800. */
  maxPostingsPerEmployer?: number;
  /** New postings added per run, across employers. Default 250. */
  newPostingBudget?: number;
  now?: () => Date;
  clock?: () => number;
}

/**
 * The edge runtime allows about 2 s of CPU per call, and parsing a board costs CPU in proportion to its size.
 * A run therefore takes small employers together but stops after one large board (see also the new-posting budget); the schedule runs often
 * enough that the registry still cycles in hours (see 20261024000400_careers_scan_every_10_minutes.sql).
 */
const DEFAULT_JOB_BUDGET = 600;

/** A capped scan is reported as truncated, which also means it expires nothing. */
const DEFAULT_MAX_POSTINGS_PER_EMPLOYER = 800;

/**
 * A new posting costs far more CPU than one already stored (its description is fingerprinted, and it is written in
 * full), so a large board's first scan would not fit in one call. Each run adds at most this many; the rest are
 * still new on the board's next scan, which therefore carries on where this one stopped.
 */
const DEFAULT_NEW_POSTING_BUDGET = 250;

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
  const newBudget = options.newPostingBudget ?? DEFAULT_NEW_POSTING_BUDGET;
  const registry = options.registry ?? createRegistry();
  const t0 = clock();
  let fetchedInRun = 0;
  let addedInRun = 0;

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
        .select('id, name, provider, careers_url, api_url, markets, options, scan_pass')
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
    if (clock() - t0 > budgetMs || fetchedInRun >= jobBudget || addedInRun >= newBudget) {
      summary.deferred++;
      continue;
    }
    const today = now();
    const todayISO = toISODate(today);
    const mapped = toEmployerEntry(source);
    const pass = readPass(source.scan_pass);
    // Left undefined, the board's pass is not touched; null ends it.
    let nextPass: ScanPass | null | undefined;
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
        // A slow board stops when the run's time is up rather than outlive the call. One that can resume pauses there
        // (or once it holds a run's worth of postings) and the next run carries on from its cursor.
        const deadline = Date.now() + Math.max(0, budgetMs - (clock() - t0));
        const resume = { cursor: pass?.cursor ?? null, maxJobs: maxPostings };
        const scan = await scanEmployers([mapped.entry], { registry, ctx: { ...ctx, deadline, resume }, concurrency: 1 });
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
        // This run saw less than its part of the board: a pass it belongs to expires nothing.
        const lossy = Boolean(detail.truncation);

        // One unit of work per employer: look every key up at once, ingest in memory, then write in bulk.
        const store = base.forSource(source.id);
        const keys = inMarket.map((job) => ({ listingKey: computeListingKey(job.listingIdentity), postingKey: postingKey(job.url) }));
        await store.prefetch(keys);
        let allowance = newBudget - addedInRun;
        const batch: Job[] = [];
        inMarket.forEach((job, i) => {
          if (store.has(keys[i]!)) batch.push(job);
          else if (allowance > 0) {
            allowance--;
            batch.push(job);
          }
        });
        const leftForLater = batch.length < inMarket.length;
        if (leftForLater) {
          row.status = 'truncated';
          detail = { ...detail, truncation: detail.truncation ?? { reason: 'budget', transient: true } };
        }
        const ingest = await ingestJobs(store, batch, { today, describe: (job) => details.get(job) ?? null, crossListings: false });
        await store.flush();
        row.added = ingest.results.filter((r) => r.disposition !== 'seen' && r.disposition !== 'reactivated').length;
        addedInRun += row.added;
        summary.jobsKept += ingest.results.length;

        if (leftForLater) {
          // The postings left for later are still new on the next read of this part, so the cursor stays put.
          if (pass && lossy && !pass.lossy) nextPass = { ...pass, lossy: true };
        } else if (result.cursor !== undefined) {
          nextPass = { started_on: pass?.started_on ?? todayISO, cursor: result.cursor, lossy: (pass?.lossy ?? false) || lossy };
          row.status = 'truncated';
          detail = { ...detail, truncation: detail.truncation ?? { reason: 'paused', transient: true } };
        } else if (pass) {
          // This run read the rest of the board, so the pass is over.
          nextPass = null;
        }

        // Only after the flush: the database must already know which postings this scan saw.
        if (row.status === 'ok' && !detail.truncation && !pass?.lossy) {
          const unseen = await store.unseenSince(pass?.started_on ?? todayISO);
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
      db
        .from('career_sources')
        .update({ last_scanned_at: now().toISOString(), last_status: row.status, ...(nextPass !== undefined ? { scan_pass: nextPass } : {}) })
        .eq('id', source.id),
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
