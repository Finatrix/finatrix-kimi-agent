import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signUp: (
    email: string,
    password: string,
    name: string
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithProvider: (
    provider: 'google'
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resendVerification: (email: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Turn any Supabase auth error into a clean, human-readable string.
// Guards against blank / "{}" / "[object Object]" messages ever reaching the UI,
// and maps GoTrue email-delivery failures (HTTP 500 / unexpected_failure) to
// actionable guidance instead of a cryptic blob.
function authErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;
  const e = error as { message?: string; status?: number; code?: string };
  const msg = (typeof error === 'string' ? error : e.message ?? '').trim();
  const garbled = !msg || msg === '{}' || msg === '[object Object]';
  if (
    /sending.*(email|confirmation)|smtp/i.test(msg) ||
    e.status === 500 ||
    e.code === 'unexpected_failure'
  ) {
    return 'We couldn’t send your confirmation email right now. Please try again in a few minutes — if it keeps happening, contact support.';
  }
  return garbled ? fallback : msg;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!isSupabaseConfigured) {
        if (mounted) setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (mounted) setLoading(false);
    }

    void init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp: AuthContextValue['signUp'] = async (email, password, name) => {
    if (!isSupabaseConfigured)
      return { error: 'Backend not configured yet.', needsConfirmation: false };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    if (error)
      return {
        error: authErrorMessage(error, 'Could not create your account. Please try again.'),
        needsConfirmation: false,
      };
    // If email confirmation is on, there is no active session yet.
    const needsConfirmation = !data.session;
    return { error: null, needsConfirmation };
  };

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    if (!isSupabaseConfigured) return { error: 'Backend not configured yet.' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? authErrorMessage(error, 'Could not sign in. Please try again.') : null };
  };

  const signInWithProvider: AuthContextValue['signInWithProvider'] = async (
    provider
  ) => {
    if (!isSupabaseConfigured) return { error: 'Backend not configured yet.' };
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/tools`,
      },
    });
    return { error: error ? authErrorMessage(error, 'Could not sign in. Please try again.') : null };
  };

  const signOut = async () => {
    try {
      if (isSupabaseConfigured) await supabase.auth.signOut();
    } catch {
      /* Clear local state regardless of network/server outcome. */
    }
    setUser(null);
    setSession(null);
  };

  const resendVerification: AuthContextValue['resendVerification'] = async (email) => {
    if (!isSupabaseConfigured) return { error: 'Backend not configured yet.' };
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    return { error: error ? authErrorMessage(error, 'Could not resend the email. Please try again.') : null };
  };

  const resetPassword: AuthContextValue['resetPassword'] = async (email) => {
    if (!isSupabaseConfigured) return { error: 'Backend not configured yet.' };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    return { error: error ? authErrorMessage(error, 'Could not send the reset link. Please try again.') : null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        configured: isSupabaseConfigured,
        signUp,
        signIn,
        signInWithProvider,
        signOut,
        resendVerification,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
