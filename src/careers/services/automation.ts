/**
 * Automation Engine (Phase 3, Module 20). Pure derivations layered on top of
 * the Module 16 reminder engine (services/reminders.ts): resume-freshness
 * and assessment-due reminders, plus weekly/monthly review summaries built
 * entirely from data already in the app — no AI cost, nothing to schedule.
 */

import type { AssessmentRow } from '../types/phase3';
import type { ApplicationStats } from './applications';
import type { ResumeWithVersions } from '../types';
import type { Reminder } from '../types/jobs';

const DAY = 24 * 60 * 60 * 1000;
/** A resume version older than this without a refresh is flagged stale. */
const RESUME_STALE_DAYS = 60;
const ASSESSMENT_LEAD_DAYS = 3;

/** Module 16 extension: assessment-due and resume-outdated reminders. */
export function computeAutomationReminders(
  assessments: AssessmentRow[],
  resumes: ResumeWithVersions[],
  now = new Date()
): Reminder[] {
  const nowMs = now.getTime();
  const reminders: Reminder[] = [];

  for (const a of assessments) {
    if (a.completed_at || !a.due_at) continue;
    const dueMs = new Date(a.due_at).getTime();
    if (!Number.isFinite(dueMs)) continue;
    if (dueMs - nowMs <= ASSESSMENT_LEAD_DAYS * DAY) {
      reminders.push({
        id: `assessment:${a.id}`,
        applicationId: a.application_id ?? '',
        kind: 'assessment_due',
        title: `Assessment due — ${a.title}`,
        dueAt: a.due_at,
        overdue: dueMs < nowMs,
      });
    }
  }

  const latestVersion = (r: ResumeWithVersions) =>
    [...r.versions].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  for (const r of resumes) {
    const v = latestVersion(r);
    if (!v) continue;
    const ageMs = nowMs - new Date(v.updated_at).getTime();
    if (ageMs >= RESUME_STALE_DAYS * DAY) {
      reminders.push({
        id: `resume-outdated:${r.id}`,
        applicationId: '',
        kind: 'resume_outdated',
        title: `“${r.name}” hasn't been refreshed in ${Math.floor(ageMs / DAY)} days`,
        dueAt: v.updated_at,
        overdue: true,
      });
    }
  }

  return reminders.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export interface PeriodicReview {
  period: 'weekly' | 'monthly';
  headline: string;
  bullets: string[];
}

/** A deterministic progress digest — no AI, always available offline. */
export function buildPeriodicReview(stats: ApplicationStats, period: 'weekly' | 'monthly'): PeriodicReview {
  const bullets: string[] = [
    `${stats.applied} application${stats.applied === 1 ? '' : 's'} in motion, ${stats.interviews} at interview stage.`,
    `${stats.offers} offer${stats.offers === 1 ? '' : 's'} so far (${stats.offerRate}% of interviews convert).`,
  ];
  if (stats.avgMatchScore != null) bullets.push(`Average resume match across tracked jobs: ${stats.avgMatchScore}%.`);
  if (stats.interviewRate < 20 && stats.applied >= 5) {
    bullets.push('Interview rate is low relative to applications — consider tailoring your resume more per role.');
  }
  if (!stats.applied) bullets.push('No applications tracked yet — search Jobs and save one to get started.');
  return {
    period,
    headline: period === 'weekly' ? 'Your week in the job search' : 'Your month in the job search',
    bullets,
  };
}
