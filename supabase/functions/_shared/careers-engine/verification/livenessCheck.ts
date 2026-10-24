/**
 * Live liveness checking: provider API first (cheap, authoritative), then plain HTTP, then an
 * optional injected browser renderer. Network access is injectable so every path is testable.
 * API planning is derived from career-ops liveness-api.mjs (MIT, see NOTICE).
 */
import type { ListingIdentity } from '../types.ts';
import { DEFAULT_USER_AGENT } from '../util/http.ts';
import { htmlToText } from '../util/html.ts';
import { assertSafeHttpsUrl } from '../util/safeUrl.ts';
import { classifyLiveness, type LivenessVerdict } from './liveness.ts';

export type CheckVia = 'api' | 'http' | 'renderer';

export interface CheckedLiveness extends LivenessVerdict {
  via: CheckVia;
  url: string;
  checkedAt: string;
  httpStatus?: number;
  finalUrl?: string;
}

export interface PageSnapshot {
  status: number;
  finalUrl: string;
  bodyText: string;
  applyControls: string[];
}
/** Supply a headless-browser implementation (e.g. Playwright) for JS-rendered career sites. */
export type PageRenderer = (url: string) => Promise<PageSnapshot>;

export interface LivenessCheckOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
  now?: () => Date;
  /** Skip the provider-API rung. */
  skipApi?: boolean;
  /** Used only when plain HTTP is inconclusive. */
  renderer?: PageRenderer;
  /** Ashby serves a whole board per call; share it across postings. */
  boardCache?: Map<string, unknown>;
  identity?: ListingIdentity;
  maxRedirects?: number;
}

// ── API rung ────────────────────────────────────────────────────────────────────

const SAFE_SEGMENT = /^(?:[A-Za-z0-9._-]|%20)+$/;
const isSafeValue = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.split('/').every((s) => s.length > 0 && SAFE_SEGMENT.test(s) && !s.includes('..'));

export interface ApiPlan {
  ats: string;
  apiUrl: string;
  /** Whether a 404 from this API proves the posting is gone. */
  api404Authoritative: boolean;
  /** Statuses (besides 404/410) that still carry a verdict, e.g. Workday 403. */
  interpretStatuses?: number[];
  interpret?(status: number, json: unknown): LivenessVerdict | null;
}

const active = (code: string, reason: string): LivenessVerdict => ({ result: 'active', code, reason });
const expired = (code: string, reason: string): LivenessVerdict => ({ result: 'expired', code, reason });

export function classifyAshbyBoard(json: unknown, jobId: string): LivenessVerdict | null {
  const jobs = (json as { jobs?: unknown } | null)?.jobs;
  if (!Array.isArray(jobs)) return null;
  const target = jobId.toLowerCase();
  const job = jobs.find((j) => typeof j?.id === 'string' && j.id.toLowerCase() === target);
  return job && job.isListed !== false
    ? active('ashby_api_ok', 'Ashby posting is listed on the board (live)')
    : expired('ashby_api_unlisted', 'Ashby posting not listed on the board — removed/unlisted');
}

export function classifyWorkablePosting(json: unknown): LivenessVerdict | null {
  if (!json || typeof json !== 'object') return null;
  return (json as { state?: unknown }).state === 'published'
    ? active('workable_api_published', 'Workable reports the posting published (live)')
    : { result: 'uncertain', code: 'workable_state_unrecognised', reason: `Workable reports state ${String((json as { state?: unknown }).state)}` };
}

export function classifyWorkday403(json: unknown): LivenessVerdict | null {
  const j = json as { httpStatus?: unknown; errorCode?: unknown } | null;
  return j?.httpStatus === 403 && j?.errorCode === 'S22' ? expired('workday_api_withdrawn', 'Workday CXS answers 403 S22 — posting withdrawn') : null;
}

