/**
 * Resume + version persistence (PostgREST via the shared Supabase client).
 * All rows are RLS-protected; every query still filters by user_id for
 * defense in depth. Errors are mapped to CareersError so raw PostgREST
 * messages never reach the UI.
 */

import { supabase } from '../../lib/supabase';
import type {
  ParsedResume,
  ResumeRow,
  ResumeVersionRow,
  ResumeWithVersions,
} from '../types';
import { mapSupabaseError } from '../utils/errors';
import { removeResumeFiles } from './storage';

// ─────────────────────────── reads ───────────────────────────

export async function listResumes(userId: string): Promise<ResumeWithVersions[]> {
  const { data, error } = await supabase
    .from('resumes')
    .select('*, versions:resume_versions(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading your resumes');
  const rows = (data ?? []) as ResumeWithVersions[];
  for (const r of rows) {
    r.versions.sort((a, b) => b.version_number - a.version_number);
  }
  return rows;
}

export async function getVersion(userId: string, versionId: string): Promise<ResumeVersionRow | null> {
  const { data, error } = await supabase
    .from('resume_versions')
    .select('*')
    .eq('user_id', userId)
    .eq('id', versionId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error, 'Loading the resume version');
  return (data as ResumeVersionRow) ?? null;
}

/** Duplicate-upload detection: any version of this user with the same bytes. */
export async function findVersionBySha(userId: string, sha256: string): Promise<ResumeVersionRow | null> {
  const { data, error } = await supabase
    .from('resume_versions')
    .select('*')
    .eq('user_id', userId)
    .eq('sha256', sha256)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw mapSupabaseError(error, 'Checking for duplicate uploads');
  return (data as ResumeVersionRow) ?? null;
}

/** How many versions reference a storage path (files can be shared by duplicates). */
export async function countPathReferences(userId: string, path: string): Promise<number> {
  const { count, error } = await supabase
    .from('resume_versions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('file_path', path);
  if (error) throw mapSupabaseError(error, 'Checking stored files');
  return count ?? 0;
}

// ─────────────────────────── resume families ───────────────────────────

export async function createResume(
  userId: string,
  fields: { name: string; industry?: string; notes?: string }
): Promise<ResumeRow> {
  const { data, error } = await supabase
    .from('resumes')
    .insert({
      user_id: userId,
      name: fields.name,
      industry: fields.industry ?? '',
      notes: fields.notes ?? '',
    })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Creating the resume');
  return data as ResumeRow;
}

export async function updateResume(
  userId: string,
  resumeId: string,
  patch: Partial<Pick<ResumeRow, 'name' | 'industry' | 'notes' | 'is_favorite' | 'is_archived' | 'current_version_id'>>
): Promise<ResumeRow> {
  const { data, error } = await supabase
    .from('resumes')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', resumeId)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Updating the resume');
  return data as ResumeRow;
}

/**
 * Delete a resume family: rows cascade in the database; storage files are
 * removed only when no surviving version still references the same path.
 */
export async function deleteResume(userId: string, resume: ResumeWithVersions): Promise<void> {
  const paths = [...new Set(resume.versions.map((v) => v.file_path).filter(Boolean))];
  const { error } = await supabase
    .from('resumes')
    .delete()
    .eq('user_id', userId)
    .eq('id', resume.id);
  if (error) throw mapSupabaseError(error, 'Deleting the resume');
  const orphaned: string[] = [];
  for (const path of paths) {
    if ((await countPathReferences(userId, path).catch(() => 1)) === 0) orphaned.push(path);
  }
  await removeResumeFiles(orphaned);
}

/**
 * Duplicate a resume family. The copy shares the original's stored file
 * (originals are immutable) and carries over the latest version's analysis.
 */
export async function duplicateResume(
  userId: string,
  source: ResumeWithVersions
): Promise<ResumeRow> {
  const copy = await createResume(userId, {
    name: `${source.name} (copy)`,
    industry: source.industry,
    notes: source.notes,
  });
  const latest = source.versions[0];
  if (latest) {
    const version = await insertVersion(userId, {
      resume_id: copy.id,
      version_number: 1,
      file_name: latest.file_name,
      file_path: latest.file_path,
      file_size: latest.file_size,
      file_type: latest.file_type,
      sha256: latest.sha256,
      stage: latest.stage,
      status: latest.status,
      error: latest.error,
      extraction_method: latest.extraction_method,
      raw_text: latest.raw_text,
      parsed: latest.parsed,
      resume_score: latest.resume_score,
      score_breakdown: latest.score_breakdown,
      ats_score: latest.ats_score,
      ats_report: latest.ats_report,
      career_dna: latest.career_dna,
      parse_ms: latest.parse_ms,
      ai_ms: latest.ai_ms,
    });
    await updateResume(userId, copy.id, { current_version_id: version.id });
    if (latest.parsed) await saveNormalizedEntities(userId, version.id, latest.parsed);
  }
  return copy;
}

