/**
 * Resume Tailoring Engine persistence (Phase 3, Module 3). The AI tailoring
 * call itself (tailorResumeWithAI) is unchanged from Phase 2 — this module
 * adds the missing piece: proposals are saved, section-by-section acceptance
 * is tracked, and the original resume_versions row is NEVER mutated.
 */

import { supabase } from '../../lib/supabase';
import type { TailoringReport } from '../types/jobs';
import type { ResumeTailoredVersionRow } from '../types/phase3';
import { mapSupabaseError } from '../utils/errors';
import { sha256OfText } from '../utils/hash';

export async function saveTailoredVersion(
  userId: string,
  resumeVersionId: string,
  jobText: string,
  report: TailoringReport,
  target: { applicationId?: string; jobId?: string } = {}
): Promise<ResumeTailoredVersionRow> {
  const job_text_sha256 = await sha256OfText(jobText.toLowerCase());
  const { data, error } = await supabase
    .from('resume_tailored_versions')
    .insert({
      user_id: userId,
      resume_version_id: resumeVersionId,
      application_id: target.applicationId ?? null,
      job_id: target.jobId ?? null,
      job_text_sha256,
      report,
      accepted_sections: [],
    })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving the tailored resume');
  return data as ResumeTailoredVersionRow;
}

export async function listTailoredVersions(userId: string, resumeVersionId?: string): Promise<ResumeTailoredVersionRow[]> {
  let query = supabase.from('resume_tailored_versions').select('*').eq('user_id', userId);
  if (resumeVersionId) query = query.eq('resume_version_id', resumeVersionId);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading tailored resumes');
  return (data ?? []) as ResumeTailoredVersionRow[];
}

/** Toggle whether the user accepted one proposed section (side-by-side review). */
export async function setSectionAccepted(
  userId: string,
  id: string,
  section: string,
  accepted: boolean,
  currentAccepted: string[]
): Promise<ResumeTailoredVersionRow> {
  const next = accepted
    ? [...new Set([...currentAccepted, section])]
    : currentAccepted.filter((s) => s !== section);
  const { data, error } = await supabase
    .from('resume_tailored_versions')
    .update({ accepted_sections: next })
    .eq('user_id', userId)
    .eq('id', id)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Updating accepted sections');
  return data as ResumeTailoredVersionRow;
}

export async function deleteTailoredVersion(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('resume_tailored_versions').delete().eq('user_id', userId).eq('id', id);
  if (error) throw mapSupabaseError(error, 'Deleting the tailored version');
}
