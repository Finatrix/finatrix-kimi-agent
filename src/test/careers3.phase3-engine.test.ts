/**
 * Phase 3 — Application Intelligence Engine regression tests. Covers the
 * pure, deterministic logic added across the 20 modules: career health
 * readiness scores (Module 18), automation reminders + periodic review
 * (Module 20), calendar ICS export (Module 15), and the task/networking
 * derivation helpers (Modules 6/7/14).
 */

import { describe, expect, it } from 'vitest';
import { computeCareerHealth } from '../careers/services/health';
import { buildPeriodicReview, computeAutomationReminders } from '../careers/services/automation';
import { buildIcs } from '../careers/services/calendar';
import { dueFollowUps } from '../careers/services/networking';
import { overdueTasks, upcomingTasks } from '../careers/services/tasks';
import { computeApplicationStats } from '../careers/services/applications';
import type { CoachContext } from '../careers/types/jobs';
import type { AssessmentRow } from '../careers/types/phase3';
import type { ResumeWithVersions } from '../careers/types';

function baseContext(over: Partial<CoachContext> = {}): CoachContext {
  return {
    profile: {},
    careerDna: null,
    resumeScore: 50,
    atsScore: 50,
    topSkills: [],
    applicationStats: { total: 0, applied: 0, interviews: 0, offers: 0 } as unknown as CoachContext['applicationStats'],
    recentApplications: [],
    interviewScores: [],
    learningProgress: 0,
    ...over,
  };
}

describe('career health — promotion & role readiness (Module 18)', () => {
  it('scores low readiness for a bare-minimum profile', () => {
    const health = computeCareerHealth(baseContext());
    expect(health.promotionReadiness).toBeLessThan(50);
    expect(health.roleReadiness).toBeLessThan(50);
  });

  it('scores high readiness for a strong profile', () => {
    const health = computeCareerHealth(baseContext({
      resumeScore: 90,
      atsScore: 90,
      topSkills: ['SQL', 'Python', 'Risk', 'AML', 'KYC', 'Excel', 'SAS', 'Basel', 'Audit', 'Compliance'],
      careerDna: { traits: [], strengths: [], weaknesses: [], recommendedIndustries: [], suitableRoles: [], personalitySummary: '' },
      interviewScores: [85, 90, 88],
      learningProgress: 80,
      applicationStats: { total: 10, applied: 8, interviews: 5, offers: 2 } as unknown as CoachContext['applicationStats'],
    }));
    expect(health.promotionReadiness).toBeGreaterThan(70);
    expect(health.roleReadiness).toBeGreaterThan(70);
  });

  it('keeps readiness within 0-100', () => {
    const health = computeCareerHealth(baseContext({ resumeScore: 200, atsScore: -50 }));
    expect(health.promotionReadiness).toBeGreaterThanOrEqual(0);
    expect(health.promotionReadiness).toBeLessThanOrEqual(100);
    expect(health.roleReadiness).toBeGreaterThanOrEqual(0);
    expect(health.roleReadiness).toBeLessThanOrEqual(100);
  });
});

function assessment(over: Partial<AssessmentRow> = {}): AssessmentRow {
  return {
    id: 'a1', user_id: 'u1', application_id: null, kind: 'online', title: 'Test',
    provider: '', link: '', due_at: null, completed_at: null, score: null, result: '',
    notes: '', resources: [], created_at: '', updated_at: '',
    ...over,
  };
}

