import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  isSupabaseConfigured,
  supabaseConfigError,
  PLACEHOLDER_KEY,
  PLACEHOLDER_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from './supabaseConfig';

/**
 * IMPORTING THIS MODULE PULLS IN `@supabase/supabase-js` — 54 KB gzipped.
 *
 * That is fine everywhere it is used: every consumer (the careers services, the
 * tools' cloud sync, the AI transport, the profile page) is inside a lazily
 * loaded route chunk that cannot function without a backend anyway.
 *
 * It was NOT fine in `AuthContext`, which is mounted on every route including
 * the landing page, and which imported this file only to read
 * `isSupabaseConfigured`. Those constants now live in `./supabaseConfig`, which
 * has no dependency on the library, and `AuthContext` loads this module
 * dynamically and only when there is a session to restore. If you need to know
 * *whether* a backend is configured, import `./supabaseConfig`; import this only
 * when you are about to actually talk to it.
 */

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
  SUPABASE_URL || PLACEHOLDER_URL,
  SUPABASE_ANON_KEY || PLACEHOLDER_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

// Re-exported so the many existing `import { supabase, isSupabaseConfigured }
// from '../lib/supabase'` call sites keep working unchanged.
export { isSupabaseConfigured, supabaseConfigError };
