/**
 * Interview preparation: personalised question sets (cached), STAR answer
 * building, mock interview sessions and AI feedback — all persisted in
 * interview_sessions so progress survives reloads.
 */

import { supabase } from '../../lib/supabase';
import {
  buildStarWithAI,
  generateQuestionsWithAI,
  interviewFeedbackWithAI,
} from '../ai/tasks-jobs';
import type { ResumeVersionRow } from '../types';
import type {
  InterviewAnswer,
  InterviewFeedback,
  InterviewQuestion,
  InterviewSessionRow,
  StarAnswer,
} from '../types/jobs';
import { CareersError, mapSupabaseError, withRetry } from '../utils/errors';
import { sha256OfText } from '../utils/hash';
import { getCachedAnalysis, saveAnalysis } from './analysisCache';

export async function listSessions(userId: string): Promise<InterviewSessionRow[]> {
  const { data, error } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw mapSupabaseError(error, 'Loading interview sessions');
  return (data ?? []) as InterviewSessionRow[];
}

export async function createSession(
  userId: string,
  version: ResumeVersionRow,
  input: {
    kind: 'prep' | 'mock';
    roleTitle: string;
    jobText: string;
    difficulty: 'easy' | 'medium' | 'hard';
    count: number;
    applicationId?: string;
    jobId?: string;
  },
  model = ''
): Promise<InterviewSessionRow> {
  if (!version.parsed) {
    throw new CareersError('validation', 'Pick a fully analysed resume version first.');
  }
  const sha = await sha256OfText(
    `${version.raw_text}\n::IQ::${input.roleTitle}::${input.difficulty}::${input.count}\n${input.jobText}`
  );
  let questions = await getCachedAnalysis<InterviewQuestion[]>(userId, sha, 'interview-questions').catch(() => null);
  if (!questions) {
    const { result, model: usedModel, ms } = await withRetry(
      () =>
        generateQuestionsWithAI(
          version.parsed!, version.career_dna, input.jobText,
          input.roleTitle, input.difficulty, input.count, model
        ),
      { attempts: 2 }
    );
    questions = result;
    await saveAnalysis(userId, version.id, sha, 'interview-questions', usedModel, result, ms).catch(() => undefined);
  }

  const { data, error } = await supabase
    .from('interview_sessions')
    .insert({
      user_id: userId,
      application_id: input.applicationId ?? null,
      job_id: input.jobId ?? null,
      kind: input.kind,
      role_title: input.roleTitle.slice(0, 200),
      difficulty: input.difficulty,
      questions,
      answers: [],
    })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Starting the session');
  return data as InterviewSessionRow;
}

export async function saveAnswers(
  userId: string,
  sessionId: string,
  answers: InterviewAnswer[]
): Promise<InterviewSessionRow> {
  const { data, error } = await supabase
    .from('interview_sessions')
    .update({ answers })
    .eq('user_id', userId)
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving your answers');
  return data as InterviewSessionRow;
}

export async function buildStarAnswer(
  version: ResumeVersionRow,
  question: string,
  userDraft: string,
  model = ''
): Promise<StarAnswer> {
  if (!version.parsed) {
    throw new CareersError('validation', 'Pick a fully analysed resume version first.');
  }
  const { result } = await withRetry(
    () => buildStarWithAI(version.parsed!, version.career_dna, question, userDraft, model),
    { attempts: 2 }
  );
  return result;
}

/** Score a completed mock interview and close the session. */
export async function completeMock(
  userId: string,
  session: InterviewSessionRow,
  model = ''
): Promise<InterviewSessionRow> {
  const answered = session.answers.filter((a) => a.text.trim());
  if (answered.length < Math.min(3, session.questions.length)) {
    throw new CareersError('validation', 'Answer at least three questions before requesting feedback.');
  }
  const pairs = answered.map((a) => ({
    question: session.questions.find((q) => q.id === a.questionId)?.question ?? '',
    answer: a.text,
  }));
  const { result: feedback } = await withRetry(
    () => interviewFeedbackWithAI(session.questions, pairs, model),
    { attempts: 2 }
  );
  const { data, error } = await supabase
    .from('interview_sessions')
    .update({
      feedback,
      score: feedback.overall,
      completed_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', session.id)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving your feedback');
  return data as InterviewSessionRow;
}

export async function deleteSession(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('interview_sessions').delete().eq('user_id', userId).eq('id', id);
  if (error) throw mapSupabaseError(error, 'Deleting the session');
}

/** Completed mock scores, oldest → newest (career health input). */
export function sessionScores(sessions: InterviewSessionRow[]): number[] {
  return sessions
    .filter((s): s is InterviewSessionRow & { score: number } => s.score != null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((s) => s.score);
}

export type { InterviewFeedback };
