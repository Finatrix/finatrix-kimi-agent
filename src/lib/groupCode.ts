import { PUBLIC_ORIGIN } from '../native/platform';

/**
 * Group room codes in the app: six characters of Crockford base32, stored bare
 * (`7K2P9Q`) and shown as `FX-7K2P9Q`.
 *
 * `normalizeGroupCode` MIRRORS `supabase/functions/group-join/code.ts`, which is
 * the rule the server applies. The app needs the same rule to read a code that
 * was typed, pasted from a chat or scanned from a link before it asks the
 * server, and `src/test/groupCode.test.ts` holds the two in step. Change both
 * together or not at all.
 */
const STORED_CODE = /^[0-9A-HJKMNP-TV-Z]{6}$/;

/** The stored form of a typed, pasted or scanned code, or null when it can't be one. */
export function normalizeGroupCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 32) return null;
  let code = input
    .toUpperCase()
    .replace(/[\s\-‐-―_.]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (code.length === 8 && code.startsWith('FX')) code = code.slice(2);
  return STORED_CODE.test(code) ? code : null;
}

/** `7K2P9Q` → `FX-7K2P9Q`, the form people see, say and share. */
export function formatGroupCode(code: string): string {
  return `FX-${code}`;
}

/** The path of the Groups screen. `/tools/*` is claimed by both apps' links. */
export const GROUPS_PATH = '/tools/groups';

/**
 * The invite link. It lives under `/tools/*`, which the iOS app's universal
 * links (`IOS_LINK_COMPONENTS`) and the Android app's verified intent filter
 * already claim, so it opens the installed app and the website otherwise, with
 * nothing new to verify on either platform.
 */
export function groupInviteUrl(code: string): string {
  return `${PUBLIC_ORIGIN}${GROUPS_PATH}?join=${encodeURIComponent(formatGroupCode(code))}`;
}

/** The code carried by a `?join=` query string, or null. */
export function joinCodeFromSearch(search: string): string | null {
  try {
    return normalizeGroupCode(new URLSearchParams(search).get('join'));
  } catch {
    return null;
  }
}

/**
 * What someone pasted into "Join with a code": the code itself, or a whole
 * invite link copied from a chat. Only FinatriX's own Groups links are read as
 * links, so a pasted link elsewhere is never mistaken for one.
 */
export function readJoinInput(input: string): string | null {
  const text = input.trim();
  const direct = normalizeGroupCode(text);
  if (direct) return direct;
  const link = text.match(/https?:\/\/\S+/)?.[0];
  if (!link) return null;
  try {
    const url = new URL(link);
    const own = url.origin === PUBLIC_ORIGIN || url.hostname === 'www.finatrix.co';
    return own && url.pathname.replace(/\/$/, '') === GROUPS_PATH ? joinCodeFromSearch(url.search) : null;
  } catch {
    return null;
  }
}
