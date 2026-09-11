/**
 * Application analytics — the numbers shown on the dashboard and in exports.
 *
 * These are the figures a user judges their own job search by, so a wrong one
 * is not a cosmetic bug. `interviews` deliberately counts every application
 * that reached interview OR ANYTHING BEYOND IT (offer, negotiation, accepted,
 * declined), which makes `offers` a strict subset of it — a fact any consumer
 * of these stats has to respect.
 */

import { describe, it, expect } from 'vitest';
import { computeApplicationStats } from '../careers/services/applications';
import type { ApplicationRow, ApplicationStage } from '../careers/types/jobs';

function app(stage: ApplicationStage, over: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: 'u1',
    company_name: 'Acme',
    job_title: 'Analyst',
    stage,
    archived: false,
    tags: [],
    notes: '',
    priority: 'medium',
    match_score: null,
    ats_score: null,
    applied_at: null,
    interview_at: null,
    closes_at: null,
    offer_expires_at: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...over,
  } as unknown as ApplicationRow;
}

describe('computeApplicationStats', () => {
  it('counts an offer as an interview too — offers are a subset', () => {
    // Documents the relationship the dashboard has to respect. An application
    // that reached an offer necessarily passed through interviewing.
    const s = computeApplicationStats([app('offer_accepted')]);
    expect(s.offers).toBe(1);
    expect(s.interviews).toBe(1);
  });

  it('never reports a rate above 100%', () => {
    // The invariant that the dashboard's "response rate" was breaking: it read
    // (interviews + offers) / applied, and because offers ⊆ interviews an
    // application at offer_accepted was counted twice — 200% of applications
    // "got a reply".
    const rows = [app('offer_accepted'), app('negotiating'), app('offer_received')];
    const s = computeApplicationStats(rows);

    for (const rate of [s.successRate, s.interviewRate, s.offerRate, s.responseRate]) {
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(100);
    }
  });

  it('treats a rejection as a response — silence is the thing being measured', () => {
    const s = computeApplicationStats([
      app('rejected', { applied_at: '2026-08-02T00:00:00Z' }),
      app('applied', { applied_at: '2026-08-02T00:00:00Z' }),
    ]);
    expect(s.applied).toBe(2);
    // One replied (a no is still a reply), one is still silent.
    expect(s.responseRate).toBe(50);
  });

  it('counts an interview as a response without double-counting the offer', () => {
    const s = computeApplicationStats([
      app('offer_accepted', { applied_at: '2026-08-02T00:00:00Z' }),
      app('applied', { applied_at: '2026-08-02T00:00:00Z' }),
    ]);
    expect(s.applied).toBe(2);
    expect(s.responseRate).toBe(50);
  });

  it('is zero, not NaN, when nothing has been applied to', () => {
    const s = computeApplicationStats([app('saved')]);
    expect(s.applied).toBe(0);
    expect(s.responseRate).toBe(0);
    expect(s.interviewRate).toBe(0);
    expect(Number.isFinite(s.responseRate)).toBe(true);
  });

  it('handles an empty pipeline', () => {
    const s = computeApplicationStats([]);
    expect(s.total).toBe(0);
    expect(s.responseRate).toBe(0);
    expect(s.avgMatchScore).toBeNull();
  });
});

// ───────────────────────── career health / offer outlook ─────────────────────

import { computeCareerHealth } from '../careers/services/health';
import type { CoachContext } from '../careers/types/jobs';

const ctx = (over: Partial<CoachContext> = {}): CoachContext => ({
  profile: {}, careerDna: null, resumeScore: null, atsScore: null, topSkills: [],
  applicationStats: { total: 0, applied: 0, interviews: 0, offers: 0 },
  recentApplications: [], interviewScores: [], learningProgress: 0,
  ...over,
} as CoachContext);

describe('offer outlook', () => {
  it('does not treat one offer from three applications as certainty', () => {
    // The shipped formula returned 40 + (1/3)*300 = 140 → clamped to 100.
    const h = computeCareerHealth(ctx({
      applicationStats: { total: 3, applied: 3, interviews: 1, offers: 1 },
    }));
    expect(h.offerProbability).toBeLessThan(70);
  });

  it('has no cliff at the first offer', () => {
    const nine = { total: 10, applied: 10, interviews: 3, offers: 0 };
    const ten = { total: 10, applied: 10, interviews: 3, offers: 1 };
    const before = computeCareerHealth(ctx({ applicationStats: nine })).offerProbability;
    const after = computeCareerHealth(ctx({ applicationStats: ten })).offerProbability;

    expect(after).toBeGreaterThan(before);
    // One event previously moved this ~40 points.
    expect(after - before).toBeLessThan(20);
  });

  it('rewards a sustained rate more than a lucky single result', () => {
    const lucky = computeCareerHealth(ctx({
      applicationStats: { total: 2, applied: 2, interviews: 1, offers: 1 },
    })).offerProbability;
    const sustained = computeCareerHealth(ctx({
      applicationStats: { total: 40, applied: 40, interviews: 15, offers: 6 },
    })).offerProbability;

    expect(sustained).toBeGreaterThan(lucky);
  });

  it('rises monotonically with offers at a fixed application count', () => {
    const at = (offers: number) => computeCareerHealth(ctx({
      applicationStats: { total: 30, applied: 30, interviews: Math.max(offers, 5), offers },
    })).offerProbability;

    const series = [0, 1, 2, 4, 8].map(at);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]).toBeGreaterThanOrEqual(series[i - 1]);
    }
  });

  it('stays in range for every extreme', () => {
    const extremes = [
      { total: 0, applied: 0, interviews: 0, offers: 0 },
      { total: 500, applied: 500, interviews: 500, offers: 500 },
      { total: 1, applied: 0, interviews: 5, offers: 3 },
    ];
    for (const applicationStats of extremes) {
      const h = computeCareerHealth(ctx({ applicationStats, resumeScore: 100, atsScore: 100 }));
      expect(h.offerProbability).toBeGreaterThanOrEqual(0);
      expect(h.offerProbability).toBeLessThanOrEqual(100);
      expect(Number.isFinite(h.offerProbability)).toBe(true);
    }
  });
});