describe('automation engine (Module 20)', () => {
  const NOW = new Date('2026-07-04T00:00:00.000Z');
  const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

  it('flags assessments due within the lead window, not completed or far-future ones', () => {
    const reminders = computeAutomationReminders(
      [
        assessment({ id: 'due-soon', due_at: days(1) }),
        assessment({ id: 'far-future', due_at: days(30) }),
        assessment({ id: 'done', due_at: days(1), completed_at: days(-1) }),
        assessment({ id: 'overdue', due_at: days(-2) }),
      ],
      [],
      NOW
    );
    const ids = reminders.map((r) => r.id);
    expect(ids).toContain('assessment:due-soon');
    expect(ids).toContain('assessment:overdue');
    expect(ids).not.toContain('assessment:far-future');
    expect(ids).not.toContain('assessment:done');
    expect(reminders.find((r) => r.id === 'assessment:overdue')?.overdue).toBe(true);
  });

  it('flags resumes not refreshed in 60+ days', () => {
    const fresh: ResumeWithVersions = {
      id: 'r1', user_id: 'u1', name: 'Fresh', industry: '', notes: '', is_favorite: false,
      is_archived: false, current_version_id: null,
      created_at: days(-1), updated_at: days(-1),
      versions: [{ id: 'v1', updated_at: days(-1) } as unknown as ResumeWithVersions['versions'][0]],
    };
    const stale: ResumeWithVersions = {
      id: 'r2', user_id: 'u1', name: 'Stale', industry: '', notes: '', is_favorite: false,
      is_archived: false, current_version_id: null,
      created_at: days(-90), updated_at: days(-90),
      versions: [{ id: 'v2', updated_at: days(-90) } as unknown as ResumeWithVersions['versions'][0]],
    };
    const reminders = computeAutomationReminders([], [fresh, stale], NOW);
    const ids = reminders.map((r) => r.id);
    expect(ids).toContain('resume-outdated:r2');
    expect(ids).not.toContain('resume-outdated:r1');
  });

  it('builds a weekly and monthly review from application stats', () => {
    const stats = computeApplicationStats([]);
    const weekly = buildPeriodicReview(stats, 'weekly');
    const monthly = buildPeriodicReview(stats, 'monthly');
    expect(weekly.period).toBe('weekly');
    expect(monthly.period).toBe('monthly');
    expect(weekly.bullets.length).toBeGreaterThan(0);
    expect(weekly.bullets.join(' ')).toMatch(/no applications tracked/i);
  });
});

describe('calendar ICS export (Module 15)', () => {
  it('produces a valid VCALENDAR with one VEVENT per event', () => {
    const ics = buildIcs([
      { id: 'e1', kind: 'interview', title: 'Interview: Risk Analyst', description: 'Round 2', at: '2026-07-10T09:00:00.000Z', location: '', url: '' },
      { id: 'e2', kind: 'deadline', title: 'Deadline: AML Analyst', description: '', at: '2026-07-12T09:00:00.000Z', location: 'Chennai', url: 'https://example.com' },
    ]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect(ics).toContain('SUMMARY:Interview: Risk Analyst');
    expect(ics).toContain('LOCATION:Chennai');
  });

  it('escapes commas, semicolons and newlines per RFC 5545', () => {
    const ics = buildIcs([{ id: 'e1', kind: 'follow_up', title: 'Follow up, re: role; urgent', description: 'line1\nline2', at: '2026-07-10T09:00:00.000Z', location: '', url: '' }]);
    expect(ics).toContain('Follow up\\, re: role\\; urgent');
    expect(ics).toContain('line1\\nline2');
  });
});

describe('task manager helpers (Module 14)', () => {
  const NOW = new Date('2026-07-04T00:00:00.000Z');
  const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();
  const task = (over: Record<string, unknown>) => ({
    id: '1', user_id: 'u', application_id: null, title: 't', detail: '', kind: 'general',
    status: 'open', priority: 'medium', due_at: null, completed_at: null, created_at: '', updated_at: '',
    ...over,
  }) as unknown as Parameters<typeof upcomingTasks>[0][number];

  it('separates upcoming from overdue open tasks', () => {
    const tasks = [task({ id: 'soon', due_at: days(2) }), task({ id: 'late', due_at: days(-1) }), task({ id: 'done', due_at: days(-1), status: 'done' })];
    expect(upcomingTasks(tasks, 7).map((t) => t.id).sort()).toEqual(['late', 'soon']);
    expect(overdueTasks(tasks).map((t) => t.id)).toEqual(['late']);
  });
});

describe('networking follow-up helper (Module 7)', () => {
  it('flags contacts due within the window', () => {
    const NOW = Date.now();
    const soon = new Date(NOW + 2 * 86_400_000).toISOString();
    const far = new Date(NOW + 30 * 86_400_000).toISOString();
    const contacts = [
      { id: 'a', follow_up_at: soon } as unknown as Parameters<typeof dueFollowUps>[0][number],
      { id: 'b', follow_up_at: far } as unknown as Parameters<typeof dueFollowUps>[0][number],
      { id: 'c', follow_up_at: null } as unknown as Parameters<typeof dueFollowUps>[0][number],
    ];
    expect(dueFollowUps(contacts, 7).map((c) => c.id)).toEqual(['a']);
  });
});
