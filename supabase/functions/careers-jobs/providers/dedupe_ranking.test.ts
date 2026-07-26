import { describe, it, expect } from 'vitest';
import { deduplicate, contentKey, descSimilarity, mergeInto } from './ProviderDeduplicator.ts';
import { rank, relevanceScore } from './ProviderRanking.ts';
import { normalize, type RawJob } from './ProviderNormalizer.ts';
import type { FinatriXJob, SearchInput } from './types.ts';

const NOW = new Date('2026-07-25T00:00:00Z').getTime();
function mk(provider: string, priority: number, over: Partial<RawJob>): FinatriXJob {
  return normalize(provider, priority, {
    externalId: Math.random().toString(36).slice(2),
    title: 'Risk Analyst', company: 'Globex', description: 'Risk and AML work. ' + 'x'.repeat(300),
    salaryMin: null, salaryMax: null, currency: '', location: 'Mumbai', country: 'IN',
    workMode: '', employmentType: 'fulltime', applyUrl: 'https://globex.com/careers/risk',
    postedDate: '2026-07-24T00:00:00Z', via: 'Company Site', ...over,
  }, NOW)!;
}

describe('deduplicate', () => {
  it('collapses the same role from two providers, higher priority wins', async () => {
    const a = mk('activejobs', 100, { salaryMin: null });               // winner (higher priority), no salary
    const b = mk('glassdoor', 60, { salaryMin: 1500000, salaryMax: 2500000, currency: 'INR', applyUrl: 'https://globex.com/careers/risk' });
    const out = await deduplicate([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].provider).toBe('activejobs');          // higher-priority base kept
    expect(out[0].salary.min).toBe(1500000);             // …but the salary was merged in, not discarded
    expect((out[0].metadata.mergedFrom as unknown[]).length).toBe(1);
  });

  it('keeps genuinely different roles apart', async () => {
    const a = mk('linkedin', 90, { title: 'Risk Analyst' });
    const b = mk('linkedin', 90, { title: 'Data Scientist', description: 'ML and Python modelling. ' + 'y'.repeat(300), applyUrl: 'https://globex.com/careers/ds' });
    const out = await deduplicate([a, b]);
    expect(out).toHaveLength(2);
  });

  it('fuzzy-matches near-identical descriptions at the same company', async () => {
    const desc = 'Operational risk and AML monitoring across the group. ' + 'z'.repeat(400);
    const a = mk('activejobs', 100, { title: 'Risk Analyst', description: desc, applyUrl: 'https://a.example/x' });
    const b = mk('jobpostingfeed', 50, { title: 'Risk Analyst II', description: desc + ' Minor extra.', applyUrl: 'https://b.example/y' });
    const out = await deduplicate([a, b], { descThreshold: 0.7 });
    expect(out).toHaveLength(1);
    expect(out[0].provider).toBe('activejobs');
  });

  it('descSimilarity is 1 for identical and low for disjoint text', () => {
    expect(descSimilarity('alpha beta gamma delta', 'alpha beta gamma delta')).toBe(1);
    expect(descSimilarity('alpha beta gamma', 'seven eight nine')).toBeLessThan(0.2);
  });

  it('mergeInto never loses metadata', () => {
    const a = mk('activejobs', 100, {}); const b = mk('glassdoor', 60, {});
    a.metadata = { x: 1 }; b.metadata = { y: 2 };
    const m = mergeInto(a, b);
    expect(m.metadata.x).toBe(1);
    expect((m.metadata.mergedFrom as unknown[]).length).toBe(1);
  });
});

describe('rank', () => {
  const input: SearchInput = {
    query: 'risk analyst', terms: ['risk analyst', 'risk', 'aml'], location: 'Mumbai',
    country: 'in', remoteOnly: false, workMode: '', employmentType: '', salaryMin: null, salaryMax: null, page: 0,
  };
  const priorityOf = (p: string) => ({ activejobs: 100, linkedin: 90, glassdoor: 60, jobpostingfeed: 50 } as Record<string, number>)[p] ?? 0;

  it('orders by blended score and breaks ties by provider priority', () => {
    const older = mk('jobpostingfeed', 50, { title: 'Risk Analyst', postedDate: '2026-01-01T00:00:00Z' });
    const fresh = mk('activejobs', 100, { title: 'Risk Analyst', postedDate: '2026-07-25T00:00:00Z' });
    const ranked = rank([older, fresh], input, priorityOf);
    expect(ranked[0].job.provider).toBe('activejobs');   // fresher + higher priority
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[0].breakdown.relevance).toBeGreaterThan(50);
  });

  it('relevanceScore rewards title matches', () => {
    const j = mk('linkedin', 90, { title: 'Senior Risk Analyst' });
    expect(relevanceScore(j, input)).toBeGreaterThan(50);
    const off = mk('linkedin', 90, { title: 'Frontend Developer', description: 'React work only. ' + 'q'.repeat(300) });
    expect(relevanceScore(off, input)).toBeLessThan(relevanceScore(j, input));
  });
});
