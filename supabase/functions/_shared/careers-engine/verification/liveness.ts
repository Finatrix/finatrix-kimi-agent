/**
 * Is this job posting still open? Pure classifier over what a page looked like.
 * Derived from career-ops liveness-core.mjs (MIT, see NOTICE), with Australian wording and
 * Australian closing-date handling added. Multilingual patterns are intentionally dropped:
 * this engine targets Australian English postings.
 *
 * Design rule inherited from upstream: a false "expired" is the costlier error (the candidate
 * silently never sees a live role), so every ambiguous case resolves to "uncertain".
 */

export type LivenessResult = 'active' | 'expired' | 'uncertain';

export interface LivenessVerdict {
  result: LivenessResult;
  code: string;
  reason: string;
}

export interface LivenessInput {
  status?: number;
  requestedUrl?: string;
  finalUrl?: string;
  bodyText?: string;
  applyControls?: string[];
  now?: Date;
}

function normalizeForMatch(text: unknown, keepLineBreaks = false): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[‘’ʼ′´`]/g, "'")
    .replace(/[“”″]/g, '"')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, (run) => (keepLineBreaks && run.includes('\n') ? '\n' : ' '));
}

const HARD_EXPIRED_PATTERNS: RegExp[] = [
  /job (is )?no longer available/i,
  /job.*no longer open/i,
  /\b(?:job|jobs|position|role|posting|opening|vacancy|requisition|req|listing)\b[\s\S]{0,60}?(?<!\b(?:application|form)\s)has been filled\b(?!\s+out)/i,
  /this job has expired/i,
  /job posting has expired/i,
  /no longer accepting applications/i,
  /this (position|role|job) (is )?no longer/i,
  /this (?:job|role|position)(?: listing)? is closed\b(?!-)/i,
  /job (listing )?not found/i,
  /can't view this job because it's not available/i,
  /the page you are looking for doesn.t exist/i,
  /applications?\s+(?:(?:have|are|is)\s+)?closed/i,
  /(?<!\bbe\s)closed on \d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  /(?<!\bbe\s)closed on (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}/i,
  // Australian / board wording
  /\bno longer advertised\b/i, // SEEK: "This job is no longer advertised"
  /\b(?:job|position|role|vacancy|posting|advertisement)\b[^.\n]{0,40}\bis no longer (?:available|open|active|advertised|accepting)\b/i,
  /this (?:advertisement|ad|vacancy) (?:has )?(?:now )?(?:expired|closed)\b/i,
  /\bvacancy (?:is )?(?:now )?closed\b/i,
  /\bthis role (?:has )?(?:now )?closed\b/i,
  /\bclosing date (?:has )?passed\b/i,
  /\bapplications? for this (?:job|role|position|vacancy) (?:have|has) closed\b/i,
];

const LISTING_PAGE_PATTERNS: RegExp[] = [/\d+\s+jobs?\s+found/i, /search for jobs page is loaded/i];
const SOFT_EXPIRED_PATTERNS: RegExp[] = [/\bjob expired\b/i];

export const BOT_CHALLENGE_PATTERNS: RegExp[] = [
  /just a moment/i,
  /performing security verification/i,
  /checking your browser before/i,
  /verify you are (a |not a )?human/i,
  /enable javascript and cookies to continue/i,
  /attention required.*cloudflare/i,
  /\bray id\b/i,
  /\bcf-ray\b/i,
  /please complete the security check/i,
];

const EXPIRED_URL_PATTERNS: RegExp[] = [/[?&]error=true/i];

const APPLY_PATTERNS: RegExp[] = [
  /\bapply\b/i,
  /submit application/i,
  /easy apply/i,
  /quick apply/i,
  /start application/i,
  /\bexpress interest\b/i,
];

const MIN_CONTENT_CHARS = 300;
const JOB_ID_TOKEN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{5,}/gi;

function jobIdToken(url = ''): string | null {
  const matches = url.match(JOB_ID_TOKEN);
  return matches ? matches[matches.length - 1]!.toLowerCase() : null;
}

const firstMatch = (patterns: RegExp[], text = ''): RegExp | undefined => patterns.find((p) => p.test(text));

/**
 * "…until the job is no longer available" is marketing copy about the future, not a closed ad.
 * A match counts only if it is NOT the tail of a conditional / time clause.
 */
const TIME_OR_CONDITION_CLAUSE =
  /\b(?:until|till|once|when|whenever|after|before|unless|if|whether|as soon as) (?:[^\s.,;:!?…|•·]+ ){0,9}[^\s.,;:!?…|•·]+$/i;

function firstStatedMatch(patterns: RegExp[], lines = ''): RegExp | undefined {
  const text = lines.replace(/\n/g, ' ');
  return patterns.find((pattern) => {
    for (const m of text.matchAll(new RegExp(pattern, `${pattern.flags}g`))) {
      if (!TIME_OR_CONDITION_CLAUSE.test(lines.slice(0, (m.index ?? 0) + m[0].length))) return true;
    }
    return false;
  });
}

const hasApplyControl = (controls: string[] = []) => controls.some((c) => APPLY_PATTERNS.some((p) => p.test(c)));

// ── Australian closing dates ────────────────────────────────────────────────────

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DEADLINE_LEAD =
  /\b(?:applications?\s+(?:close|closes|closing)|closing\s+date|close\s+date|applications?\s+must\s+be\s+(?:received|submitted)\s+by)\b\s*(?:on|:|-|is)?\s*(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?/gi;
const DATE_AT_START = [
  /^(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})/i, // 31 October 2026
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i, // October 31, 2026
  /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/, // 31/10/2026 (day-first, Australian)
];

function parseDeadline(chunk: string): string | null {
  let d: number, m: number, y: number;
  let r = DATE_AT_START[0]!.exec(chunk);
  if (r) [d, m, y] = [Number(r[1]), MONTHS[r[2]!.toLowerCase()]!, Number(r[3])];
  else if ((r = DATE_AT_START[1]!.exec(chunk))) [m, d, y] = [MONTHS[r[1]!.toLowerCase()]!, Number(r[2]), Number(r[3])];
  else if ((r = DATE_AT_START[2]!.exec(chunk))) [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** The furthest-behind Australian time zone, so a role closing "today" anywhere in AU is never marked expired early. */
export const DEADLINE_TIME_ZONE = 'Australia/Perth';

function todayIn(zone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Returns the stated deadline when EVERY closing date on the page is already in the past. */
export function pastClosingDate(bodyText: string, now: Date): string | null {
  const found: string[] = [];
  for (const lead of bodyText.matchAll(DEADLINE_LEAD)) {
    const start = (lead.index ?? 0) + lead[0].length;
    const iso = parseDeadline(bodyText.slice(start, start + 40));
    if (iso) found.push(iso);
  }
  if (found.length === 0) return null;
  const today = todayIn(DEADLINE_TIME_ZONE, now);
  return found.every((iso) => iso < today) ? found.sort().at(-1)! : null;
}

export function classifyLiveness(input: LivenessInput = {}): LivenessVerdict {
  const { status = 0, requestedUrl = '', finalUrl = '', now = new Date() } = input;
  const bodyLines = normalizeForMatch(input.bodyText ?? '', true);
  const bodyText = bodyLines.replace(/\n/g, ' ');
  const applyControls = (Array.isArray(input.applyControls) ? input.applyControls : []).map((c) => normalizeForMatch(c));

  if (status === 404 || status === 410) return { result: 'expired', code: 'http_gone', reason: `HTTP ${status}` };

  const bot = firstMatch(BOT_CHALLENGE_PATTERNS, bodyText);
  if (bot) return { result: 'uncertain', code: 'bot_challenge', reason: `anti-bot challenge: ${bot.source}` };
  if (status === 403 || status === 429 || status === 503) {
    return { result: 'uncertain', code: 'access_blocked', reason: `HTTP ${status} (access blocked, likely anti-bot)` };
  }
  if (status >= 500) return { result: 'uncertain', code: 'server_error', reason: `HTTP ${status} (transient server error)` };

  if (firstMatch(EXPIRED_URL_PATTERNS, finalUrl)) {
    return { result: 'expired', code: 'expired_url', reason: `redirect to ${finalUrl}` };
  }

  // Hard-expired wording beats a lingering "Apply" link in the page chrome.
  const expiredBody = firstStatedMatch(HARD_EXPIRED_PATTERNS, bodyLines);
  if (expiredBody) return { result: 'expired', code: 'expired_body', reason: `pattern matched: ${expiredBody.source}` };

  // Sent to the careers home page or a search results page: we cannot tell about THIS posting.
  const jobId = jobIdToken(requestedUrl);
  if (jobId && finalUrl && !finalUrl.toLowerCase().includes(jobId)) {
    return {
      result: 'uncertain',
      code: 'redirected_off_posting',
      reason: `redirected to ${finalUrl} — job id "${jobId}" missing from final URL`,
    };
  }

  const closed = pastClosingDate(bodyText, now);
  if (closed) return { result: 'expired', code: 'deadline_passed', reason: `closing date ${closed} has passed` };

  if (hasApplyControl(applyControls)) {
    return { result: 'active', code: 'apply_control_visible', reason: 'visible apply control detected' };
  }
  const soft = firstMatch(SOFT_EXPIRED_PATTERNS, bodyText);
  if (soft) return { result: 'expired', code: 'expired_body_soft', reason: `pattern matched: ${soft.source}` };
  const listing = firstMatch(LISTING_PAGE_PATTERNS, bodyText);
  if (listing) return { result: 'expired', code: 'listing_page', reason: `pattern matched: ${listing.source}` };
  if (bodyText.trim().length < MIN_CONTENT_CHARS) {
    return { result: 'expired', code: 'insufficient_content', reason: 'insufficient content — likely nav/footer only' };
  }
  return { result: 'uncertain', code: 'no_apply_control', reason: 'content present but no visible apply control found' };
}

/** `insufficient_content` means "the page rendered nothing": only trustworthy after a real browser render. */
export const isUnreadableVerdict = (v: LivenessVerdict | null | undefined) => v?.code === 'insufficient_content';
