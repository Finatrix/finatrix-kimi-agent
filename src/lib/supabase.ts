import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Whether a real Supabase backend is configured via environment variables.
 * When false, the app still runs fully — auth UI explains setup is needed and
 * the tools fall back to on-device (localStorage) storage for guests.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

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
