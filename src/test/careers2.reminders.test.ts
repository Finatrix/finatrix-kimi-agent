import { describe, it, expect } from 'vitest';
import { computeReminders } from '../careers/services/reminders';
import type { ApplicationRow } from '../careers/types/jobs';

const NOW = new Date('2026-07-03T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

function app(over: Partial<ApplicationRow>): ApplicationRow {
  return {
    id: 'a1', user_id: 'u', job_id: null, company_id: null, contact_id: null,
    resume_version_id: null, cover_letter_id: null,
    company_name: 'Acme', job_title: 'Analyst', department: '', salary_text: '',
    employment_type: '', location: '', work_mode: '', visa_sponsorship: '',
    source: '', job_url: '', stage: 'saved', priority: 'medium', tags: [], notes: '',
    match_score: null, ats_score: null, applied_at: null, closes_at: null,
    interview_at: null, offer_expires_at: null, next_action_at: null, archived: false,
    created_at: days(-10), updated_at: days(-1),
    ...over,
  };
}

describe('computeReminders', () => {
  it('warns about approaching deadlines', () => {
    const r = computeReminders([app({ closes_at: days(2) })], NOW);
    expect(r.some((x) => x.kind === 'deadline')).toBe(true);
  });

  it('stays silent for far-future deadlines', () => {
    const r = computeReminders([app({ closes_at: days(30) })], NOW);
    expect(r.some((x) => x.kind === 'deadline')).toBe(false);
  });

  it('reminds about upcoming interviews', () => {
    const r = computeReminders([app({ stage: 'technical_interview', interview_at: days(1) })], NOW);
    expect(r.some((x) => x.kind === 'interview')).toBe(true);
  });

  it('flags expiring offers only in offer stages', () => {
    expect(computeReminders([app({ stage: 'offer_received', offer_expires_at: days(1) })], NOW)
      .some((x) => x.kind === 'offer_expiry')).toBe(true);
    expect(computeReminders([app({ stage: 'applied', offer_expires_at: days(1) })], NOW)
      .some((x) => x.kind === 'offer_expiry')).toBe(false);
  });

  it('suggests follow-up after a week of silence post-apply', () => {
    const r = computeReminders([app({ stage: 'applied', applied_at: days(-8) })], NOW);
    expect(r.some((x) => x.kind === 'follow_up' && x.overdue)).toBe(true);
    expect(computeReminders([app({ stage: 'applied', applied_at: days(-2) })], NOW)
      .some((x) => x.kind === 'follow_up')).toBe(false);
  });

  it('flags stale active applications, never archived ones', () => {
    expect(computeReminders([app({ stage: 'phone_screening', updated_at: days(-20) })], NOW)
      .some((x) => x.kind === 'inactive')).toBe(true);
    expect(computeReminders([app({ stage: 'phone_screening', updated_at: days(-20), archived: true })], NOW)).toEqual([]);
    expect(computeReminders([app({ stage: 'rejected', updated_at: days(-20) })], NOW)
      .some((x) => x.kind === 'inactive')).toBe(false);
  });

  it('produces stable ids for notification dedupe', () => {
    const a = app({ closes_at: days(1) });
    const first = computeReminders([a], NOW);
    const second = computeReminders([a], NOW);
    expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id));
  });
});
