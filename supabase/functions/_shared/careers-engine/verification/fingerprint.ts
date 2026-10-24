/**
 * 64-bit SimHash of job-description text, used to spot the same ad under a different company
 * (recruitment agencies, boards). Derived from career-ops fingerprint-core.mjs (MIT, see NOTICE).
 */
import { sha1Into } from '../util/sha1.ts';
import { normalizeCompanyName, normalizeTextKey } from '../util/text.ts';

export const FINGERPRINT_MIN_TEXT = 200;
export const CROSSLIST_THRESHOLD = 0.92;
export const CROSSLIST_WINDOW_DAYS = 90;

export function normalizeJdText(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

const encoder = new TextEncoder();
const digest = new Int32Array(5);

/**
 * 16 hex chars, or '' when the text is too short to fingerprint reliably.
 *
 * SimHash over word trigrams, each hashed with SHA-1; a bit is set where most trigram hashes set it. The normalised
 * text is single-spaced, so each trigram is one contiguous run of its UTF-8 bytes: the text is encoded once and the
 * runs are hashed in place, instead of building and hashing a string per trigram (most of a board scan's CPU).
 */
export function fingerprintText(text: unknown): string {
  const normalized = normalizeJdText(text);
  if (normalized.length < FINGERPRINT_MIN_TEXT) return '';
  const bytes = encoder.encode(normalized);
  const wordStarts = [0];
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0x20) wordStarts.push(i + 1);
  if (wordStarts.length < 3) return '';
  const trigrams = wordStarts.length - 2;
  const ones = new Int32Array(64);
  for (let i = 0; i < trigrams; i++) {
    const end = i + 3 < wordStarts.length ? wordStarts[i + 3]! - 1 : bytes.length;
    sha1Into(bytes, wordStarts[i]!, end, digest);
    const hi = digest[0]!, lo = digest[1]!;
    for (let bit = 0; bit < 32; bit++) {
      ones[bit]! += (hi >>> (31 - bit)) & 1;
      ones[bit + 32]! += (lo >>> (31 - bit)) & 1;
    }
  }
  let hash = 0n;
  for (let bit = 0; bit < 64; bit++) if (ones[bit]! * 2 > trigrams) hash |= 1n << BigInt(63 - bit);
  return hash.toString(16).padStart(16, '0');
}

const FINGERPRINT_RE = /^[0-9a-f]{16}$/;
const POPCOUNT16 = (() => {
  const table = new Uint8Array(1 << 16);
  for (let i = 1; i < table.length; i++) table[i] = table[i >> 1]! + (i & 1);
  return table;
})();
const popcount32 = (x: number) => POPCOUNT16[x & 0xffff]! + POPCOUNT16[(x >>> 16) & 0xffff]!;
const split = (fp: string) => ({ hi: parseInt(fp.slice(0, 8), 16) | 0, lo: parseInt(fp.slice(8, 16), 16) | 0 });

export function hammingDistance(a: string, b: string): number | null {
  if (!FINGERPRINT_RE.test(a) || !FINGERPRINT_RE.test(b)) return null;
  const x = split(a);
  const y = split(b);
  return popcount32(x.hi ^ y.hi) + popcount32(x.lo ^ y.lo);
}

/** 1 - hamming/64, or 0 when either fingerprint is malformed. */
export function similarity(a: string, b: string): number {
  const d = hammingDistance(a, b);
  return d === null ? 0 : 1 - d / 64;
}

function maxDistanceFor(threshold: number): number {
  for (let d = 0; d <= 64; d++) if (!(1 - d / 64 >= threshold)) return d - 1;
  return 64;
}

export function companyIdentity(name: string): string {
  return normalizeCompanyName(name) || normalizeTextKey(String(name ?? ''));
}

export interface FingerprintedPosting {
  company: string;
  url: string;
  fingerprint: string;
}
export interface FingerprintHistoryRow extends FingerprintedPosting {
  /** ISO date (YYYY-MM-DD or full timestamp) the row was first seen. */
  dateStr: string;
}
export interface CrossListing<O extends FingerprintedPosting, H extends FingerprintHistoryRow> {
  offer: O;
  row: H;
  score: number;
}

/**
 * Offers whose text matches a *recent posting under a different company*: the signature of an agency
 * or board re-advertising someone else's role. Same-company matches are reposts, handled elsewhere.
 */
export function findCrossListings<O extends FingerprintedPosting, H extends FingerprintHistoryRow>(
  offers: O[],
  history: H[],
  opts: { threshold?: number; windowDays?: number; today?: Date | string | number } = {},
): Array<CrossListing<O, H>> {
  const threshold = opts.threshold ?? CROSSLIST_THRESHOLD;
  const windowDays = opts.windowDays ?? CROSSLIST_WINDOW_DAYS;
  const today = opts.today !== undefined ? new Date(opts.today) : new Date();
  const cutoff = today.getTime() - windowDays * 86_400_000;
  const maxDist = maxDistanceFor(threshold);

  const recent: Array<{ row: H; key: string; hi: number; lo: number }> = [];
  for (const row of history) {
    if (!row.fingerprint || !FINGERPRINT_RE.test(row.fingerprint)) continue;
    const t = Date.parse(row.dateStr);
    if (Number.isNaN(t) || t < cutoff) continue;
    const half = split(row.fingerprint);
    recent.push({ row, key: companyIdentity(row.company), hi: half.hi, lo: half.lo });
  }

  const out: Array<CrossListing<O, H>> = [];
  for (const offer of offers) {
    if (!offer.fingerprint || !FINGERPRINT_RE.test(offer.fingerprint)) continue;
    const company = companyIdentity(offer.company);
    const half = split(offer.fingerprint);
    for (const cand of recent) {
      if (cand.key === company) continue;
      if (cand.row.url === offer.url) continue;
      const dist = popcount32(half.hi ^ cand.hi) + popcount32(half.lo ^ cand.lo);
      if (dist > maxDist) continue;
      out.push({ offer, row: cand.row, score: 1 - dist / 64 });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
