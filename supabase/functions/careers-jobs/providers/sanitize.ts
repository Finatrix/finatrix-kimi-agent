// Response sanitisation at the trust boundary. Every string that arrives from a
// provider is untrusted third-party data and passes through here before it can
// reach the database or the client. Pure — no Deno/Node APIs.

/** Clamp any value to a bounded string. Non-strings become ''. */
export function str(v: unknown, max = 500): string {
  if (typeof v === 'string') return v.slice(0, max);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v).slice(0, max);
  return '';
}

/** Positive integer or null. */
export function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Best-effort ISO 8601, or null. */
export function iso(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "3 days ago", "Posted 2 Days Ago", "30+ days ago", "just posted", "today". */
const RELATIVE_DATE =
  /(?:(\d+)\+?\s*(minute|min|hour|hr|day|week|month|year)s?\s*ago)|(just\s*posted|today|yesterday)/i;

const RELATIVE_MS: Record<string, number> = {
  minute: 60_000, min: 60_000,
  hour: 3_600_000, hr: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,   // 30d
  year: 31_536_000_000,   // 365d
};

/**
 * Coerce whatever a provider calls a "posted date" into real ISO 8601, or null.
 *
 * Providers are wildly inconsistent here: the Fantastic-Jobs family returns
 * absolute timestamps, Google Jobs returns human text ("2 days ago") and Workday
 * returns "Posted 3 Days Ago". Passing those through unchanged breaks the
 * documented contract (FinatriXJob.postedDate / WireJob.posted_at are ISO or
 * null), collapses `freshness` to 'unknown' — which is 20% of the ranking score —
 * and makes the row unwritable to `public.jobs.posted_at` (timestamptz).
 *
 * Absolute dates are parsed first; only then do we fall back to relative text.
 * Anything we cannot understand becomes null, never a made-up date.
 */
export function postedDate(v: unknown, now = Date.now()): string | null {
  const raw = str(v, 60).trim();
  if (!raw) return null;

  const absolute = iso(raw);
  if (absolute) return absolute;

  const m = RELATIVE_DATE.exec(raw);
  if (!m) return null;
  if (m[3]) {
    const word = m[3].toLowerCase();
    const offset = word === 'yesterday' ? RELATIVE_MS.day : 0;
    return new Date(now - offset).toISOString();
  }
  const qty = Number(m[1]);
  const unit = RELATIVE_MS[m[2].toLowerCase()];
  if (!Number.isFinite(qty) || qty < 0 || !unit) return null;
  return new Date(now - qty * unit).toISOString();
}

/**
 * Strip HTML to safe plain text. Providers return descriptions with markup;
 * we never render provider HTML, so we remove tags entirely (not merely escape)
 * and decode the handful of entities that survive. This closes the stored-XSS
 * vector at ingestion rather than relying only on the renderer.
 */
export function stripHtml(v: unknown, max = 20_000): string {
  let s = str(v, max * 2);
  if (!s) return '';
  // Remove script/style blocks wholesale, then all remaining tags.
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Validate a URL is a safe http(s) link. Rejects javascript:, data:, file:,
 * mailto:, malformed URLs and anything without an http(s) scheme. Returns the
 * normalised URL string, or '' when unsafe — callers treat '' as "no link".
 */
export function safeUrl(v: unknown): string {
  const raw = str(v, 2000).trim();
  if (!raw) return '';
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return '';
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
  // A host is mandatory for an apply link.
  if (!u.hostname) return '';
  return u.toString();
}

/** Normalise a token string for keys/matching: lowercase, alnum-collapsed. */
export function normToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
