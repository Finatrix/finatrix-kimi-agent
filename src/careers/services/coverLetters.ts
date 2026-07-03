/** Cover letter generation (cached) + library CRUD. */

import { supabase } from '../../lib/supabase';
import { generateCoverLetterWithAI } from '../ai/tasks-jobs';
import { coverLetterText } from '../ai/validate-jobs';
import type { ResumeVersionRow } from '../types';
import type { CoverLetterRow, CoverLetterSections, CoverLetterTone } from '../types/jobs';
import { CareersError, mapSupabaseError, withRetry } from '../utils/errors';
import { sha256OfText } from '../utils/hash';
import { sanitizeField, sanitizeProse } from '../utils/sanitize';
import { getCachedAnalysis, saveAnalysis } from './analysisCache';

export async function generateCoverLetter(
  userId: string,
  version: ResumeVersionRow,
  input: {
    jobText: string;
    company: string;
    jobTitle: string;
    tone: CoverLetterTone;
    extraInstructions?: string;
    applicationId?: string;
    jobId?: string;
    matchScore?: number | null;
  },
  model = ''
): Promise<CoverLetterRow> {
  if (!version.parsed) {
    throw new CareersError('validation', 'Pick a fully analysed resume version first.');
  }
  const cacheBasis = `${version.raw_text}\n::CL::${input.tone}::${input.company}::${input.jobTitle}::${input.extraInstructions ?? ''}\n${input.jobText}`;
  const sha = await sha256OfText(cacheBasis);
  let sections = await getCachedAnalysis<CoverLetterSections>(userId, sha, 'cover-letter').catch(() => null);
  if (!sections) {
    const { result, model: usedModel, ms } = await withRetry(
      () =>
        generateCoverLetterWithAI(
          version.parsed!, version.career_dna, input.jobText,
          input.company, input.jobTitle, input.tone, input.extraInstructions ?? '', model
        ),
      { attempts: 2 }
    );
    sections = result;
    await saveAnalysis(userId, version.id, sha, 'cover-letter', usedModel, result, ms).catch(() => undefined);
  }

  const { data, error } = await supabase
    .from('cover_letters')
    .insert({
      user_id: userId,
      application_id: input.applicationId ?? null,
      job_id: input.jobId ?? null,
      resume_version_id: version.id,
      name: `${input.jobTitle || 'Cover letter'} — ${input.company || 'company'}`.slice(0, 120),
      company: sanitizeField(input.company, 200),
      job_title: sanitizeField(input.jobTitle, 200),
      tone: sanitizeField(String(input.tone), 40),
      sections,
      content_text: coverLetterText(sections),
      match_score: input.matchScore ?? null,
    })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving the cover letter');
  return data as CoverLetterRow;
}

export async function listCoverLetters(userId: string): Promise<CoverLetterRow[]> {
  const { data, error } = await supabase
    .from('cover_letters')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading cover letters');
  return (data ?? []) as CoverLetterRow[];
}

export async function updateCoverLetter(
  userId: string,
  id: string,
  patch: Partial<Pick<CoverLetterRow, 'name' | 'content_text' | 'archived'>>
): Promise<CoverLetterRow> {
  const clean: typeof patch = { ...patch };
  if (clean.name != null) clean.name = sanitizeField(clean.name, 120);
  if (clean.content_text != null) clean.content_text = sanitizeProse(clean.content_text, 12_000);
  const { data, error } = await supabase
    .from('cover_letters')
    .update(clean)
    .eq('user_id', userId)
    .eq('id', id)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Updating the cover letter');
  return data as CoverLetterRow;
}

export async function duplicateCoverLetter(userId: string, letter: CoverLetterRow): Promise<CoverLetterRow> {
  const { data, error } = await supabase
    .from('cover_letters')
    .insert({
      user_id: userId,
      application_id: letter.application_id,
      job_id: letter.job_id,
      resume_version_id: letter.resume_version_id,
      name: `${letter.name} (copy)`.slice(0, 120),
      company: letter.company,
      job_title: letter.job_title,
      tone: letter.tone,
      sections: letter.sections,
      content_text: letter.content_text,
      match_score: letter.match_score,
    })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Duplicating the cover letter');
  return data as CoverLetterRow;
}

export async function deleteCoverLetter(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('cover_letters').delete().eq('user_id', userId).eq('id', id);
  if (error) throw mapSupabaseError(error, 'Deleting the cover letter');
}
