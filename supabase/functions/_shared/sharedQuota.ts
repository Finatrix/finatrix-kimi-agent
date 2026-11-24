/** The service-role client's RPC, narrowed so this file stays free of the SDK import. */
interface QuotaClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * A stable quota key for an IP that does not put the address in the database.
 * Keyed, because an unsalted hash of an IPv4 address is trivially reversible.
 */
export async function privateQuotaKey(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(mac.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Count one hit against a limit every isolate shares, unlike `rateLimited`, whose
 * state is per isolate and which production traffic rarely trips. `'over'` when
 * the limit is exceeded, `'unavailable'` when the quota store could not answer,
 * so the caller decides whether to degrade open or closed.
 */
export async function sharedQuotaState(
  admin: QuotaClient,
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<'ok' | 'over' | 'unavailable'> {
  try {
    const { data, error } = await admin.rpc('increment_provider_quota', {
      p_scope: scope,
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) return 'unavailable';
    return Number(data) === -1 ? 'over' : 'ok';
  } catch {
    return 'unavailable';
  }
}

/**
 * True when a shared limit is exceeded. Degrades open: a quota-store outage
 * must not take the feature down, and the per-user daily meters still apply.
 */
export async function overSharedQuota(
  admin: QuotaClient,
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  return (await sharedQuotaState(admin, scope, key, limit, windowSeconds)) === 'over';
}
