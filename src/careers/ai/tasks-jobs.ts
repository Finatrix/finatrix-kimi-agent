/**
 * Phase 2 AI task functions. Each follows the Phase 1 contract exactly:
 * prompt builder → AI provider layer (edge function → OpenRouter) →
 * extractJson → strict validator → typed result. The UI never calls the
 * provider directly.
 */

import type { CareerDNA, ParsedResume } from '../types';
import type {
  CoachContext,
  CoverLetterSections,
  CoverLetterTone,
  InterviewFeedback,
  InterviewQuestion,
  JobAnalysis,
  JobKeywordReport,
  StarAnswer,
  TailoringReport,
} from '../types/jobs';
import { getAiProvider } from './provider';
import type { AiTaskResult } from './parser';
import { extractJson } from './validate';
import {
  buildAssistantPrompt,
  buildCoachPrompt,
  buildCoverLetterPrompt,
  buildInterviewFeedbackPrompt,
  buildInterviewQuestionsPrompt,
  buildJobAnalysisPrompt,
  buildMatchPrompt,
  buildStarPrompt,
  buildTailorPrompt,
  resumeDigest,
} from './prompts-jobs';
import {
  validateAiMatch,
  validateAssistantAnswer,
  validateCoach,
  validateCoverLetter,
  validateInterviewFeedback,
  validateJobAnalysis,
  validateQuestions,
  validateStar,
  validateTailoring,
  type AiMatchPart,
  type CoachAiPart,
} from './validate-jobs';

async function run<T>(
  task: string,
  prompt: { system: string; user: string },
  validate: (raw: Record<string, unknown>) => T,
  model: string,
  maxTokens: number
): Promise<AiTaskResult<T>> {
  const completion = await getAiProvider().complete({
    task: task as 'parse', // edge function treats task ids as opaque labels
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

export function analyzeJobWithAI(
  jobText: string,
  model = ''
): Promise<AiTaskResult<{ analysis: JobAnalysis; keywords: JobKeywordReport }>> {
  return run('job-analysis', buildJobAnalysisPrompt(jobText), validateJobAnalysis, model, 6_000);
}

export function matchResumeWithAI(
  parsed: ParsedResume,
  dna: CareerDNA | null,
  analysis: JobAnalysis,
  jobText: string,
  model = ''
): Promise<AiTaskResult<AiMatchPart>> {
  const digest = resumeDigest(parsed, dna);
  return run('job-match', buildMatchPrompt(digest, analysis, jobText), validateAiMatch, model, 5_000);
}

export function tailorResumeWithAI(
  parsed: ParsedResume,
  dna: CareerDNA | null,
  jobText: string,
  model = ''
): Promise<AiTaskResult<TailoringReport>> {
  return run('tailor', buildTailorPrompt(resumeDigest(parsed, dna), jobText), validateTailoring, model, 6_000);
}

export function generateCoverLetterWithAI(
  parsed: ParsedResume,
  dna: CareerDNA | null,
  jobText: string,
  company: string,
  jobTitle: string,
  tone: CoverLetterTone,
  extraInstructions = '',
  model = '',
  length = 'standard'
): Promise<AiTaskResult<CoverLetterSections>> {
  return run(
    'cover-letter',
    buildCoverLetterPrompt(resumeDigest(parsed, dna), jobText, company, jobTitle, tone, extraInstructions, length),
    validateCoverLetter,
    model,
    3_000
  );
}

export function generateQuestionsWithAI(
  parsed: ParsedResume,
  dna: CareerDNA | null,
  jobText: string,
  roleTitle: string,
  difficulty: string,
  count: number,
  model = ''
): Promise<AiTaskResult<InterviewQuestion[]>> {
  return run(
    'interview-questions',
    buildInterviewQuestionsPrompt(resumeDigest(parsed, dna), jobText, roleTitle, difficulty, count),
    validateQuestions,
    model,
    5_000
  );
}

export function buildStarWithAI(
  parsed: ParsedResume,
  dna: CareerDNA | null,
  question: string,
  userDraft = '',
  model = '',
  knowledge = ''
): Promise<AiTaskResult<StarAnswer>> {
  return run(
    'star',
    buildStarPrompt(resumeDigest(parsed, dna), question, userDraft, knowledge),
    validateStar,
    model,
    2_500
  );
}

export function interviewFeedbackWithAI(
  questions: InterviewQuestion[],
  answers: { question: string; answer: string }[],
  model = ''
): Promise<AiTaskResult<InterviewFeedback>> {
  return run(
    'interview-feedback',
    buildInterviewFeedbackPrompt(questions, answers),
    validateInterviewFeedback,
    model,
    3_000
  );
}

export function coachReportWithAI(
  context: CoachContext,
  focus: string,
  model = ''
): Promise<AiTaskResult<CoachAiPart>> {
  return run('coach', buildCoachPrompt(context, focus), validateCoach, model, 6_000);
}

export function assistantAnswerWithAI(
  context: CoachContext,
  question: string,
  model = ''
): Promise<AiTaskResult<{ answer: string; references: string[] }>> {
  return run('assistant', buildAssistantPrompt(context, question), validateAssistantAnswer, model, 1_500);
}
