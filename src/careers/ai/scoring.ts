/** Resume Score — resume text in, validated 0–100 category report out. */

import type { ResumeScoreReport } from '../types';
import { getAiProvider } from './provider';
import { buildScorePrompt } from './prompts';
import { extractJson, validateResumeScore } from './validate';
import type { AiTaskResult } from './parser';

export async function scoreResumeWithAI(
  resumeText: string,
  model = ''
): Promise<AiTaskResult<ResumeScoreReport>> {
  const { system, user } = buildScorePrompt(resumeText);
  const completion = await getAiProvider().complete({
    task: 'score',
    system,
    user,
    model,
    maxTokens: 4_000,
  });
  return {
    result: validateResumeScore(extractJson(completion.content)),
    model: completion.model,
    ms: completion.ms,
  };
}
