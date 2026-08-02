/**
 * Anonymous product analytics. Events carry a name, an optional numeric
 * value and coarse metadata — never a user id, file name, or resume content.
 * Recording is fire-and-forget: analytics can never break a user flow, and
 * users can switch it off in Careers → Settings.
 */

import { supabase } from '../../lib/supabase';

export type CareersEvent =
  | 'upload_started'
  | 'upload_completed'
  | 'upload_failed'
  | 'parse_completed'
  | 'ai_completed'
  | 'resume_score'
  | 'ats_score'
  | 'ocr_used';

let analyticsEnabled = true;

export function setAnalyticsEnabled(enabled: boolean) {
  analyticsEnabled = enabled;
}

export function trackEvent(event: CareersEvent, value?: number, meta?: Record<string, string | number>) {
  if (!analyticsEnabled) return;
  void supabase
    .from('careers_analytics')
    .insert({ event, value: value ?? null, meta: meta ?? {} })
    .then(() => undefined, () => undefined);
}

export interface CareersAggregates {
  totalUploads: number;
  uploadsToday: number;
  failedUploads: number;
  avgResumeScore: number | null;
  avgAtsScore: number | null;
  avgParseMs: number | null;
  avgAiMs: number | null;
}

async function countEvents(event: CareersEvent, sinceIso?: string): Promise<number> {
  let q = supabase.from('careers_analytics').select('id', { count: 'exact', head: true }).eq('event', event);
  if (sinceIso) q = q.gte('created_at', sinceIso);
  const { count, error } = await q;
  return error ? 0 : count ?? 0;
}

async function avgValue(event: CareersEvent, limit = 500): Promise<number | null> {
  const { data, error } = await supabase
    .from('careers_analytics')
    .select('value')
    .eq('event', event)
    .not('value', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data?.length) return null;
  const values = data.map((r) => Number(r.value)).filter(Number.isFinite);
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * The signed-in user's AI calls today (from the edge function's meter).
 *
 * Deliberately UTC, and NOT ymdLocal: `careers_ai_usage.day` is written by the
 * careers-ai edge function, which keys it in UTC, and that meter is what
 * actually enforces the daily limit. Reading it in local time would miss the
 * server's row for the first hours of each day east of UTC and report 0 calls
 * used against a quota that is really being spent. The reader must match the
 * writer; changing this means changing careers-ai/index.ts too.
 */
export async function getAiUsageToday(userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('careers_ai_usage')
    .select('calls')
    .eq('user_id', userId)
    .eq('day', today)
    .maybeSingle();
  return error ? 0 : (data?.calls ?? 0);
}

/** Aggregate stats over the anonymous event stream (Settings page). */
export async function getAggregates(): Promise<CareersAggregates> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [totalUploads, uploadsToday, failedUploads, avgResumeScore, avgAtsScore, avgParseMs, avgAiMs] =
    await Promise.all([
      countEvents('upload_completed'),
      countEvents('upload_completed', todayStart.toISOString()),
      countEvents('upload_failed'),
      avgValue('resume_score'),
      avgValue('ats_score'),
      avgValue('parse_completed'),
      avgValue('ai_completed'),
    ]);
  return { totalUploads, uploadsToday, failedUploads, avgResumeScore, avgAtsScore, avgParseMs, avgAiMs };
}
