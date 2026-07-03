/**
 * Applications CRM. Every mutation that changes meaning (creation, stage
 * moves, notes) appends an immutable application_history event — the table
 * has no update/delete policy, so the timeline can never be rewritten.
 */

import { supabase } from '../../lib/supabase';
import type {
  ApplicationHistoryRow,
  ApplicationRow,
  ApplicationStage,
} from '../types/jobs';
import { APPLICATION_STAGES, INTERVIEW_STAGES, STAGE_LABELS } from '../types/jobs';
import { CareersError, mapSupabaseError } from '../utils/errors';
import { sanitizeField, sanitizeProse } from '../utils/sanitize';

export async function listApplications(userId: string): Promise<ApplicationRow[]> {
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw mapSupabaseError(error, 'Loading applications');
  return (data ?? []) as ApplicationRow[];
}

export async function createApplication(
  userId: string,
  fields: Partial<ApplicationRow> & { company_name: string; job_title: string }
): Promise<ApplicationRow> {
  const { data, error } = await supabase
    .from('applications')
    .insert({
      user_id: userId,
      ...fields,
      company_name: sanitizeField(fields.company_name, 200),
      job_title: sanitizeField(fields.job_title, 200),
      notes: sanitizeProse(fields.notes ?? '', 5_000),
      stage: fields.stage && (APPLICATION_STAGES as readonly string[]).includes(fields.stage)
        ? fields.stage
        : 'saved',
    })
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Creating the application');
  const app = data as ApplicationRow;
  await appendHistory(userId, app.id, {
    event: 'created',
    to_stage: app.stage,
    body: `Tracked “${app.job_title}” at ${app.company_name}`,
  });
  return app;
}

export async function updateApplication(
  userId: string,
  id: string,
  patch: Partial<ApplicationRow>
): Promise<ApplicationRow> {
  const { data, error } = await supabase
    .from('applications')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', id)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Updating the application');
  return data as ApplicationRow;
}

/** Move an application through the pipeline, recording the transition. */
export async function moveStage(
  userId: string,
  app: ApplicationRow,
  to: ApplicationStage,
  note = ''
): Promise<ApplicationRow> {
  if (!(APPLICATION_STAGES as readonly string[]).includes(to)) {
    throw new CareersError('validation', 'Unknown application stage.');
  }
  if (to === app.stage) return app;
  const patch: Partial<ApplicationRow> = { stage: to };
  if (to === 'applied' && !app.applied_at) patch.applied_at = new Date().toISOString();
  if (to === 'archived') patch.archived = true;
  const updated = await updateApplication(userId, app.id, patch);
  await appendHistory(userId, app.id, {
    event: 'stage_change',
    from_stage: app.stage,
    to_stage: to,
    body: note || `Moved to ${STAGE_LABELS[to]}`,
  });
  return updated;
}

export async function addApplicationNote(
  userId: string,
  applicationId: string,
  body: string
): Promise<void> {
  await appendHistory(userId, applicationId, {
    event: 'note',
    body: sanitizeProse(body, 3_000),
  });
}

export async function deleteApplication(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('applications').delete().eq('user_id', userId).eq('id', id);
  if (error) throw mapSupabaseError(error, 'Deleting the application');
}

async function appendHistory(
  userId: string,
  applicationId: string,
  fields: { event: string; from_stage?: string; to_stage?: string; body?: string; meta?: Record<string, unknown> }
): Promise<void> {
  const { error } = await supabase.from('application_history').insert({
    user_id: userId,
    application_id: applicationId,
    event: fields.event,
    from_stage: fields.from_stage ?? '',
    to_stage: fields.to_stage ?? '',
    body: fields.body ?? '',
    meta: fields.meta ?? {},
  });
  if (error) throw mapSupabaseError(error, 'Recording the timeline event');
}

export async function getHistory(userId: string, applicationId: string): Promise<ApplicationHistoryRow[]> {
  const { data, error } = await supabase
    .from('application_history')
    .select('*')
    .eq('user_id', userId)
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true });
  if (error) throw mapSupabaseError(error, 'Loading the timeline');
  return (data ?? []) as ApplicationHistoryRow[];
}

// ─────────────────────────── analytics ───────────────────────────

export interface ApplicationStats {
  total: number;
  saved: number;
  applied: number;
  interviews: number;
  assessments: number;
  offers: number;
  accepted: number;
  rejections: number;
  withdrawn: number;
  avgMatchScore: number | null;
  avgAtsScore: number | null;
  successRate: number;   // offers / applied, %
  interviewRate: number; // interviews / applied, %
  offerRate: number;     // offers / interviews, %
  monthlyTrend: { month: string; count: number }[];
}

/** Pure aggregation over application rows (dashboard + reports). */
export function computeApplicationStats(apps: ApplicationRow[]): ApplicationStats {
  const applied = apps.filter((a) => a.applied_at || !['saved', 'preparing_resume', 'preparing_cover_letter', 'ready_to_apply'].includes(a.stage));
  const interviews = apps.filter(
    (a) => (INTERVIEW_STAGES as readonly string[]).includes(a.stage) ||
      ['offer_received', 'negotiating', 'offer_accepted', 'offer_declined', 'reference_check'].includes(a.stage) ||
      a.interview_at != null
  );
  const offers = apps.filter((a) => ['offer_received', 'negotiating', 'offer_accepted', 'offer_declined'].includes(a.stage));
  const avg = (values: (number | null)[]): number | null => {
    const nums = values.filter((v): v is number => v != null);
    return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
  };
  const trend = new Map<string, number>();
  for (const a of apps) {
    const month = a.created_at.slice(0, 7);
    trend.set(month, (trend.get(month) ?? 0) + 1);
  }
  const pct = (num: number, den: number) => (den ? Math.round((num / den) * 100) : 0);
  return {
    total: apps.length,
    saved: apps.filter((a) => a.stage === 'saved').length,
    applied: applied.length,
    interviews: interviews.length,
    assessments: apps.filter((a) => ['technical_assessment', 'online_assessment'].includes(a.stage)).length,
    offers: offers.length,
    accepted: apps.filter((a) => a.stage === 'offer_accepted').length,
    rejections: apps.filter((a) => a.stage === 'rejected').length,
    withdrawn: apps.filter((a) => a.stage === 'withdrawn').length,
    avgMatchScore: avg(apps.map((a) => a.match_score)),
    avgAtsScore: avg(apps.map((a) => a.ats_score)),
    successRate: pct(offers.length, applied.length),
    interviewRate: pct(interviews.length, applied.length),
    offerRate: pct(offers.length, interviews.length),
    monthlyTrend: [...trend.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
      .map(([month, count]) => ({ month, count })),
  };
}
