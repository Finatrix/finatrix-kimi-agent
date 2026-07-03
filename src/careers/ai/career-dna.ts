/** Career DNA generation — parsed resume in, validated CareerDNA out. */

import type { CareerDNA, ParsedResume } from '../types';
import { getAiProvider } from './provider';
import { buildDnaPrompt } from './prompts';
import { extractJson, validateCareerDNA } from './validate';
import type { AiTaskResult } from './parser';

export async function generateCareerDNA(
  parsed: ParsedResume,
  model = ''
): Promise<AiTaskResult<CareerDNA>> {
  const { system, user } = buildDnaPrompt(parsed);
  const completion = await getAiProvider().complete({
    task: 'dna',
    system,
    user,
    model,
    maxTokens: 3_000,
  });
  return {
    result: validateCareerDNA(extractJson(completion.content)),
    model: completion.model,
    ms: completion.ms,
  };
}
