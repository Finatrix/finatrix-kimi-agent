/**
 * Which third-party sign-in options a given build offers, and in what order.
 *
 * WHY APPLE IS NOT OPTIONAL ON iOS
 * --------------------------------
 * App Review Guideline 4.8 requires an app that offers a third-party or social
 * login for its primary account to also offer a login service that limits data
 * collection to name and email, lets the user keep their email address private,
 * and does not track them. FinatriX offers Google, which does not let the user
 * hide their address — so on iOS, Sign in with Apple is a condition of being on
 * the store at all. Removing Google instead would be the other way to comply, and
 * is the wrong trade: it is how most existing accounts were created.
 *
 * WHY IT IS A FLAG EVERYWHERE ELSE
 * --------------------------------
 * The button is only useful once Supabase's Apple provider is configured (a
 * Services ID and a signing key in the Apple Developer portal — see docs/IOS.md).
 * Until then it would fail with "Unsupported provider" for anyone who pressed it.
 * The iOS build cannot opt out, so its runbook makes that configuration a gate;
 * the website and the Android app opt in with `VITE_AUTH_APPLE=1`, which keeps a
 * half-finished Apple configuration invisible to everyone already using the site.
 */
import { isIosApp } from '../native/platform';

export type OAuthProvider = 'google' | 'apple';

/** Button copy. Apple's HIG asks for "Continue with Apple" or "Sign in with Apple". */
export const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  google: 'Continue with Google',
  apple: 'Continue with Apple',
};

/** True when the Apple provider has been configured for this build. */
export function appleConfigured(): boolean {
  return (import.meta.env.VITE_AUTH_APPLE as string | undefined) === '1';
}

/**
 * The providers to show, in display order.
 *
 * Apple leads on iOS: Guideline 4.8 requires it to be presented as an equivalent
 * option, and putting the platform's own identity provider first is what an iPhone
 * user expects. Everywhere else Google leads, because that is what almost every
 * existing FinatriX account uses.
 */
export function authProviders(): OAuthProvider[] {
  if (isIosApp()) return ['apple', 'google'];
  return appleConfigured() ? ['google', 'apple'] : ['google'];
}
