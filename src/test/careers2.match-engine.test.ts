import { describe, it, expect } from 'vitest';
import {
  combineScores,
  deterministicScores,
  industryScore,
  keywordCoverageScore,
  locationScore,
  missingKeywords,
  parseSalaryExpectation,
  salaryScore,
} from '../careers/services/matchEngine';
import type { JobKeywordReport } from '../careers/types/jobs';
import type { CareerProfileRow } from '../careers/types';

const kw = (list: [string, number][]): JobKeywordReport => ({
  keywords: list.map(([keyword, weight]) => ({ keyword, tier: 'primary' as const, weight, frequency: 1 })),
});

function profile(over: Partial<CareerProfileRow> = {}): CareerProfileRow {
  return {
    user_id: 'u', job_title: '', preferred_role: '', preferred_industry: '',
    years_experience: null, highest_qualification: '', primary_skills: [], secondary_skills: [],
    location_preference: '', employment_type: '', salary_expectation: '', notice_period: '',
    visa_status: '', work_rights: '', languages: [], career_dna: null, suggestions: {},
    settings: {}, created_at: '', updated_at: '',
    ...over,
  };
}

describe('keyword coverage', () => {
  it('weights hits by keyword importance', () => {
    const keywords = kw([['SQL', 80], ['Python', 20]]);
    expect(keywordCoverageScore(keywords, 'I know sql very well')).toBe(80);
    expect(keywordCoverageScore(keywords, 'Python only here')).toBe(20);
    expect(keywordCoverageScore(keywords, 'sql and python')).toBe(100);
  });

  it('is neutral when the job has no keywords', () => {
    expect(keywordCoverageScore(null, 'anything')).toBe(50);
    expect(keywordCoverageScore({ keywords: [] }, 'anything')).toBe(50);
  });

  it('lists missing keywords case-insensitively', () => {
    expect(missingKeywords(kw([['AML', 90], ['KYC', 70]]), 'Strong aml background')).toEqual(['KYC']);
  });
});

describe('industry / location / salary scores', () => {
  it('scores industry overlap against profile and resume', () => {
    expect(industryScore('Finance', null, profile({ preferred_industry: 'Finance' }))).toBe(100);
    expect(industryScore('Financial Services', null, profile({ preferred_industry: 'Finance banking' }))).toBeGreaterThanOrEqual(65);
    expect(industryScore('Agriculture', null, profile({ preferred_industry: 'Finance' }))).toBe(35);
    expect(industryScore('', null, profile())).toBe(60); // unknown = neutral
  });

  it('remote jobs always score 100 on location', () => {
    expect(locationScore({ location: 'Pune', work_mode: 'remote' }, profile({ location_preference: 'Chennai' }))).toBe(100);
  });

  it('city match beats mismatch', () => {
    const pref = profile({ location_preference: 'Bengaluru' });
    expect(locationScore({ location: 'Bengaluru, Karnataka', work_mode: 'onsite' }, pref)).toBe(100);
    expect(locationScore({ location: 'Mumbai, Maharashtra', work_mode: 'onsite' }, pref)).toBe(30);
    expect(locationScore({ location: 'Mumbai', work_mode: 'hybrid' }, pref)).toBe(45);
  });

  it('parses Indian salary expectation formats', () => {
    expect(parseSalaryExpectation('24 LPA')).toBe(2_400_000);
    expect(parseSalaryExpectation('₹18L')).toBe(1_800_000);
    expect(parseSalaryExpectation('24')).toBe(2_400_000);      // bare LPA convention
    expect(parseSalaryExpectation('2400000')).toBe(2_400_000); // absolute
    expect(parseSalaryExpectation('1.2 cr')).toBe(12_000_000);
    expect(parseSalaryExpectation('')).toBeNull();
  });

  it('scores salary vs expectation', () => {
    const p = profile({ salary_expectation: '20 LPA' });
    expect(salaryScore({ salary_min: null, salary_max: 2_400_000 }, p)).toBe(100);
    expect(salaryScore({ salary_min: null, salary_max: 1_800_000 }, p)).toBe(80);
    expect(salaryScore({ salary_min: null, salary_max: 1_000_000 }, p)).toBe(30);
    expect(salaryScore({ salary_min: null, salary_max: null }, p)).toBe(60); // unknown
  });
});

describe('combineScores', () => {
  it('merges AI + deterministic scores into a weighted overall', () => {
    const det = deterministicScores({
      job: { industry: 'Finance', location: 'Remote', work_mode: 'remote', salary_min: null, salary_max: null },
      keywords: kw([['SQL', 100]]),
      resumeText: 'sql expert',
      parsed: null,
      profile: profile({ preferred_industry: 'Finance' }),
    });
    const { overall, scores } = combineScores(
      { technical: 90, experience: 80, education: 70, certifications: 60, ats: 85, careerDna: 75, culture: 70, leadership: 65, communication: 70, projects: 60 },
      det
    );
    expect(scores.keywords).toBe(100);
    expect(scores.location).toBe(100);
    expect(scores.industry).toBe(100);
    expect(overall).toBeGreaterThan(70);
    expect(overall).toBeLessThanOrEqual(100);
  });

  it('clamps out-of-range AI values', () => {
    const det = { keywords: 50, industry: 60, location: 60, salary: 60 };
    const { scores } = combineScores({ technical: 400, experience: -50 } as Record<string, number>, det);
    expect(scores.technical).toBe(100);
    expect(scores.experience).toBe(0);
  });
});
