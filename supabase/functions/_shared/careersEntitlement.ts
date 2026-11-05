/**
 * Who may spend money through a Careers edge function.
 *
 * The paywall and launch switch in the app are UX gates: a direct call to the
 * function never passes through them, so this is the check that counts. Fails
 * closed when the answer cannot be read, because each call costs real money.
 */

export const PAID_PLAN_IDS: readonly string[] = ['student', 'professional', 'premium', 'enterprise'];

interface EntitlementUser {
  id: string;
  app_metadata?: Record<string, unknown>;
}

/** The caller's own JWT-scoped client, so RLS decides what it can read. */
export interface EntitlementClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        in(column: string, values: string[]): {
          maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
}

export type Entitlement =
  | { allowed: true }
  | { allowed: false; status: 403 | 503; reason: 'not-launched' | 'not-subscribed' | 'unavailable' };

export async function checkCareersEntitlement(
  client: EntitlementClient,
  user: EntitlementUser,
  careersAvailable: boolean,
  now = Date.now(),
): Promise<Entitlement> {
  const { data: isAdmin, error: adminError } = await client.rpc('is_platform_admin', { uid: user.id });
  if (adminError) return { allowed: false, status: 503, reason: 'unavailable' };
  if (isAdmin === true) return { allowed: true };

  // `app_metadata` is writable only by the service role, so nobody can set this themselves.
  if (!careersAvailable && user.app_metadata?.careers_beta !== true) {
    return { allowed: false, status: 403, reason: 'not-launched' };
  }

  const { data, error } = await client
    .from('subscriptions')
    .select('plan_id, current_period_end')
    .eq('user_id', user.id)
    .in('status', ['trialing', 'active', 'past_due'])
    .maybeSingle();
  if (error) return { allowed: false, status: 503, reason: 'unavailable' };

  const sub = data as { plan_id?: string; current_period_end?: string | null } | null;
  const paid = !!sub?.plan_id && PAID_PLAN_IDS.includes(sub.plan_id);
  // expire_subscriptions() demotes lapsed rows on a schedule; this covers the gap between runs.
  const lapsed = !!sub?.current_period_end && new Date(sub.current_period_end).getTime() < now;
  return paid && !lapsed ? { allowed: true } : { allowed: false, status: 403, reason: 'not-subscribed' };
}
