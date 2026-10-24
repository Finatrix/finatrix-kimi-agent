/**
 * The market layer inside the search pipeline: salaries other markets bury in the description, and which
 * resume gaps the user can honestly close.
 */
import { describe, it, expect } from 'vitest';
import { enrichJob } from '../careers/search/normalize';
import { quickMatchJob, type QuickMatchInput } from '../careers/search/quickMatch';
import type { CareerProfileRow, ParsedResume } from '../careers/types';
import type { NormalizedJob } from '../careers/types/jobs';

function job(over: Partial<NormalizedJob>): NormalizedJob {
  return {
    source: 't', via: 'Test', external_id: 'x', company: 'Co', title: 'Risk Analyst', description: '',
    salary_min: null, salary_max: null, currency: '', location: '', country: 'GB',
    work_mode: '', employment_type: '', apply_url: 'https://x.test/j', posted_at: null, closes_at: null, industry: '',
    ...over,
  };
}

describe('salary enrichment by market', () => {
  it('reads an annual figure in the market’s own currency', () => {
    const e = enrichJob(job({ description: 'Salary £45,000 - £55,000 per annum plus pension' }));
    expect([e.salary_min, e.salary_max, e.currency]).toEqual([45000, 55000, 'GBP']);
  });

  it('annualises monthly pay exactly and leaves hourly rates unknown', () => {
    expect(enrichJob(job({ country: 'NZ', description: 'NZ$7,000 per month' })).salary_min).toBe(84000);
    expect(enrichJob(job({ country: 'AU', description: '$55 - $60 per hour + super' })).salary_min).toBeNull();
  });

  it('ignores a figure in another currency rather than comparing across currencies', () => {
    expect(enrichJob(job({ country: 'US', description: 'Pay: £60,000 per annum' })).salary_min).toBeNull();
  });

  it('keeps stated fields, and keeps the Indian LPA path exactly as it was', () => {
    expect(enrichJob(job({ salary_min: 1, salary_max: 2, description: '£45,000 per annum' })).salary_min).toBe(1);
    const indian = enrichJob(job({ country: 'IN', description: 'CTC 12-18 LPA' }));
    expect([indian.salary_min, indian.salary_max]).toEqual([1_200_000, 1_800_000]);
    expect(enrichJob(job({ country: 'SG', description: 'S$8,000 per month' })).salary_min).toBeNull();
  });
});

describe('addable vs genuine gaps', () => {
  const parsed = {
    currentDesignation: 'Risk Analyst', currentIndustry: 'Finance', yearsOfExperience: 3, summary: '',
    skills: { technical: [], business: [], tools: [], frameworks: [], programmingLanguages: [], cloudPlatforms: [], databases: [], soft: [] },
    education: [], experience: [], certifications: [], projects: [], achievements: [], languages: [],
  } as unknown as ParsedResume;
  const posting = enrichJob(job({
    country: 'IN',
    title: 'Credit Risk Analyst',
    description: 'Credit risk analyst for retail lending. Basel capital, stress testing, credit scoring and portfolio risk.',
  }));

  it('marks a missing term addable only when the profile already lists it', () => {
    const base: QuickMatchInput = { parsed, rawText: 'Risk analyst.', careerDna: null, profile: null };
    const noProfile = quickMatchJob(posting, base);
    expect(noProfile.addableTerms).toEqual([]);
    const missing = noProfile.missingTerms;
    expect(missing.length).toBeGreaterThan(0);

    const profile = { primary_skills: [missing[0]], secondary_skills: [], career_dna: null } as unknown as CareerProfileRow;
    const withProfile = quickMatchJob(posting, { ...base, profile });
    expect(withProfile.addableTerms).toEqual([missing[0]]);
    expect(withProfile.missingTerms).toContain(missing[0]);
    // Evidence outside the resume explains a gap; it never moves the keyword score.
    expect(withProfile.scores.keywords).toBe(noProfile.scores.keywords);
  });
});
