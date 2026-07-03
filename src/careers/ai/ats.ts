/** ATS compatibility audit — resume text + file name in, validated report out. */

import type { ATSReport } from '../types';
import { getAiProvider } from './provider';
import { buildAtsPrompt } from './prompts';
import { extractJson, validateATSReport } from './validate';
import type { AiTaskResult } from './parser';

export async function analyzeATSWithAI(
  resumeText: string,
  fileName: string,
  model = ''
): Promise<AiTaskResult<ATSReport>> {
  const { system, user } = buildAtsPrompt(resumeText, fileName);
  const completion = await getAiProvider().complete({
    task: 'ats',
    system,
    user,
    model,
    maxTokens: 4_000,
  });
  return {
    result: validateATSReport(extractJson(completion.content)),
    model: completion.model,
    ms: completion.ms,
  };
}
