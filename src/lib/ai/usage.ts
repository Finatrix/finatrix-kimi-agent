/**
 * AI usage telemetry — shared by every module that talks to a model.
 *
 * Originally lived in `careers/services/aiUsage.ts`; it moved here unchanged
 * when the Money tools gained an assistant, so both surfaces meter against the
 * same `ai_usage_log` table with the same cost model. The Careers service
 * re-exports these so its own imports and the admin dashboard are untouched.
 */

import { supabase } from '../supabase';

/** USD per 1,000 tokens, blended prompt+completion. Update as pricing changes. */
const PRICE_PER_1K_TOKENS: Record<string, number> = {
  'google/gemini-2.5-flash': 0.0002,
  'anthropic/claude-sonnet-5': 0.006,
  'openai/gpt-5.5': 0.005,
  'moonshotai/kimi-k2': 0.0006,
  'qwen/qwen3-235b-a22b-2507': 0.0004,
};
const DEFAULT_PRICE_PER_1K = 0.0005;

export function estimateCost(model: string, totalTokens: number): number {
  const rate = PRICE_PER_1K_TOKENS[model] ?? DEFAULT_PRICE_PER_1K;
  return Math.round(((totalTokens / 1000) * rate) * 1_000_000) / 1_000_000;
}

/** Fire-and-forget usage log — never throws, never blocks the caller. */
export function logAiUsage(userId: string, fields: {
  task: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
  cacheHit?: boolean;
  success?: boolean;
  error?: string;
}): void {
  const promptTokens = fields.promptTokens ?? 0;
  const completionTokens = fields.completionTokens ?? 0;
  const totalTokens = promptTokens + completionTokens;
  void supabase.from('ai_usage_log').insert({
    user_id: userId,
    task: fields.task.slice(0, 60),
    model: fields.model.slice(0, 120),
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    latency_ms: Math.max(0, Math.round(fields.latencyMs)),
    cache_hit: fields.cacheHit ?? false,
    success: fields.success ?? true,
    error: (fields.error ?? '').slice(0, 300),
    cost_estimate: estimateCost(fields.model, totalTokens),
  }).then(() => undefined, () => undefined);
}
