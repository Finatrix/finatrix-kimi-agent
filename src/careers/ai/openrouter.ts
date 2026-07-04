/**
 * OpenRouter transport. The browser never holds an OpenRouter key: requests
 * go to the `careers-ai` Supabase Edge Function, which authenticates the
 * user's JWT, meters usage, and walks the configured model fallback chain
 * server-side (see supabase/functions/careers-ai/index.ts).
 */

import { supabase } from '../../lib/supabase';
import { logAiUsage } from '../services/aiUsage';
import { CareersError } from '../utils/errors';
import type { AiCompletion, AiProvider, AiRequest } from './provider';

async function errorFromFunction(error: unknown): Promise<CareersError> {
  // FunctionsHttpError carries the raw Response in `context`.
  const ctx = (error as { context?: Response })?.context;
  if (ctx instanceof Response) {
    let message = '';
    try {
      const body = (await ctx.clone().json()) as { error?: string };
      message = typeof body.error === 'string' ? body.error : '';
    } catch {
      /* non-JSON error body */
    }
    if (ctx.status === 401) return new CareersError('auth', message || 'Sign in to use AI analysis.');
    if (ctx.status === 429) return new CareersError('ai-limit', message || 'Daily AI limit reached. Try again tomorrow.');
    if (ctx.status === 404) {
      return new CareersError(
        'not-setup',
        'The careers-ai function is not deployed yet. Run "supabase functions deploy careers-ai" (see SETUP.md §5).'
      );
    }
    return new CareersError('ai', message || 'AI analysis failed. Please try again.');
  }
  const msg = error instanceof Error ? error.message : '';
  if (/fetch|network|Failed to send/i.test(msg)) {
    return new CareersError('network', 'Could not reach the AI service. Check your connection and try again.');
  }
  return new CareersError('ai', 'AI analysis failed. Please try again.');
}

/** Best-effort current user id for usage telemetry — never blocks the AI call. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export const openRouterProvider: AiProvider = {
  id: 'openrouter',
  async complete(req: AiRequest): Promise<AiCompletion> {
    const started = Date.now();
    const { data, error } = await supabase.functions.invoke('careers-ai', {
      body: {
        task: req.task,
        system: req.system,
        user: req.user,
        model: req.model || undefined,
        maxTokens: req.maxTokens,
      },
    });
    if (error) {
      const mapped = await errorFromFunction(error);
      void currentUserId().then((uid) => {
        if (uid) logAiUsage(uid, { task: req.task, model: req.model ?? '', latencyMs: Date.now() - started, success: false, error: mapped.message });
      });
      throw mapped;
    }
    const content = (data as { content?: string })?.content;
    const model = String((data as { model?: string }).model ?? '');
    const ms = Number((data as { ms?: number }).ms ?? 0);
    const promptTokens = Number((data as { promptTokens?: number }).promptTokens ?? 0);
    const completionTokens = Number((data as { completionTokens?: number }).completionTokens ?? 0);
    if (typeof content !== 'string' || !content.trim()) {
      void currentUserId().then((uid) => {
        if (uid) logAiUsage(uid, { task: req.task, model, latencyMs: ms, success: false, error: 'empty response' });
      });
      throw new CareersError('ai-response', 'The AI returned an empty answer. Please retry the analysis.');
    }
    void currentUserId().then((uid) => {
      if (uid) logAiUsage(uid, { task: req.task, model, promptTokens, completionTokens, latencyMs: ms, success: true });
    });
    return { content, model, ms, promptTokens, completionTokens };
  },
};
