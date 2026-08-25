/**
 * OpenRouter transport for Careers.
 *
 * The HTTP contract with the `careers-ai` Edge Function lives in
 * `src/lib/ai/transport.ts` — one implementation shared with the Money tools'
 * assistant, so there is exactly one place that knows how to reach OpenRouter.
 * This file is the Careers adapter: it maps the transport's failure kinds onto
 * CareersError, which is what the Careers pipeline and UI already handle.
 */

import { requestCompletion, type AiFailureKind } from '../../lib/ai/transport';
import { CareersError } from '../utils/errors';
import type { AiCompletion, AiProvider, AiRequest } from './provider';

/** The Careers wording for each transport failure. Unchanged from before. */
function careersError(kind: AiFailureKind, message: string): CareersError {
  switch (kind) {
    case 'not-configured':
      return new CareersError(
        'not-setup',
        'AI analysis needs the Supabase backend configured (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).'
      );
    case 'no-session':
      return new CareersError('auth', 'Sign in to use AI analysis.');
    case 'auth':
      return new CareersError('auth', message || 'Sign in to use AI analysis.');
    case 'limit':
      return new CareersError('ai-limit', message || 'AI limit reached. Try again later.');
    // Distinct from 'limit': the quota is not exhausted, the plan does not
    // include this. Telling someone to "try again tomorrow" would be false.
    case 'entitlement':
      return new CareersError(
        'ai-entitlement',
        message || 'FinatriX Careers AI needs a paid plan. See Pricing to upgrade.',
      );
    case 'not-deployed':
      return new CareersError(
        'not-setup',
        'The careers-ai function is not deployed yet. Run "supabase functions deploy careers-ai" (see SETUP.md §5).'
      );
    case 'network':
      return new CareersError('network', 'Could not reach the AI service. Check your connection and try again.');
    case 'empty':
      return new CareersError('ai-response', 'The AI returned an empty answer. Please retry the analysis.');
    default:
      return new CareersError('ai', message || 'AI analysis failed. Please try again.');
  }
}

export const openRouterProvider: AiProvider = {
  id: 'openrouter',
  async complete(req: AiRequest): Promise<AiCompletion> {
    const result = await requestCompletion({
      task: req.task,
      system: req.system,
      user: req.user,
      model: req.model,
      maxTokens: req.maxTokens,
    });
    if (!result.ok) throw careersError(result.kind, result.message);
    const { content, model, ms, promptTokens, completionTokens } = result;
    return { content, model, ms, promptTokens, completionTokens };
  },
};
