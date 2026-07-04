/**
 * Phase 3 AI task functions: email generator (Module 5) and offer analysis
 * (Module 13). Same prompt → provider → extractJson → validate → typed
 * result contract as tasks-jobs.ts.
 */

import type { CareerDNA, ParsedResume } from '../types';
import type { EmailKind, GeneratedEmailContent, OfferAnalysis, OfferRow } from '../types/phase3';
import { getAiProvider } from './provider';
import type { AiTaskResult } from './parser';
import { extractJson } from './validate';
import { buildEmailPrompt, buildOfferAnalysisPrompt } from './prompts-phase3';
import { resumeDigest } from './prompts-jobs';
import { validateGeneratedEmail, validateOfferAnalysis } from './validate-phase3';

async function run<T>(
  task: string,
  prompt: { system: string; user: string },
  validate: (raw: Record<string, unknown>) => T,
  model: string,
  maxTokens: number
): Promise<AiTaskResult<T>> {
  const completion = await getAiProvider().complete({
    task: task as 'parse',
    system: prompt.system,
    user: prompt.user,
    model,
    maxTokens,
  });
  return {
    result: validate(extractJson(completion.content)),
    model: completion.model,
    ms: completion.ms,
  };
}

export function generateEmailWithAI(
  kind: EmailKind,
  parsed: ParsedResume,
  dna: CareerDNA | null,
  context: { company: string; jobTitle: string; recipientName: string; extra: string },
  model = ''
): Promise<AiTaskResult<GeneratedEmailContent>> {
  return run('email', buildEmailPrompt(kind, parsed, dna, context), validateGeneratedEmail, model, 1_500);
}

export function analyzeOfferWithAI(
  offer: Pick<OfferRow, 'company_name' | 'job_title' | 'base_salary' | 'bonus' | 'equity' | 'currency' | 'benefits' | 'visa_sponsorship' | 'work_mode' | 'notice_period'>,
  parsed: ParsedResume,
  dna: CareerDNA | null,
  model = ''
): Promise<AiTaskResult<OfferAnalysis>> {
  return run(
    'offer-analysis',
    buildOfferAnalysisPrompt(JSON.stringify(offer), resumeDigest(parsed, dna)),
    validateOfferAnalysis,
    model,
    2_000
  );
}
