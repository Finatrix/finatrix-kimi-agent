/**
 * Careers subscription gate — UX layer only. Signed-in users without a paid
 * plan see CareersProPaywall instead of the requested Careers page.
 *
 * NOT the security boundary: server-side RLS on subscriptions/billing_history
 * (own-row-or-admin) and per-feature quota checks (checkQuota) remain the
 * actual enforcement. This gate can fail open in a UI sense (a bug here shows
 * the wrong screen) but can never grant data access — that's Postgres's job.
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