/** Work out which provider API can answer for this posting, from its URL and/or stored identity. */
export function planApiCheck(rawUrl: string, identity?: ListingIdentity): ApiPlan | null {
  if (identity && identity.ats_provider === 'greenhouse' && isSafeValue(identity.board_slug) && isSafeValue(identity.posting_id)) {
    return greenhousePlan(identity.board_slug, identity.posting_id);
  }
  if (identity && identity.ats_provider === 'lever' && isSafeValue(identity.board_slug) && isSafeValue(identity.posting_id)) {
    return leverPlan(identity.board_slug, identity.posting_id);
  }
  if (identity && identity.ats_provider === 'ashby' && isSafeValue(identity.board_slug) && isSafeValue(identity.posting_id)) {
    return ashbyPlan(identity.board_slug, identity.posting_id);
  }

  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();

  if (/^(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io$/.test(host)) {
    const m = /^\/([^/]+)\/jobs\/(\d+)\/?$/.exec(u.pathname);
    return m && isSafeValue(m[1]) ? greenhousePlan(m[1]!, m[2]!) : null;
  }
  if (host === 'jobs.lever.co') {
    const m = /^\/([^/]+)\/([^/?#]+)\/?$/.exec(u.pathname);
    return m && isSafeValue(m[1]) && isSafeValue(m[2]) ? leverPlan(m[1]!, m[2]!) : null;
  }
  if (host === 'jobs.ashbyhq.com') {
    const m = /^\/([^/]+)\/([^/]+)(?:\/application)?\/?$/.exec(u.pathname);
    return m && isSafeValue(m[1]) && isSafeValue(m[2]) ? ashbyPlan(m[1]!, m[2]!) : null;
  }
  if (host === 'apply.workable.com') {
    const m = /^\/([^/]+)\/j\/([A-Za-z0-9_-]+)\/?$/.exec(u.pathname);
    if (!m || !isSafeValue(m[1])) return null;
    return {
      ats: 'workable',
      apiUrl: `https://apply.workable.com/api/v2/accounts/${m[1]}/jobs/${m[2]}`,
      api404Authoritative: true,
      interpret: (status, json) => (status === 200 ? classifyWorkablePosting(json) : null),
    };
  }
  if (host === 'jobs.smartrecruiters.com') {
    const m = /^\/([^/]+)\/([A-Za-z0-9]+)(?:-[^/]*)?\/?$/.exec(u.pathname);
    if (!m || !isSafeValue(m[1])) return null;
    const id = m[2]!;
    return {
      ats: 'smartrecruiters',
      apiUrl: `https://api.smartrecruiters.com/v1/companies/${m[1]}/postings/${id}`,
      api404Authoritative: false, // the API also answers 400/404 for unknown ids
      interpret: (status, json) => {
        const p = json as { id?: unknown; active?: unknown } | null;
        if (status !== 200 || String(p?.id) !== id || typeof p?.active !== 'boolean') return null;
        return p.active
          ? active('smartrecruiters_api_active', 'SmartRecruiters marks the posting active')
          : expired('smartrecruiters_api_inactive', 'SmartRecruiters marks the posting inactive');
      },
    };
  }
  const wd = /^([\w-]+)\.(wd[\w-]*)\.myworkdayjobs\.com$/.exec(host);
  if (wd) {
    const m = /^\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)\/job\/(.+?)\/?$/.exec(u.pathname);
    if (!m || !isSafeValue(m[1]) || !isSafeValue(m[2])) return null;
    return {
      ats: 'workday',
      apiUrl: `https://${wd[1]}.${wd[2]}.myworkdayjobs.com/wday/cxs/${wd[1]}/${m[1]}/job/${m[2]}`,
      api404Authoritative: true,
      interpretStatuses: [403],
      interpret: (status, json) => (status === 403 ? classifyWorkday403(json) : null),
    };
  }
  return null;
}

function greenhousePlan(board: string, id: string): ApiPlan {
  return { ats: 'greenhouse', apiUrl: `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`, api404Authoritative: true };
}
function leverPlan(slug: string, id: string): ApiPlan {
  return { ats: 'lever', apiUrl: `https://api.lever.co/v0/postings/${slug}/${id}`, api404Authoritative: false };
}
function ashbyPlan(org: string, jobId: string): ApiPlan {
  return {
    ats: 'ashby',
    apiUrl: `https://api.ashbyhq.com/posting-api/job-board/${org}`,
    api404Authoritative: false,
    interpret: (status, json) => (status === 200 ? classifyAshbyBoard(json, jobId) : null),
  };
}

async function timedFetch(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkViaApi(plan: ApiPlan, o: Required<Pick<LivenessCheckOptions, 'timeoutMs' | 'userAgent'>> & { fetchImpl: typeof fetch; boardCache?: Map<string, unknown> }): Promise<LivenessVerdict | null> {
  try {
    assertSafeHttpsUrl(plan.apiUrl);
    // Board-style APIs (Ashby): one fetch answers for every posting on the board.
    if (plan.ats === 'ashby' && o.boardCache?.has(plan.apiUrl)) return plan.interpret!(200, o.boardCache.get(plan.apiUrl));
    const res = await timedFetch(o.fetchImpl, plan.apiUrl, { redirect: 'error', headers: { 'user-agent': o.userAgent, accept: 'application/json' } }, o.timeoutMs);
    if ((res.status === 404 || res.status === 410) && !plan.interpretStatuses?.includes(res.status)) {
      return plan.api404Authoritative ? expired(`${plan.ats}_api_gone`, `ATS API ${res.status} — posting removed`) : null;
    }
    let json: unknown = null;
    if (plan.interpret || res.status === 200) {
      try {
        json = await res.json();
      } catch {
        json = null; // WAF interstitial or non-JSON: inconclusive
      }
    }
    if (plan.interpret && (res.status === 200 || plan.interpretStatuses?.includes(res.status))) {
      if (plan.ats === 'ashby' && res.status === 200 && json) o.boardCache?.set(plan.apiUrl, json);
      return plan.interpret(res.status, json);
    }
    if (res.status === 200) return active(`${plan.ats}_api_ok`, 'ATS API returns the posting (live)');
    return null; // 429 / 5xx / other: inconclusive
  } catch {
    return null; // network, timeout, refused redirect: inconclusive
  }
}

// ── HTTP rung ───────────────────────────────────────────────────────────────────

export function extractApplyControls(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = htmlToText(m[2]).trim();
    if (t && t.length <= 80) out.push(t);
  }
  for (const m of html.matchAll(/<input\b[^>]*\btype=["']?(?:submit|button)["']?[^>]*\bvalue=["']([^"']{1,80})["']/gi)) out.push(m[1]!);
  for (const m of html.matchAll(/\baria-label=["']([^"']{1,80})["']/gi)) out.push(m[1]!);
  return out;
}

async function fetchPage(url: string, o: { fetchImpl: typeof fetch; timeoutMs: number; userAgent: string; maxRedirects: number }): Promise<PageSnapshot> {
  let current = url;
  for (let hop = 0; hop <= o.maxRedirects; hop++) {
    assertSafeHttpsUrl(current);
    const res = await timedFetch(o.fetchImpl, current, { redirect: 'manual', headers: { 'user-agent': o.userAgent, accept: 'text/html,application/xhtml+xml' } }, o.timeoutMs);
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) return { status: res.status, finalUrl: current, bodyText: '', applyControls: [] };
      current = new URL(loc, current).toString();
      continue;
    }
    const html = (await res.text()).slice(0, 2_000_000);
    return { status: res.status, finalUrl: current, bodyText: htmlToText(html), applyControls: extractApplyControls(html) };
  }
  throw new Error('too many redirects');
}

/**
 * Check one posting. Never throws: an unreachable or blocked page is "uncertain", never "expired".
 */
export async function checkPostingLiveness(url: string, options: LivenessCheckOptions = {}): Promise<CheckedLiveness> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const now = options.now ?? (() => new Date());
  const stamp = () => now().toISOString();
  const done = (v: LivenessVerdict, via: CheckVia, extra: Partial<CheckedLiveness> = {}): CheckedLiveness => ({ ...v, via, url, checkedAt: stamp(), ...extra });

  if (!options.skipApi) {
    const plan = planApiCheck(url, options.identity);
    if (plan) {
      const verdict = await checkViaApi(plan, { fetchImpl, timeoutMs, userAgent, boardCache: options.boardCache });
      if (verdict) return done(verdict, 'api');
    }
  }

  let snap: PageSnapshot | null = null;
  let httpError: string | null = null;
  try {
    snap = await fetchPage(url, { fetchImpl, timeoutMs, userAgent, maxRedirects: options.maxRedirects ?? 5 });
  } catch (err) {
    httpError = err instanceof Error ? err.message : String(err);
  }

  if (snap) {
    const verdict = classifyLiveness({ ...snap, requestedUrl: url, now: now() });
    // A bare HTTP fetch of a JS-rendered career site returns an empty shell: that is "unrendered", not "expired".
    const conclusive = verdict.code === 'insufficient_content' ? null : verdict;
    if (conclusive && conclusive.result !== 'uncertain') {
      return done(conclusive, 'http', { httpStatus: snap.status, finalUrl: snap.finalUrl });
    }
    if (!options.renderer) {
      const v: LivenessVerdict = conclusive ?? { result: 'uncertain', code: 'unrendered', reason: 'page body is empty without JavaScript; needs a browser render to judge' };
      return done(v, 'http', { httpStatus: snap.status, finalUrl: snap.finalUrl });
    }
  }

  if (options.renderer) {
    try {
      const rendered = await options.renderer(url);
      const verdict = classifyLiveness({ ...rendered, requestedUrl: url, now: now() });
      return done(verdict, 'renderer', { httpStatus: rendered.status, finalUrl: rendered.finalUrl });
    } catch (err) {
      return done({ result: 'uncertain', code: 'renderer_failed', reason: err instanceof Error ? err.message : String(err) }, 'renderer');
    }
  }
  return done({ result: 'uncertain', code: 'unreachable', reason: httpError ?? 'no response' }, 'http');
}

export interface BatchItem {
  id: string;
  url: string;
  identity?: ListingIdentity;
}

/** Check many postings with bounded concurrency and per-host spacing (be polite to career sites). */
export async function checkPostingsLiveness(
  items: BatchItem[],
  options: LivenessCheckOptions & { concurrency?: number; perHostDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Map<string, CheckedLiveness>> {
  const results = new Map<string, CheckedLiveness>();
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const spacing = options.perHostDelayMs ?? 400;
  const nextSlot = new Map<string, number>();
  const boardCache = options.boardCache ?? new Map<string, unknown>();
  let cursor = 0;
  const lane = async () => {
    for (;;) {
      const item = items[cursor++];
      if (!item) return;
      let host = '';
      try {
        host = new URL(item.url).hostname;
      } catch {
        /* checkPostingLiveness reports the bad URL */
      }
      const at = Math.max(Date.now(), nextSlot.get(host) ?? 0);
      nextSlot.set(host, at + spacing);
      const wait = at - Date.now();
      if (wait > 0) await sleep(wait);
      results.set(item.id, await checkPostingLiveness(item.url, { ...options, identity: item.identity, boardCache }));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 4, items.length)) }, lane));
  return results;
}
