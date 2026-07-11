/**
 * Careers error model. Every failure surfaced to the UI goes through
 * CareersError so users always see a clean, actionable message — never a raw
 * exception — and the pipeline can decide what is retryable.
 */

export type CareersErrorCode =
  | 'validation'      // bad file (type/size/encrypted/empty…) — not retryable
  | 'extraction'      // could not read text out of the file — not retryable
  | 'upload'          // storage upload failed — retryable
  | 'storage'         // storage read/delete failed — retryable
  | 'database'        // supabase table error — retryable
  | 'not-setup'       // careers tables/bucket missing — needs setup, not retryable
  | 'ai'              // AI call failed — retryable
  | 'ai-limit'        // daily AI limit reached — retry tomorrow
  | 'ai-response'     // AI answered with something unusable — retryable
  | 'network'         // offline / fetch failed — retryable
  | 'rate-limit'      // too many requests — retry after a short wait
  | 'backend'         // provider backend / edge function error — retryable
  | 'auth'            // signed out mid-flight
  | 'unknown';

const RETRYABLE: ReadonlySet<CareersErrorCode> = new Set([
  'upload', 'storage', 'database', 'ai', 'ai-response', 'network', 'rate-limit', 'backend', 'unknown',
]);

export class CareersError extends Error {
  readonly code: CareersErrorCode;
  readonly retryable: boolean;
  /** Set by the pipeline when a persisted version exists, so a retry can resume it. */
  versionId?: string;
  resumeId?: string;

  constructor(code: CareersErrorCode, message: string) {
    super(message);
    this.name = 'CareersError';
    this.code = code;
    this.retryable = RETRYABLE.has(code);
  }
}

/** Wrap anything thrown into a CareersError with a friendly message. */
export function toCareersError(e: unknown, fallback = 'Something went wrong. Please try again.'): CareersError {
  if (e instanceof CareersError) return e;
  const msg = e instanceof Error ? e.message : '';
  if (/failed to fetch|network|load failed|offline/i.test(msg)) {
    return new CareersError('network', 'You appear to be offline. Check your connection and try again.');
  }
  return new CareersError('unknown', fallback);
}

/**
 * Map a Supabase/PostgREST error to a CareersError. Detects the "schema not
 * installed yet" case so the UI can point at supabase/careers_schema.sql
 * instead of showing a cryptic relation error.
 */
export function mapSupabaseError(
  error: { code?: string; message?: string } | null,
  context: string
): CareersError {
  const code = error?.code ?? '';
  const msg = error?.message ?? '';
  if (code === '42P01' || code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(msg)) {
    return new CareersError(
      'not-setup',
      'The Careers backend is not set up yet. Run supabase/careers_schema.sql in your Supabase SQL editor (see SETUP.md §5).'
    );
  }
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return new CareersError('auth', 'You do not have access to this data. Try signing in again.');
  }
  if (/bucket.*not found/i.test(msg)) {
    return new CareersError(
      'not-setup',
      'The resume storage bucket is missing. Run supabase/careers_schema.sql in your Supabase SQL editor (see SETUP.md §5).'
    );
  }
  return new CareersError('database', `${context} failed. Please try again.`);
}

/** Small awaitable delay used by retry loops. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run an async operation with exponential backoff. Only retries errors that
 * are marked retryable; validation/setup errors fail fast.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 600 }: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let last: CareersError | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = toCareersError(e);
      if (!last.retryable || i === attempts - 1) throw last;
      await sleep(baseDelayMs * 2 ** i);
    }
  }
  // Unreachable, but keeps TypeScript satisfied.
  throw last ?? new CareersError('unknown', 'Something went wrong.');
}