// ─────────────────────────── versions ───────────────────────────

type VersionInsert = Partial<Omit<ResumeVersionRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>> &
  Pick<ResumeVersionRow, 'resume_id' | 'version_number' | 'file_name' | 'file_path'>;

export async function insertVersion(userId: string, fields: VersionInsert): Promise<ResumeVersionRow> {
  const { data, error } = await supabase
    .from('resume_versions')
    .insert({ user_id: userId, ...fields })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving the resume version');
  return data as ResumeVersionRow;
}

export async function updateVersion(
  userId: string,
  versionId: string,
  patch: Partial<Omit<ResumeVersionRow, 'id' | 'user_id' | 'resume_id' | 'created_at' | 'updated_at'>>
): Promise<ResumeVersionRow> {
  const { data, error } = await supabase
    .from('resume_versions')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', versionId)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving analysis results');
  return data as ResumeVersionRow;
}

export async function deleteVersion(userId: string, version: ResumeVersionRow): Promise<void> {
  const { error } = await supabase
    .from('resume_versions')
    .delete()
    .eq('user_id', userId)
    .eq('id', version.id);
  if (error) throw mapSupabaseError(error, 'Deleting the version');
  if (version.file_path && (await countPathReferences(userId, version.file_path).catch(() => 1)) === 0) {
    await removeResumeFiles([version.file_path]);
  }
}

export async function nextVersionNumber(userId: string, resumeId: string): Promise<number> {
  const { data, error } = await supabase
    .from('resume_versions')
    .select('version_number')
    .eq('user_id', userId)
    .eq('resume_id', resumeId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw mapSupabaseError(error, 'Preparing the new version');
  return ((data as { version_number: number } | null)?.version_number ?? 0) + 1;
}

// ─────────────────── normalized entity rows ───────────────────

/**
 * Rebuild the normalized rows (skills, experience, …) for a version from its
 * parsed JSON. Idempotent: clears and re-inserts, so re-running a pipeline
 * stage never duplicates rows.
 */
export async function saveNormalizedEntities(
  userId: string,
  versionId: string,
  parsed: ParsedResume
): Promise<void> {
  const tables = [
    'resume_skills',
    'resume_experience',
    'resume_education',
    'resume_projects',
    'resume_certifications',
  ] as const;
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId).eq('version_id', versionId);
    if (error) throw mapSupabaseError(error, 'Saving resume details');
  }

  const skillRows = (
    [
      ['technical', parsed.skills.technical],
      ['soft', parsed.skills.soft],
      ['business', parsed.skills.business],
      ['leadership', parsed.skills.leadership],
      ['tool', parsed.skills.tools],
      ['framework', parsed.skills.frameworks],
      ['language', parsed.skills.programmingLanguages],
      ['technical', parsed.skills.cloudPlatforms],
      ['technical', parsed.skills.databases],
    ] as const
  ).flatMap(([category, names]) =>
    names.map((name) => ({ user_id: userId, version_id: versionId, name, category }))
  );

  const inserts: Array<{ table: string; rows: Record<string, unknown>[] }> = [
    { table: 'resume_skills', rows: skillRows },
    {
      table: 'resume_experience',
      rows: parsed.experience.map((e, i) => ({
        user_id: userId, version_id: versionId, sort_order: i,
        company: e.company, title: e.title, location: e.location,
        start_date: e.startDate, end_date: e.endDate, is_current: e.isCurrent,
        summary: e.summary, highlights: e.highlights,
      })),
    },
    {
      table: 'resume_education',
      rows: parsed.education.map((e, i) => ({
        user_id: userId, version_id: versionId, sort_order: i,
        institution: e.institution, degree: e.degree, field: e.field,
        start_date: e.startDate, end_date: e.endDate, grade: e.grade,
      })),
    },
    {
      table: 'resume_projects',
      rows: parsed.projects.map((p, i) => ({
        user_id: userId, version_id: versionId, sort_order: i,
        name: p.name, description: p.description, technologies: p.technologies, url: p.url,
      })),
    },
    {
      table: 'resume_certifications',
      rows: parsed.certifications.map((c, i) => ({
        user_id: userId, version_id: versionId, sort_order: i,
        name: c.name, issuer: c.issuer, issue_date: c.issueDate,
        expiry_date: c.expiryDate, credential_id: c.credentialId,
      })),
    },
  ];

  for (const { table, rows } of inserts) {
    if (!rows.length) continue;
    const { error } = await supabase.from(table).insert(rows);
    if (error) throw mapSupabaseError(error, 'Saving resume details');
  }
}
