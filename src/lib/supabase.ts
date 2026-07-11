import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'public-anon-placeholder-key';

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

// Fail loud in the console (once) rather than silently shipping a broken client.
if (typeof console !== 'undefined' && supabaseConfigError) {
  console.error(`[FinatriX] Supabase misconfigured: ${supabaseConfigError}`);
}

/**
 * A single shared Supabase client. If env vars are missing we create a harmless
 * placeholder so imports never crash; any call simply fails gracefully and the
 * UI shows the "backend not configured" state.
 */
export const supabase: SupabaseClient = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'public-anon-placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
