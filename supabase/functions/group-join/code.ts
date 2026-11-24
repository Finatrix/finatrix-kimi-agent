/**
 * Group room codes: six characters of Crockford base32, shown as `FX-7K2P9Q`.
 *
 * Crockford's alphabet has no I, L, O or U, so a code read out on a call is
 * hard to mishear. When someone types one of those letters anyway, we read it
 * the way they meant it (O as 0, I and L as 1), as Crockford specifies. The
 * database draws codes from the same alphabet (`public.group_new_code` in
 * supabase/migrations/20261124000100_groups.sql); a unit test keeps the two in step.
 */
export const GROUP_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const STORED_CODE = /^[0-9A-HJKMNP-TV-Z]{6}$/;

/** The stored form of a typed, pasted or scanned code, or null when it can't be one. */
export function normalizeGroupCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 32) return null;
  let code = input
    .toUpperCase()
    .replace(/[\s\-\u2010-\u2015_.]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  // "FX-7K2P9Q" as shown. A bare six-character code that happens to start
  // with FX is still a code, so only strip the prefix from eight characters.
  if (code.length === 8 && code.startsWith('FX')) code = code.slice(2);
  return STORED_CODE.test(code) ? code : null;
}
