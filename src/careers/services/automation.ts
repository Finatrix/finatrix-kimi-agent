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

const plural = (n: number) => (n === 1 ? '' : 's');

/**
 * A deterministic progress digest — no AI, always available offline.
 *
 * `stats.applied` counts applications actually *submitted*; `stats.total`
 * counts everything tracked, including rows still sitting in saved/preparing.
 * The digest used to treat the two as the same thing and told users with saved
 * applications that they had none tracked, directly contradicting the
 * Applications page next door. Emptiness is now keyed off `total`, and the
 * saved-but-unsent backlog gets its own honest line.
 */
export function buildPeriodicReview(stats: ApplicationStats, period: 'weekly' | 'monthly'): PeriodicReview {
  const headline = period === 'weekly' ? 'Your week in the job search' : 'Your month in the job search';

  if (!stats.total) {
    return {
      period,
      headline,
      bullets: ['No applications tracked yet — search Jobs and save one to get started.'],
    };
  }

  const bullets: string[] = [
    `${stats.total} application${plural(stats.total)} tracked — ${stats.applied} submitted, ${stats.interviews} at interview stage.`,
  ];

  const unsent = stats.total - stats.applied;
  if (unsent > 0) {
    bullets.push(
      `${unsent} saved but not submitted yet — sending ${unsent === 1 ? 'it' : 'them'} is the fastest way to move the needle.`
    );
  }

  // A conversion rate over zero interviews says nothing; omit it until there is
  // something to convert.
  bullets.push(
    stats.interviews > 0
      ? `${stats.offers} offer${plural(stats.offers)} so far (${stats.offerRate}% of interviews convert).`
      : `${stats.offers} offer${plural(stats.offers)} so far.`
  );

  if (stats.avgMatchScore != null) bullets.push(`Average resume match across tracked jobs: ${stats.avgMatchScore}%.`);
  if (stats.interviewRate < 20 && stats.applied >= 5) {
    bullets.push('Interview rate is low relative to applications — consider tailoring your resume more per role.');
  }

  return { period, headline, bullets };
}
