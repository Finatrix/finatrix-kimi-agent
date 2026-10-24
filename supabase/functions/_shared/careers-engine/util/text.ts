/** Fold accents so "Sênior" and "Senior" compare equal. */
export function foldAscii(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Lowercase, accent-folded key. Non-alphanumerics become `sep`; runs collapse.
 * Letters and digits of any script are kept.
 */
export function normalizeTextKey(value: string, sep = ''): string {
  return foldAscii(String(value ?? ''))
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .join(sep);
}

const CORPORATE_SUFFIXES = new Set([
  'pty', 'ltd', 'limited', 'proprietary', 'inc', 'incorporated', 'llc', 'llp', 'lp',
  'corp', 'corporation', 'plc', 'co', 'gmbh', 'bv', 'nv',
]);

/** Company key with corporate-form suffixes and a leading "the" removed. */
export function normalizeCompanyName(name: string): string {
  const tokens = normalizeTextKey(name, ' ').split(' ').filter(Boolean);
  while (tokens.length > 1 && CORPORATE_SUFFIXES.has(tokens[tokens.length - 1]!)) tokens.pop();
  if (tokens.length > 1 && tokens[0] === 'the') tokens.shift();
  return tokens.join(' ');
}

function baseTokens(name: string): string[] {
  const stripped = String(name ?? '').replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  return normalizeCompanyName(stripped).split(' ').filter(Boolean);
}

function unitKey(name: string): string {
  const units = String(name ?? '').match(/\([^)]*\)|\[[^\]]*\]/g) ?? [];
  return normalizeTextKey(units.join(' '), ' ');
}

function isPrefix(shorter: string[], longer: string[]): boolean {
  return shorter.length > 0 && shorter.length <= longer.length && shorter.every((t, i) => t === longer[i]);
}

/**
 * How two employer names relate:
 *  - 'same'   same legal/brand entity ignoring corporate form
 *  - 'parent' same group, different unit ("Acme (Retail)" vs "Acme (Wholesale)", "Acme" vs "Acme Bank")
 *  - null     unrelated
 */
export function companyRelation(a: string, b: string): 'same' | 'parent' | null {
  const ka = normalizeCompanyName(a);
  const kb = normalizeCompanyName(b);
  if (!ka || !kb) return null;
  const ta = baseTokens(a);
  const tb = baseTokens(b);
  if (ta.length >= 2 && ta.join(' ') === tb.join(' ') && unitKey(a) !== unitKey(b)) return 'parent';
  if (ka === kb) return 'same';
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (shorter.length >= 2 && isPrefix(shorter, longer)) return shorter.length === longer.length ? 'same' : 'parent';
  return null;
}

/** Escape a string for use inside a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parse YYYY-MM-DD as a real calendar day (rejects 2026-02-30). */
export function isRealCalendarDate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function parseISODate(value: string): Date | null {
  if (!isRealCalendarDate(String(value ?? '').slice(0, 10))) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
