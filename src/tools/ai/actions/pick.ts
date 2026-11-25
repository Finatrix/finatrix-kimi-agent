/**
 * Ask the picker what a message wants done.
 *
 * Resolves with "none" whenever the picker cannot help — not deployed yet,
 * over the daily limit, offline, or a reply that is not a plan — so the
 * message goes on to the chat exactly as it did before actions existed.
 */
import { requestCompletion } from '../../../lib/ai/transport';
import { ACTION_SYSTEM_PROMPT, ACTION_TASK, buildActionMessage } from './prompt';
import { parsePlan, resolvePlan, type ResolveContext, type Resolution } from './plan';
import { SCREENS } from './screens';

/** A plan is a few short fields. The server's floor is 256. */
const MAX_OUTPUT_TOKENS = 256;

export async function pickAction(ctx: ResolveContext): Promise<Resolution> {
  const result = await requestCompletion({
    task: ACTION_TASK,
    system: ACTION_SYSTEM_PROMPT,
    user: buildActionMessage(ctx.utterance, { categories: ctx.categories, screens: SCREENS }),
    maxTokens: MAX_OUTPUT_TOKENS,
    // An on-device reply that names no known action goes to the cloud instead.
    acceptLocal: (content) => parsePlan(content) != null,
  });
  if (!result.ok) return { kind: 'none' };
  return resolvePlan(parsePlan(result.content), ctx);
}
