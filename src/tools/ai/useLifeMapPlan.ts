/**
 * Fetching a LifeMap plan, once per profile.
 *
 * LifeMap renders the engine's own ordering immediately and upgrades in place
 * when a plan arrives. That ordering is never a placeholder — it is what the
 * tool has always shown, and it stays on screen unchanged if the user is signed
 * out, the quota is spent, or the request fails. Nothing here is allowed to
 * gate the page on a model call.
 *
 * Caching is by profile, not by page view. A plan depends only on the fields in
 * `planCacheKey`, so re-entering LifeMap, switching tabs or reloading reuses the
 * stored answer, and editing the profile is what earns a fresh call. One entry
 * is deliberate: there is one profile at a time, so a new key evicting the old
 * one is the correct lifetime rather than a limitation.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { getJSON, setJSON } from '../lib/storage';
import type { Decision, LifeProfile } from '../lib/lifemap';
import { planCacheKey, requestPlan, type LifeMapPlan } from './lifemapPlan';

const CACHE_KEY = 'fx_lifemap_plan';

interface CacheEntry {
  key: string;
  plan: LifeMapPlan;
}

export type PlanStatus =
  /** No request made yet. */
  | 'idle'
  /** In flight — the engine ordering is on screen meanwhile. */
  | 'loading'
  /** A plan is applied. */
  | 'ready'
  /** The request did not produce a plan; the engine ordering stands. */
  | 'fallback';

export interface UseLifeMapPlan {
  plan: LifeMapPlan | null;
  status: PlanStatus;
  /** Why there is no plan, phrased for display. Empty unless status is 'fallback'. */
  message: string;
}

/**
 * @param profile  Null before the user has launched; no request is made.
 * @param decisions The engine catalogue. Ranking is meaningless without it.
 * @param enabled  Lets the caller hold the request back (e.g. a disabled flag).
 */
export function useLifeMapPlan(
  profile: LifeProfile | null,
  decisions: Decision[],
  enabled = true
): UseLifeMapPlan {
  const key = useMemo(
    () => (enabled && profile && decisions.length > 0 ? planCacheKey(profile) : null),
    [enabled, profile, decisions]
  );

  /* A cache hit is a synchronous read of storage keyed by the profile — a value
     derivable while rendering, not an event to react to. Deriving it here rather
     than in an effect means a stored plan is on screen in the first paint of the
     results, with no flash of the unranked list and no cascading render. */
  const cached = useMemo(() => {
    if (!key) return null;
    const entry = getJSON<CacheEntry | null>(CACHE_KEY, null);
    return entry && entry.key === key && entry.plan ? entry.plan : null;
  }, [key]);

  /* Results that arrive later. Both carry the key they belong to, so a reply for
     a profile the user has already edited is ignored rather than attributed to
     the new numbers. */
  const [fetched, setFetched] = useState<CacheEntry | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);

  /**
   * The key we have already requested. Without it, every re-render that produced
   * a new `decisions` array identity would fire another billable request for an
   * answer we already hold.
   */
  const requestedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!key || cached || !profile) return;
    if (requestedKey.current === key) return;
    requestedKey.current = key;

    let live = true;
    void requestPlan(profile, decisions).then((result) => {
      if (!live) return;
      if (result.ok) {
        setFetched({ key, plan: result.plan });
        setJSON(CACHE_KEY, { key, plan: result.plan } satisfies CacheEntry);
      } else {
        setFailed({ key, message: result.message });
        // A retryable failure is not remembered: the next mount may succeed
        // (a restored connection, a completed sign-in).
        if (result.retryable) requestedKey.current = null;
      }
    });

    return () => { live = false; };
  }, [key, cached, profile, decisions]);

  const plan = cached ?? (fetched && fetched.key === key ? fetched.plan : null);
  const failure = failed && failed.key === key ? failed : null;

  const status: PlanStatus = plan ? 'ready' : failure ? 'fallback' : key ? 'loading' : 'idle';
  return { plan, status, message: failure?.message ?? '' };
}
