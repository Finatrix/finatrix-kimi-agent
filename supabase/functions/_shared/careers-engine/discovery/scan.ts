import type { EmployerEntry, FetchContext, Job, Truncation } from '../types.ts';
import { silentLogger } from '../types.ts';
import type { ProviderRegistry } from './registry.ts';
import type { TitleFilter } from './titleFilter.ts';

export type EmployerStatus = 'ok' | 'truncated' | 'error' | 'no-provider';

export interface EmployerScanResult {
  employer: string;
  registryId?: string;
  provider?: string;
  status: EmployerStatus;
  fetched: number;
  kept: number;
  droppedByTitle: number;
  duplicatesInScan: number;
  truncation?: Truncation;
  /** The provider paused part-way (FetchContext.resume): pass this back to carry on. */
  cursor?: unknown;
  error?: string;
  durationMs: number;
}

export interface ScanOptions {
  registry: ProviderRegistry;
  ctx: FetchContext;
  titleFilter?: TitleFilter;
  /** Employers scanned in parallel. Each provider still paces its own requests. Default 4. */
  concurrency?: number;
  /** Only keep postings newer than this (epoch ms). */
  sinceMs?: number;
  includeUndated?: boolean;
  /** Cap on kept jobs per employer; protects downstream stores from a runaway board. */
  maxJobsPerEmployer?: number;
  now?: () => number;
  onEmployerDone?: (result: EmployerScanResult) => void;
}

export interface ScanResult {
  jobs: Job[];
  employers: EmployerScanResult[];
  startedAt: number;
  finishedAt: number;
}

async function pool<T, R>(items: T[], size: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]!, i);
    }
  });
  await Promise.all(lanes);
  return results;
}

/**
 * Scan employers with per-entry failure isolation: one broken board never aborts the run,
 * and every outcome (including partial coverage) is returned as data.
 */
export async function scanEmployers(entries: EmployerEntry[], options: ScanOptions): Promise<ScanResult> {
  const now = options.now ?? Date.now;
  const log = options.ctx.log ?? silentLogger;
  const startedAt = now();
  const maxPer = options.maxJobsPerEmployer ?? 5_000;
  const filter = options.titleFilter;

  const ctx: FetchContext = {
    ...options.ctx,
    ...(options.sinceMs !== undefined ? { sinceMs: options.sinceMs } : {}),
    ...(options.includeUndated !== undefined ? { includeUndated: options.includeUndated } : {}),
    ...(filter ? { titleWanted: (t: string) => filter.test(t) } : {}),
  };

  const perEmployer = await pool(entries, options.concurrency ?? 4, async (entry) => {
    const t0 = now();
    const base = (): EmployerScanResult => ({
      employer: entry.name,
      ...(entry.registryId ? { registryId: entry.registryId } : {}),
      status: 'ok',
      fetched: 0,
      kept: 0,
      droppedByTitle: 0,
      duplicatesInScan: 0,
      durationMs: now() - t0,
    });
    const finish = (r: EmployerScanResult, jobs: Job[]) => {
      r.durationMs = now() - t0;
      options.onEmployerDone?.(r);
      return { result: r, jobs };
    };

    const resolved = options.registry.resolve(entry);
    if (!resolved) {
      return finish({ ...base(), status: 'no-provider', error: 'no provider matched this entry' }, []);
    }
    if ('error' in resolved) {
      return finish({ ...base(), status: 'error', error: resolved.error }, []);
    }
    const provider = resolved.provider;
    const result: EmployerScanResult = { ...base(), provider: provider.id };

    try {
      const fetched = await provider.fetch(entry, ctx);
      result.fetched = fetched.jobs.length;
      if (fetched.truncation) {
        result.truncation = fetched.truncation;
        result.status = 'truncated';
      }
      if (fetched.cursor !== undefined) result.cursor = fetched.cursor;
      const seen = new Set<string>();
      const kept: Job[] = [];
      for (const job of fetched.jobs) {
        if (filter && !filter.test(job.title)) {
          result.droppedByTitle++;
          continue;
        }
        const key = provider.dedupKey?.(job) ?? job.url;
        if (seen.has(key)) {
          result.duplicatesInScan++;
          continue;
        }
        seen.add(key);
        kept.push({ ...job, source: provider.id });
        if (kept.length >= maxPer) {
          result.truncation ??= { reason: 'cap', transient: false, detail: `maxJobsPerEmployer=${maxPer}` };
          result.status = 'truncated';
          break;
        }
      }
      result.kept = kept.length;
      return finish(result, kept);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`scan ${entry.name} (${provider.id}) failed: ${message}`);
      result.status = 'error';
      result.error = message;
      return finish(result, []);
    }
  });

  return {
    jobs: perEmployer.flatMap((p) => p.jobs),
    employers: perEmployer.map((p) => p.result),
    startedAt,
    finishedAt: now(),
  };
}
