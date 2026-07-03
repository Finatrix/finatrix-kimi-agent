/** AI resume parsing — extracted text in, validated ParsedResume out. */

import type { ParsedResume } from '../types';
import { getAiProvider } from './provider';
import { buildParsePrompt } from './prompts';
import { extractJson, validateParsedResume } from './validate';

export interface AiTaskResult<T> {
  result: T;
  model: string;
  ms: number;
}

export async function parseResumeWithAI(
  resumeText: string,
  model = ''
): Promise<AiTaskResult<ParsedResume>> {
  const { system, user } = buildParsePrompt(resumeText);
  const completion = await getAiProvider().complete({
    task: 'parse',
    system,
    user,
    model,
    maxTokens: 8_000,
  });
  return {
    result: validateParsedResume(extractJson(completion.content)),
    model: completion.model,
    ms: completion.ms,
  };
}
