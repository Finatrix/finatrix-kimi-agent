import { describe, it, expect } from 'vitest';
import { normalize, toWireJob, applySkillMatch, type RawJob } from './ProviderNormalizer.ts';

const NOW = new Date('2026-07-25T00:00:00Z').getTime();

function raw(over: Partial<RawJob> = {}): RawJob {
  return {
    externalId: 'x1',
    title: 'Senior Python Engineer',
    company: 'Acme',
    description: 'We need Python and AWS. Remote-friendly team. ' + 'x'.repeat(500),
    salaryMin: 2000000,
    salaryMax: 3000000,
    currency: 'INR',
    location: 'Bengaluru',
    country: 'IN',
    workMode: '',
    employmentType: 'FULLTIME',
    applyUrl: 'https://example.com/apply/1',
    companyLogo: 'https://cdn.example.com/logo.png',
    postedDate: '2026-07-25T00:00:00Z',
    via: 'Company Site',
    ...over,
  };
}

describe('normalize', () => {
  it('builds a canonical job with deterministic enrichment', () => {
    const j = normalize('activejobs', 100, raw(), NOW)!;
    expect(j.id).toBe('activejobs:x1');
    expect(j.title).toBe('Senior Python Engineer');
    expect(j.experience).toBe('senior');
    expect(j.skills).toEqual(expect.arrayContaining(['python', 'aws']));
    expect(j.freshness).toBe('today');
    expect(j.salary.min).toBe(2000000);
    expect(j.workMode).toBe('remote');            // inferred from description
    expect(j.remoteProbability).toBeGreaterThan(0.6);
    expect(j.confidence).toBeGreaterThan(80);      // high priority + complete
    expect(j.badges).toEqual(expect.arrayContaining(['posted_today', 'salary_listed', 'remote_friendly', 'high_confidence']));
  });

  it('drops jobs with no title or an unsafe apply url', () => {
    expect(normalize('p', 50, raw({ title: '' }), NOW)).toBeNull();
    expect(normalize('p', 50, raw({ applyUrl: 'javascript:alert(1)' }), NOW)).toBeNull();
    expect(normalize('p', 50, raw({ applyUrl: 'not-a-url' }), NOW)).toBeNull();
  });

  it('sanitises an unsafe company logo to null without dropping the job', () => {
    const j = normalize('p', 50, raw({ companyLogo: 'data:image/png;base64,AAAA' }), NOW)!;
    expect(j).not.toBeNull();
    expect(j.companyLogo).toBeNull();
  });

  it('lowers confidence for a low-priority, sparse record', () => {
    const sparse = raw({ salaryMin: null, salaryMax: null, description: 'short', companyLogo: null, postedDate: null });
    const j = normalize('jobpostingfeed', 50, sparse, NOW)!;
    expect(j.confidence).toBeLessThan(60);
    expect(j.freshness).toBe('unknown');
    expect(j.badges).not.toContain('salary_listed');
  });

  it('applySkillMatch adds the badge only on real overlap', () => {
    const j = normalize('p', 90, raw(), NOW)!;
    expect(applySkillMatch(j, ['golang', 'rust']).badges).not.toContain('skills_matched');
    expect(applySkillMatch(j, ['Python']).badges).toContain('skills_matched');
  });
});

// The normaliser is the single trust boundary: whatever shape a provider hands
// over, what leaves here must satisfy the documented contract. These guard the
// two ways it previously did not.
describe('normalize — trust boundary guarantees', () => {
  it('coerces human "posted" text into a real ISO date and recovers freshness', () => {
    // Google Jobs emits "2 days ago"; Workday emits "Posted 3 Days Ago".
    for (const [text, expected] of [['2 days ago', 'this_week'], ['Posted 3 Days Ago', 'this_week']] as const) {
      const j = normalize('googlejobs', 70, raw({ postedDate: text }), NOW)!;
      expect(Number.isNaN(new Date(j.postedDate!).getTime())).toBe(false);
      expect(j.freshness).toBe(expected);
    }
  });

  it('never emits a posted/closes value the database could not store', () => {
    const j = normalize('workday', 80, raw({ postedDate: 'sometime last spring', closesAt: 'whenever' }), NOW)!;
    // Unreadable → null, never passed through and never invented.
    expect(j.postedDate).toBeNull();
    expect(j.closesAt).toBeNull();
    expect(j.freshness).toBe('unknown');
  });

  it('strips provider markup out of the description before it reaches the wire', () => {
    const j = normalize('activejobs', 100, raw({
      description: '<p>Build with <b>Python</b> and AWS.</p><script>alert(1)</script>'
        + '<img src=x onerror=alert(1)>&amp; more',
    }), NOW)!;
    expect(j.description).not.toContain('<');
    expect(j.description).not.toContain('alert(1)');
    expect(j.description).toContain('Python');
    // Derived signals are computed on the clean text, not the markup.
    expect(j.skills).toEqual(expect.arrayContaining(['python', 'aws']));
    expect(toWireJob(j).description).not.toContain('<script>');
  });
});

describe('toWireJob', () => {
  it('is a strict superset of the legacy NormalizedJob shape', () => {
    const w = toWireJob(normalize('activejobs', 100, raw(), NOW)!);
    // legacy fields present and correctly named
    for (const k of ['source', 'via', 'external_id', 'company', 'title', 'description',
      'salary_min', 'salary_max', 'currency', 'location', 'country', 'work_mode',
      'employment_type', 'apply_url', 'posted_at', 'closes_at', 'industry']) {
      expect(w).toHaveProperty(k);
    }
    expect(w.external_id).toBe('x1');
    expect(w.source).toBe('activejobs');
    // additive enrichment present
    expect(w.confidence).toBeGreaterThan(0);
    expect(w.badges?.length).toBeGreaterThan(0);
  });
});
