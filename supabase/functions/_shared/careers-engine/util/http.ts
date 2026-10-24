import { assertSafeHttpsUrl } from './safeUrl.ts';
import {
  silentLogger,
  type FetchContext,
  type Logger,
  type RequestOptions,
  type RetryPolicy,
} from '../types.ts';

export const DEFAULT_USER_AGENT = 'FinatriXCareersBot/0.1 (+https://finatrix.co; employer-attributed job discovery)';

export const DEFAULT_RETRY: RetryPolicy = { retries: 2, baseDelayMs: 500, maxDelayMs: 8_000, jitterMs: 250 };

export class HttpError extends Error {
  status: number;
  body: string;
  retryAfter: string | null;
  location: string | null;
  attempts: number;
  constructor(status: number, statusText: string, body = '', retryAfter: string | null = null, location: string | null = null) {
    super(`HTTP ${status}${statusText ? ` ${statusText}` : ''}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
    this.retryAfter = retryAfter;
    this.location = location;
    this.attempts = 1;
  }
}

/** True when `fetch(..., {redirect:'error'})` refused a redirect. */
export function isRefusedRedirectError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cause = (err as Error & { cause?: unknown }).cause;
  const causeMessage = cause instanceof Error ? cause.message : '';
  return /redirect/i.test(`${err.message} ${causeMessage}`);
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 408 || err.status === 425 || err.status === 429 || err.status >= 500;
  if (isRefusedRedirectError(err)) return false;
  // Network failures / timeouts surface as TypeError('fetch failed') or AbortError.
  return err instanceof TypeError || (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'));
}

/** Parse a Retry-After header (delta-seconds or HTTP date) to milliseconds. */
export function parseRetryAfterMs(value: string | null | undefined, now = Date.now()): number | null {
  if (value == null || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

export interface FetchContextOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  log?: Logger;
  /** Give up immediately when a server asks to wait longer than this. */
  giveUpRetryAfterMs?: number;
  /** Extra context fields (maxPages, sinceMs, …) copied onto the context. */
  overrides?: Partial<FetchContext>;
}

async function once(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestOptions,
  defaults: { timeoutMs: number; userAgent: string },
): Promise<Response> {
  assertSafeHttpsUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? defaults.timeoutMs);
  try {
    const headers = new Headers(init.headers ?? {});
    if (!headers.has('user-agent')) headers.set('user-agent', defaults.userAgent);
    const res = await fetchImpl(url, {
      method: init.method ?? 'GET',
      headers,
      body: init.body ?? null,
      redirect: init.redirect ?? 'error',
      signal: controller.signal,
    });
    const inspectable = init.redirect === 'manual' && res.status >= 300 && res.status < 400;
    if (!res.ok && !inspectable) {
      const body = await res.text().catch(() => '');
      throw new HttpError(res.status, res.statusText, body, res.headers.get('retry-after'), res.headers.get('location'));
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * HTTP context used by every provider: HTTPS-only, redirects refused by default,
 * bounded retries with exponential backoff + jitter, Retry-After honoured.
 */
export function createFetchContext(options: FetchContextOptions = {}): FetchContext {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = options.random ?? Math.random;
  const giveUp = options.giveUpRetryAfterMs ?? 30_000;
  const log = options.log ?? silentLogger;

  async function withRetry<T>(
    url: string,
    init: RequestOptions,
    policy: Partial<RetryPolicy> | undefined,
    consume: (res: Response) => Promise<T>,
  ): Promise<T> {
    const p: RetryPolicy = { ...DEFAULT_RETRY, ...policy };
    let lastErr: unknown;
    for (let attempt = 0; attempt <= p.retries; attempt++) {
      try {
        return await consume(await once(fetchImpl, url, init, { timeoutMs, userAgent }));
      } catch (err) {
        lastErr = err;
        if (err instanceof HttpError) err.attempts = attempt + 1;
        if (attempt === p.retries || !isRetryableError(err)) {
          if (err instanceof Error && !(err instanceof HttpError)) (err as Error & { attempts?: number }).attempts = attempt + 1;
          throw err;
        }
        const retryAfterMs = err instanceof HttpError ? parseRetryAfterMs(err.retryAfter) : null;
        if (retryAfterMs !== null && retryAfterMs > giveUp) throw err;
        const backoff = Math.min(p.baseDelayMs * 2 ** attempt, p.maxDelayMs);
        await sleep(retryAfterMs ?? backoff + random() * p.jitterMs);
      }
    }
    throw lastErr;
  }

  return {
    log,
    sleep,
    fetchJson: <T>(url: string, init: RequestOptions = {}, policy?: Partial<RetryPolicy>) =>
      withRetry<T>(url, init, policy, (res) => res.json() as Promise<T>),
    fetchText: (url: string, init: RequestOptions = {}, policy?: Partial<RetryPolicy>) =>
      withRetry<string>(url, init, policy, (res) => res.text()),
    ...options.overrides,
  } as FetchContext;
}
