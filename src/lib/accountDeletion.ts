/**
 * What deleting an account asks the person to type. Used by
 * `components/DeleteAccount.tsx`, which may export only components.
 */

/** Apple's Hide My Email relay: a random address its owner has never been shown. */
const APPLE_PRIVATE_RELAY = /@privaterelay\.appleid\.com$/i;

/**
 * What the person types to confirm: the account's email address, which says
 * which account is about to go — unless that address is one they cannot know.
 *
 * Sign in with Apple's "Hide My Email" gives the account an address like
 * `8x7k2m9q4p@privaterelay.appleid.com`. Asking for it would put deletion out
 * of reach of exactly the people who chose privacy, when App Review 5.1.1(v)
 * expects deletion to be easy to find and to finish. They, and any account
 * with no email at all, type DELETE instead.
 */
export function confirmationPhrase(email: string | null | undefined): string {
  const address = (email ?? '').trim();
  return address && !APPLE_PRIVATE_RELAY.test(address) ? address : 'DELETE';
}
