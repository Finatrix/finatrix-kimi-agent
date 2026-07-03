/**
 * Feature flag / entitlement architecture (premium-ready, everything
 * currently unlocked). Flags come from the global careers_feature_flags
 * table; a missing table or row fails open so the free experience is never
 * blocked by configuration.
 */

import { supabase } from '../../lib/supabase';
import type { FeatureFlagRow } from '../types/jobs';

export type FeatureId =
  | 'resume_versions' | 'ai_analyses' | 'cover_letters' | 'interview_sessions'
  | 'job_searches' | 'job_tracking' | 'company_intelligence' | 'ai_coaching';

let cache: Map<string, FeatureFlagRow> | null = null;

export async function loadFeatureFlags(): Promise<Map<string, FeatureFlagRow>> {
  if (cache) return cache;
  const { data, error } = await supabase.from('careers_feature_flags').select('*');
  cache = new Map(((error ? [] : data) ?? []).map((f) => [f.flag, f as FeatureFlagRow]));
  return cache;
}

/** Whether a feature is available. Unknown flags default to enabled. */
export async function isFeatureEnabled(id: FeatureId): Promise<boolean> {
  const flags = await loadFeatureFlags();
  return flags.get(id)?.enabled ?? true;
}

/** Usage limit for the free plan; null = unlimited (current default for all). */
export async function featureLimit(id: FeatureId): Promise<number | null> {
  const flags = await loadFeatureFlags();
  return flags.get(id)?.free_limit ?? null;
}

/** Test hook / sign-out reset. */
export function resetFeatureFlagCache(): void {
  cache = null;
}
