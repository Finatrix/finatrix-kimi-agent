/** The service-role client's RPC, narrowed so this file stays free of the SDK import. */
interface QuotaClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Count one hit against a limit every isolate shares, unlike `rateLimited`, whose
 * state is per isolate and which production traffic rarely trips. True when the
 * limit is exceeded. Degrades open: a quota-store outage must not take the
 * feature down, and the per-user daily meters still apply.
 */
export async function overSharedQuota(
  admin: QuotaClient,
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('increment_provider_quota', {
      p_scope: scope,
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    return !error && Number(data) === -1;
  } catch {
    return false;
  }
}
