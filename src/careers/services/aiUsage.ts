/**
 * AI Usage Intelligence (Phase 4, Module 5). Every AI task call logs one row
 * — model, tokens, latency, cache hit, success — via `logAiUsage`, which the
 * shared AI transport calls fire-and-forget (never blocks the user-facing
 * result on telemetry).
 *
 * `logAiUsage` and `estimateCost` now live in `src/lib/ai/usage.ts` so the
 * Money tools' assistant meters against the same table with the same cost
 * model; they are re-exported here unchanged. The reporting queries below stay
 * Careers-owned because only the Careers admin dashboard reads them.
 */

import { supabase } from '../../lib/supabase';
import { mapSupabaseError } from '../utils/errors';
import type { AiUsageLogRow, AiUsageSummary } from '../types/phase4';

export { estimateCost, logAiUsage } from '../../lib/ai/usage';

export async function listMyUsage(userId: string, days = 30): Promise<AiUsageLogRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('ai_usage_log')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw mapSupabaseError(error, 'Loading AI usage');
  return (data ?? []) as AiUsageLogRow[];
}

/** Admin-only: usage across every user (RLS enforces the admin check). */
export async function listAllUsage(days = 30): Promise<AiUsageLogRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('ai_usage_log')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw mapSupabaseError(error, 'Loading platform AI usage');
  return (data ?? []) as AiUsageLogRow[];
}

/** Pure aggregation — used identically for the per-user and admin-wide views. */
export function summarizeUsage(rows: AiUsageLogRow[]): AiUsageSummary {
  const totalCalls = rows.length;
  const totalTokens = rows.reduce((s, r) => s + r.total_tokens, 0);
  const totalCost = Math.round(rows.reduce((s, r) => s + r.cost_estimate, 0) * 1_000_000) / 1_000_000;
  const avgLatencyMs = totalCalls ? Math.round(rows.reduce((s, r) => s + r.latency_ms, 0) / totalCalls) : 0;
  const cacheHitRate = totalCalls ? Math.round((rows.filter((r) => r.cache_hit).length / totalCalls) * 100) : 0;
  const failureRate = totalCalls ? Math.round((rows.filter((r) => !r.success).length / totalCalls) * 100) : 0;

  const modelMap = new Map<string, { calls: number; tokens: number; cost: number }>();
  const taskMap = new Map<string, number>();
  const dayMap = new Map<string, { calls: number; tokens: number }>();
  for (const r of rows) {
    const m = modelMap.get(r.model) ?? { calls: 0, tokens: 0, cost: 0 };
    m.calls += 1; m.tokens += r.total_tokens; m.cost += r.cost_estimate;
    modelMap.set(r.model, m);

    taskMap.set(r.task, (taskMap.get(r.task) ?? 0) + 1);

    const day = r.created_at.slice(0, 10);
    const d = dayMap.get(day) ?? { calls: 0, tokens: 0 };
    d.calls += 1; d.tokens += r.total_tokens;
    dayMap.set(day, d);
  }

  return {
    totalCalls,
    totalTokens,
    totalCost,
    avgLatencyMs,
    cacheHitRate,
    failureRate,
    byModel: [...modelMap.entries()].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.calls - a.calls),
    byTask: [...taskMap.entries()].map(([task, calls]) => ({ task, calls })).sort((a, b) => b.calls - a.calls),
    dailyTrend: [...dayMap.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
  };
}
