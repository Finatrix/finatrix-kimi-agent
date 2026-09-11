/**
 * AI usage telemetry — shared by every module that talks to a model.
 *
 * Originally lived in `careers/services/aiUsage.ts`; it moved here unchanged
 * when the Money tools gained an assistant, so both surfaces meter against the
 * same `ai_usage_log` table with the same cost model. The Careers service
 * re-exports these so its own imports and the admin dashboard are untouched.
 */

import { supabase } from '../supabase';

/**
 * USD per 1,000 tokens, IN and OUT separately. Checked against OpenRouter's
 * published prices on 12 September 2026.
 *
 * Separate rates rather than one blended figure because output costs four to
 * six times input on every model here, and the two mixes this product produces
 * are nothing alike: a money-chat answer is a long data snapshot in and a short
 * answer out, while a résumé parse is short in and long out. One blended rate
 * flattered the first and understated the second — and both token counts are
 * already recorded, so the accurate sum costs nothing.
 */
const PRICE_PER_1K: Record<string, { in: number; out: number }> = {
  'google/gemini-2.5-flash': { in: 0.0003, out: 0.0025 },
  'google/gemini-3.8-flash': { in: 0.00075, out: 0.00375 },
  'anthropic/claude-haiku-4.5': { in: 0.001, out: 0.005 },
  'anthropic/claude-sonnet-5': { in: 0.002, out: 0.010 },
  'anthropic/claude-opus-5': { in: 0.005, out: 0.025 },
  'openai/gpt-5.5': { in: 0.005, out: 0.030 },
  'openai/gpt-5-mini': { in: 0.00025, out: 0.002 },
  'moonshotai/kimi-k2': { in: 0.00057, out: 0.0023 },
  'deepseek/deepseek-chat-v3.1': { in: 0.00025, out: 0.00095 },
  'qwen/qwen3-235b-a22b-2507': { in: 0.00022, out: 0.00088 },
};
/** An unpriced model: the middle of the range above, so it is never free. */
const DEFAULT_PRICE = { in: 0.001, out: 0.005 };

/**
 * Estimated USD for one call. `completionTokens` may be omitted, in which case
 * the whole count is priced at the input rate — an underestimate, and the
 * honest one, since nothing else is known.
 */
export function estimateCost(model: string, promptTokens: number, completionTokens = 0): number {
  const rate = PRICE_PER_1K[model] ?? DEFAULT_PRICE;
  const usd = (promptTokens / 1000) * rate.in + (completionTokens / 1000) * rate.out;
  return Math.round(usd * 1_000_000) / 1_000_000;
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
    cost_estimate: estimateCost(fields.model, promptTokens, completionTokens),
  }).then(() => undefined, () => undefined);
}
