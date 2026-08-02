/**
 * Whether a Supabase backend is configured, and why not when it is not.
 *
 * Split out of `supabase.ts` so that asking the question costs nothing. That
 * file constructs the client, which pulls `@supabase/supabase-js` — 54 KB
 * gzipped — into whatever chunk imports it, and `AuthContext` imported it purely
 * to read these two constants on every route including the landing page. Anyone
 * who only needs to know *whether* a backend exists can import this instead and
 * stay free of the library.
 *
 * Values come from `import.meta.env`, which Vite inlines at BUILD time, so both
 * constants are compile-time literals with no runtime dependency at all.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
export const PLACEHOLDER_KEY = 'public-anon-placeholder-key';

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;

/**
 * Whether a real Supabase backend is configured via environment variables.
 * When false, the app still runs fully — auth UI explains setup is needed and
 * the tools fall back to on-device (localStorage) storage for guests.
 *
 * Vite inlines `import.meta.env.*` at BUILD time, so these must be present in
 * the environment that runs `vite build` (local `.env` or CI build vars) — not
 * only in Supabase/Cloudflare runtime secrets.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * A precise, human-readable reason the backend is not usable, or '' when it is.
 * Surfaced by the UI instead of letting an undefined/placeholder credential
 * reach the gateway (which returns a 401 the browser mislabels as a CORS error).
 */
export const supabaseConfigError: string = (() => {
  if (!url) return 'VITE_SUPABASE_URL is not set in this build.';
  if (!anonKey) return 'VITE_SUPABASE_ANON_KEY is not set in this build.';
  if (anonKey === PLACEHOLDER_KEY || url === PLACEHOLDER_URL) {
    return 'Supabase env vars were missing at build time (placeholder values are in use).';
  }
  return '';
})();
