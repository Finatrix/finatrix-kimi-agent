/**
 * Careers subscription gate — UX layer only. Signed-in users without a paid
 * plan see CareersProPaywall instead of the requested Careers page.
 *
 * NOT the security boundary. What this comment used to claim, and what is
 * actually true, differ enough to be worth stating plainly:
 *
 *   • It named `checkQuota` as "the actual enforcement". `checkQuota` is a pure
 *     function in `services/subscriptions.ts` whose only production caller is
 *     `BillingPage`, where it renders a usage bar. It gates nothing, anywhere.
 *   • It named own-row RLS on `subscriptions` as the other half. Own-row RLS is
 *     what lets a user write their OWN subscription row — including `plan_id`.
 *     "You may only edit your own subscription" is not the same claim as "you
 *     may not grant yourself one", and this gate reads `plan_id` from exactly
 *     that row.
 *
 * So: this gate decides which screen you see, and nothing server-side currently
 * re-checks the plan before spending money on AI. Treat it as UX until the
 * `subscriptions` UPDATE policy constrains `plan_id` and `careers-ai` checks
 * entitlement — see docs/SECURITY-TODO.md.
 *
 * Re-checks on every /careers/* navigation (not just once per mount) rather
 * than caching for the session: the one path this matters is landing back
 * from Stripe Checkout and navigating into Careers moments later, before a
 * cached "unsubscribed" read would otherwise go stale.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { getMySubscription } from '../services/subscriptions';
import { useRole } from '../hooks/useRole';
import { PageLoading } from './states';
import CareersProPaywall from '../pages/CareersProPaywall';

/** Paid tiers per the product decision: Free grants no Careers access. */
const PAID_PLAN_IDS = new Set(['student', 'professional', 'premium', 'enterprise']);

export function CareersPaywallGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const location = useLocation();
  /**
   * The last answer, tagged with the account it was fetched for.
   *
   * The answer is deliberately NOT cleared per navigation — re-checking without
   * throwing up a spinner is the whole point (see the header). But it used to be
   * a bare status with no owner, so on a shared device the previous account's
   * answer survived the switch: sign out of a subscribed account, sign in to a
   * free one, and the new user was shown the Careers app for as long as their own
   * check took. Data stayed safe — RLS is the boundary, not this — but the wrong
   * screen is still the wrong screen.
   *
   * Tagging the answer lets `status` below derive staleness during render, which
   * is both simpler than resetting it from the effect and the only version React
   * is happy with (setState in an effect body cascades a render).
   */
  const [answer, setAnswer] = useState<{ uid: string; paid: boolean } | null>(null);

  // The one exemption: the Stripe return trip. Checkout's success_url points
  // here with a `checkout=` param — BillingPage owns confirming payment and
  // redirecting on into Careers once the webhook has actually landed.
  const isBillingReturn = location.pathname === '/careers/billing' && location.search.includes('checkout=');

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    const uid = user.id;
    (async () => {
      try {
        const sub = await getMySubscription(uid);
        if (!cancelled) setAnswer({ uid, paid: !!sub && PAID_PLAN_IDS.has(sub.plan_id) });
      } catch {
        if (!cancelled) setAnswer({ uid, paid: false }); // fail closed on the UX layer too
      }
    })();
    return () => { cancelled = true; };
    // Re-runs per navigation within /careers (not just per user) — see file header.
  }, [user, location.pathname]);

  // An answer belonging to a different account is not a stale answer, it is
  // somebody else's — so it reads as "still loading" rather than as a verdict.
  const status: 'loading' | 'subscribed' | 'unsubscribed' =
    !user || !answer || answer.uid !== user.id
      ? 'loading'
      : answer.paid ? 'subscribed' : 'unsubscribed';

  if (isAdmin || isBillingReturn) return <>{children}</>;
  if (roleLoading || status === 'loading') return <PageLoading />;
  if (status === 'unsubscribed') return <CareersProPaywall />;
  return <>{children}</>;
}
