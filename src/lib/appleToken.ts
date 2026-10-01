import { invokeAuthed } from './functions';

/**
 * Hand the Apple refresh token from a just-completed Sign in with Apple to the
 * `apple-token` edge function, which confirms it with Apple and keeps it
 * (encrypted) so deleting the account can revoke it — App Review 5.1.1(v).
 * See supabase/functions/_shared/appleSignIn.ts.
 *
 * Best effort and silent: a sign-in must never fail because this did, and the
 * server answers 503 until the Apple keys are configured. Nothing is retained
 * on the device.
 */
export async function registerAppleToken(token: string): Promise<void> {
  try {
    await invokeAuthed('apple-token', { token });
  } catch {
    /* best effort */
  }
}
