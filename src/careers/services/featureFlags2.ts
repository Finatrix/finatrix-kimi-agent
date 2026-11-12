/**
 * Enterprise Feature Flags (Phase 4, Module 3). Global flags already exist
 * in careers_feature_flags (Phase 2); this layers scoped overrides on top —
 * per-user, per-org, per-plan, beta cohorts, and kill switches — resolved
 * entirely client-side from data the client already has cached, so toggling
 * a flag never needs a deploy.
 *
 * Resolution order (first match wins): kill-switch → user → org → plan → global.
 *
 * A KILL SWITCH IS FOR EVERYONE
 * -----------------------------
 * The client can only resolve from the rows it is allowed to read, and a
 * signed-in user reads the rows that are not about one person plus the rows
 * about themselves (the `feature_flag_overrides_select` policy). A kill switch
 * saved under `user:<someone>` would reach that one account and nobody else.
 * So a kill switch is never stored under the scope that was picked: it is one
 * row per flag under `global:*`, which every signed-in user reads.
 */

import { supabase } from '../../lib/supabase';
import { mapSupabaseError } from '../utils/errors';
import type { FeatureFlagOverrideRow, FlagOverrideScope, FlagScope } from '../types/phase4';
import type { FeatureFlagRow } from '../types/jobs';

/** Where a kill switch is stored: one row per flag, readable by every signed-in user. */
export const KILL_SWITCH_SCOPE: FlagOverrideScope = 'global';
export const KILL_SWITCH_SCOPE_ID = '*';

/** The scope and id an override is stored under. A kill switch is never scoped. */
export function overrideTarget(
  scope: FlagScope,
  scopeId: string,
  isKillSwitch: boolean
): { scope: FlagOverrideScope; scope_id: string } {
  return isKillSwitch
    ? { scope: KILL_SWITCH_SCOPE, scope_id: KILL_SWITCH_SCOPE_ID }
    : { scope, scope_id: scopeId };
}

export async function listGlobalFlags(): Promise<FeatureFlagRow[]> {
  const { data, error } = await supabase.from('careers_feature_flags').select('*');
  if (error) throw mapSupabaseError(error, 'Loading feature flags');
  return (data ?? []) as FeatureFlagRow[];
}

export async function listFlagOverrides(): Promise<FeatureFlagOverrideRow[]> {
  const { data, error } = await supabase.from('feature_flag_overrides').select('*');
  if (error) throw mapSupabaseError(error, 'Loading feature flag overrides');
  return (data ?? []) as FeatureFlagOverrideRow[];
}

export async function setFlagOverride(
  flag: string,
  scope: FlagScope,
  scopeId: string,
  fields: { enabled?: boolean; rolloutPercent?: number; isBeta?: boolean; isKillSwitch?: boolean }
): Promise<void> {
  const isKillSwitch = fields.isKillSwitch ?? false;
  const { error } = await supabase.from('feature_flag_overrides').upsert(
    {
      flag,
      ...overrideTarget(scope, scopeId, isKillSwitch),
      enabled: fields.enabled ?? true,
      rollout_percent: fields.rolloutPercent ?? 100,
      is_beta: fields.isBeta ?? false,
      is_kill_switch: isKillSwitch,
    },
    { onConflict: 'flag,scope,scope_id' }
  );
  if (error) throw mapSupabaseError(error, 'Saving the flag override');
}

export async function deleteFlagOverride(id: string): Promise<void> {
  const { error } = await supabase.from('feature_flag_overrides').delete().eq('id', id);
  if (error) throw mapSupabaseError(error, 'Deleting the flag override');
}

/** Deterministic 0-99 bucket for percentage rollout — stable per user per flag. */
function rolloutBucket(userId: string, flag: string): number {
  const s = `${flag}:${userId}`;
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return hash % 100;
}

export interface FlagContext {
  userId: string;
  orgId?: string;
  planId?: string;
}

/**
 * Resolve one flag's effective on/off state. Pure function — safe to call on
 * every render; callers cache the flags/overrides lists once per session.
 */
export function resolveFlag(
  flag: string,
  globalFlags: FeatureFlagRow[],
  overrides: FeatureFlagOverrideRow[],
  ctx: FlagContext
): boolean {
  const forFlag = overrides.filter((o) => o.flag === flag);

  // A kill switch decides the flag for everyone. The one saved for everyone
  // wins over any older one that was saved under a scope.
  const killSwitches = forFlag.filter((o) => o.is_kill_switch);
  const killSwitch = killSwitches.find((o) => o.scope === KILL_SWITCH_SCOPE) ?? killSwitches[0];
  if (killSwitch) return killSwitch.enabled;

  const userOverride = forFlag.find((o) => o.scope === 'user' && o.scope_id === ctx.userId);
  if (userOverride) return withinRollout(userOverride, flag, ctx.userId);

  if (ctx.orgId) {
    const orgOverride = forFlag.find((o) => o.scope === 'org' && o.scope_id === ctx.orgId);
    if (orgOverride) return withinRollout(orgOverride, flag, ctx.userId);
  }

  if (ctx.planId) {
    const planOverride = forFlag.find((o) => o.scope === 'plan' && o.scope_id === ctx.planId);
    if (planOverride) return withinRollout(planOverride, flag, ctx.userId);
  }

  const global = globalFlags.find((f) => f.flag === flag);
  return global?.enabled ?? true; // unknown flags default open, consistent with Phase 2
}

function withinRollout(override: FeatureFlagOverrideRow, flag: string, userId: string): boolean {
  if (!override.enabled) return false;
  if (override.rollout_percent >= 100) return true;
  if (override.rollout_percent <= 0) return false;
  return rolloutBucket(userId, flag) < override.rollout_percent;
}
