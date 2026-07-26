// Provider health: derive availability/latency/error-rate from a rolling window
// of events, and decide when to auto-disable an unhealthy provider (with a
// cooldown before retry). Pure state computation; persistence is injected.

import type { HealthEvent, HealthSnapshot, ErrorKind } from './types.ts';

export interface HealthPolicy {
  /** How many recent events define the window. */
  window: number;
  /** Error rate (0–1) above which a provider is auto-disabled. */
  maxErrorRate: number;
  /** Consecutive failures that trip the breaker regardless of rate. */
  maxConsecutiveFailures: number;
  /** Cooldown before a disabled provider is retried (seconds). */
  cooldownSeconds: number;
}

export const DEFAULT_HEALTH_POLICY: HealthPolicy = {
  window: 20,
  maxErrorRate: 0.5,
  maxConsecutiveFailures: 5,
  cooldownSeconds: 300,
};

/** Fold a provider's recent events into a health snapshot + disable decision. */
export function snapshotFor(
  provider: string,
  events: HealthEvent[],
  policy: HealthPolicy = DEFAULT_HEALTH_POLICY,
  now = Date.now(),
): HealthSnapshot {
  const recent = events
    .filter((e) => e.provider === provider)
    .sort((a, b) => a.at - b.at)
    .slice(-policy.window);

  if (recent.length === 0) {
    return {
      provider, available: true, latencyMs: 0, errorRate: 0,
      quotaRemaining: null, jobsRemaining: null,
      lastSuccess: null, lastFailure: null, disabledUntil: null,
    };
  }

  const failures = recent.filter((e) => !e.ok);
  const errorRate = failures.length / recent.length;
  const okEvents = recent.filter((e) => e.ok);
  const latencyMs = okEvents.length
    ? Math.round(okEvents.reduce((s, e) => s + e.ms, 0) / okEvents.length)
    : Math.round(recent.reduce((s, e) => s + e.ms, 0) / recent.length);

  // Consecutive failures counting back from the newest event.
  let consec = 0;
  for (let i = recent.length - 1; i >= 0 && !recent[i].ok; i--) consec++;

  const lastSuccess = [...recent].reverse().find((e) => e.ok)?.at ?? null;
  const lastFailure = [...recent].reverse().find((e) => !e.ok)?.at ?? null;

  const tripped = errorRate >= policy.maxErrorRate || consec >= policy.maxConsecutiveFailures;
  // Only disable if the MOST RECENT event was a failure (a recovering provider
  // that just succeeded should not stay disabled on a stale bad rate).
  const newestFailed = !recent[recent.length - 1].ok;
  const disabledUntil = tripped && newestFailed
    ? new Date(now + policy.cooldownSeconds * 1000).toISOString()
    : null;

  // Quota is a gauge, not a rate: take the newest event that actually observed
  // one. A failed call reports null, and a null must not erase a good reading.
  const lastWith = <K extends 'quotaRemaining' | 'jobsRemaining'>(k: K): number | null => {
    for (let i = recent.length - 1; i >= 0; i--) {
      const v = recent[i][k];
      if (v != null) return v;
    }
    return null;
  };
  const quotaRemaining = lastWith('quotaRemaining');
  const jobsRemaining = lastWith('jobsRemaining');

  return {
    provider,
    available: !disabledUntil,
    latencyMs,
    errorRate: Math.round(errorRate * 100) / 100,
    quotaRemaining,
    jobsRemaining,
    lastSuccess: lastSuccess ? new Date(lastSuccess).toISOString() : null,
    lastFailure: lastFailure ? new Date(lastFailure).toISOString() : null,
    disabledUntil,
  };
}

/** Is a provider currently gated out (disabled and still in cooldown)? */
export function isDisabled(snap: HealthSnapshot | undefined, now = Date.now()): boolean {
  if (!snap || !snap.disabledUntil) return false;
  return now < new Date(snap.disabledUntil).getTime();
}

/** Map an HTTP status / thrown error to a stable ErrorKind for health/metrics. */
export function classifyError(status: number | null, message: string): ErrorKind {
  if (status === 429) return 'rate_limited';
  if (status != null && status >= 500) return 'server_error';
  if (status != null && status >= 400) return 'client_error';
  if (/abort|timed? ?out/i.test(message)) return 'timeout';
  if (/json|unexpected token|parse/i.test(message)) return 'malformed';
  if (/fetch|network|connection|dns|econn/i.test(message)) return 'network';
  return 'unknown';
}
