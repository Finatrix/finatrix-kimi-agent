import { describe, it, expect } from 'vitest';
import { computeApplicationStats } from '../careers/services/applications';
import { computeCareerHealth } from '../careers/services/health';
import { APPLICATION_STAGES, STAGE_LABELS, matchBand } from '../careers/types/jobs';
import type { ApplicationRow, CoachContext } from '../careers/types/jobs';

function app(over: Partial<ApplicationRow>): ApplicationRow {
  return {
    id: Math.random().toString(36).slice(2), user_id: 'u', job_id: null, company_id: null,
    contact_id: null, resume_version_id: null, cover_letter_id: null,
    company_name: 'Acme', job_title: 'Analyst', department: '', salary_text: '',
    employment_type: '', location: '', work_mode: '', visa_sponsorship: '',
    source: '', job_url: '', stage: 'saved', priority: 'medium', tags: [], notes: '',
    match_score: null, ats_score: null, applied_at: null, closes_at: null,
    interview_at: null, offer_expires_at: null, next_action_at: null, archived: false,
    created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    ...over,
  };
}

describe('application pipeline model', () => {
  it('has all 22 spec stages with labels', () => {
    expect(APPLICATION_STAGES).toHaveLength(22);
    for (const s of APPLICATION_STAGES) expect(STAGE_LABELS[s]).toBeTruthy();
  });

  it('maps scores to traffic-light bands', () => {
    expect(matchBand(85)).toBe('green');
    expect(matchBand(70)).toBe('green');
    expect(matchBand(69)).toBe('yellow');
    expect(matchBand(40)).toBe('yellow');
    expect(matchBand(39)).toBe('red');
  });
});

describe('computeApplicationStats', () => {
  it('computes the funnel and rates', () => {
    const stats = computeApplicationStats([
      app({ stage: 'saved' }),
      app({ stage: 'applied', applied_at: '2026-06-02T00:00:00Z', match_score: 80 }),
      app({ stage: 'technical_interview', match_score: 60 }),
      app({ stage: 'offer_received', ats_score: 75 }),
      app({ stage: 'rejected' }),
    ]);
    expect(stats.total).toBe(5);
    expect(stats.saved).toBe(1);
    expect(stats.applied).toBe(4);       // everything past the prep stages
    expect(stats.interviews).toBe(2);    // interview stage + offer stage
    expect(stats.offers).toBe(1);
    expect(stats.rejections).toBe(1);
    expect(stats.avgMatchScore).toBe(70);
    expect(stats.interviewRate).toBe(50);
    expect(stats.successRate).toBe(25);
  });

  it('builds a monthly trend', () => {
    const stats = computeApplicationStats([
      app({ created_at: '2026-05-10T00:00:00Z' }),
      app({ created_at: '2026-06-10T00:00:00Z' }),
      app({ created_at: '2026-06-20T00:00:00Z' }),
    ]);
    expect(stats.monthlyTrend).toEqual([
      { month: '2026-05', count: 1 },
      { month: '2026-06', count: 2 },
    ]);
  });

  it('handles the empty state', () => {
    const stats = computeApplicationStats([]);
    expect(stats.total).toBe(0);
    expect(stats.avgMatchScore).toBeNull();
    expect(stats.successRate).toBe(0);
  });
});

describe('computeCareerHealth', () => {
  const base: CoachContext = {
    profile: {}, careerDna: null, resumeScore: null, atsScore: null, topSkills: [],
    applicationStats: { total: 0, applied: 0, interviews: 0, offers: 0 },
    recentApplications: [], interviewScores: [], learningProgress: 0,
  };

  it('is low with no data and suggests first steps', () => {
    const h = computeCareerHealth(base);
    expect(h.overall).toBeLessThan(30);
    expect(h.suggestions.length).toBeGreaterThan(2);
    expect(h.categories).toHaveLength(6);
  });

  it('rises with strong scores and activity', () => {
    const h = computeCareerHealth({
      ...base,
      resumeScore: 85, atsScore: 80,
      topSkills: Array.from({ length: 10 }, (_, i) => `skill${i}`),
      careerDna: { traits: [], strengths: [], weaknesses: [], recommendedIndustries: [], suitableRoles: [], personalitySummary: 'x' },
      applicationStats: { total: 12, applied: 10, interviews: 4, offers: 1 },
      interviewScores: [70, 80],
      learningProgress: 60,
    });
    expect(h.overall).toBeGreaterThan(65);
    expect(h.offerProbability).toBeGreaterThan(40);
  });

  it('every category stays within 0–100', () => {
    const h = computeCareerHealth({
      ...base,
      resumeScore: 100, atsScore: 100,
      applicationStats: { total: 100, applied: 90, interviews: 50, offers: 10 },
      interviewScores: [100, 100], learningProgress: 100,
      topSkills: Array.from({ length: 50 }, (_, i) => `s${i}`),
    });
    for (const c of h.categories) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
    }
  });
});
