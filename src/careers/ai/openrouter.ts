/**
 * OpenRouter transport. The browser never holds an OpenRouter key: requests
 * go to the `careers-ai` Supabase Edge Function, which authenticates the
 * user's JWT, meters usage, and walks the configured model fallback chain
 * server-side (see supabase/functions/careers-ai/index.ts).
 */

import { supabase } from '../../lib/supabase';
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

export const openRouterProvider: AiProvider = {
  id: 'openrouter',
  async complete(req: AiRequest): Promise<AiCompletion> {
    const { data, error } = await supabase.functions.invoke('careers-ai', {
      body: {
        task: req.task,
        system: req.system,
        user: req.user,
        model: req.model || undefined,
        maxTokens: req.maxTokens,
      },
    });
    if (error) throw await errorFromFunction(error);
    const content = (data as { content?: string })?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new CareersError('ai-response', 'The AI returned an empty answer. Please retry the analysis.');
    }
    return {
      content,
      model: String((data as { model?: string }).model ?? ''),
      ms: Number((data as { ms?: number }).ms ?? 0),
    };
  },
};
