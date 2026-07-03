import { describe, it, expect } from 'vitest';
import {
  extractJson,
  validateATSReport,
  validateCareerDNA,
  validateParsedResume,
  validateResumeScore,
} from '../careers/ai/validate';
import { ATS_CHECK_CATEGORIES, RESUME_SCORE_CATEGORIES } from '../careers/constants';
import { CareersError } from '../careers/utils/errors';

describe('extractJson', () => {
  it('parses raw JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses fenced JSON with surrounding prose', () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```\nHope that helps')).toEqual({ a: 1 });
  });

  it('recovers an object embedded in prose', () => {
    expect(extractJson('The result is {"a":{"b":2}} as requested.')).toEqual({ a: { b: 2 } });
  });

  it('throws a CareersError on garbage', () => {
    expect(() => extractJson('I cannot answer that.')).toThrowError(CareersError);
  });
});

describe('validateParsedResume', () => {
  const minimal = {
    personal: { name: 'Ada Lovelace', email: 'ada@example.com' },
    experience: [{ company: 'Analytical Engines', title: 'Programmer', highlights: ['Wrote the first program'] }],
    education: [{ institution: 'Home', degree: 'Mathematics' }],
    skills: { technical: ['Mathematics'] },
  };

  it('accepts a minimal valid payload and fills defaults', () => {
    const parsed = validateParsedResume(minimal);
    expect(parsed.personal.name).toBe('Ada Lovelace');
    expect(parsed.experience).toHaveLength(1);
    expect(parsed.projects).toEqual([]);
    expect(parsed.insights.careerGaps).toEqual([]);
    expect(parsed.yearsOfExperience).toBeNull();
  });

  it('strips markup a hostile resume smuggled into AI output', () => {
    const parsed = validateParsedResume({
      ...minimal,
      personal: { name: '<img onerror=alert(1) src=x>Eve', email: 'x' },
      summary: 'Fine.<script>x</script>',
    });
    expect(parsed.personal.name).toBe('Eve');
    // Tags are stripped (inner text stays; React escapes it again on render).
    expect(parsed.summary).toBe('Fine.x');
  });

  it('drops experience items without company or title', () => {
    const parsed = validateParsedResume({
      ...minimal,
      experience: [...minimal.experience, { location: 'nowhere' }],
    });
    expect(parsed.experience).toHaveLength(1);
  });

  it('throws when nothing resume-like is present', () => {
    expect(() => validateParsedResume({ random: true })).toThrowError(CareersError);
  });
});

describe('validateResumeScore', () => {
  it('fills every rubric category even when the model skips some', () => {
    const report = validateResumeScore({
      overall: 72,
      categories: [{ id: 'skills', score: 80, suggestion: 'Add cloud skills' }],
      improvements: ['Quantify results'],
    });
    expect(report.categories).toHaveLength(RESUME_SCORE_CATEGORIES.length);
    expect(report.categories.find((c) => c.id === 'skills')?.score).toBe(80);
    expect(report.categories.find((c) => c.id === 'grammar')?.score).toBe(0);
    expect(report.overall).toBe(72);
  });

  it('clamps out-of-range scores', () => {
    const report = validateResumeScore({
      overall: 250,
      categories: [{ id: 'skills', score: -20 }, { id: 'impact', score: 130 }],
    });
    expect(report.overall).toBe(100);
    expect(report.categories.find((c) => c.id === 'impact')?.score).toBe(100);
  });

  it('derives overall from categories when missing', () => {
    const report = validateResumeScore({
      categories: RESUME_SCORE_CATEGORIES.map(({ id }) => ({ id, score: 60 })),
    });
    expect(report.overall).toBe(60);
  });

  it('rejects an all-empty score payload', () => {
    expect(() => validateResumeScore({ categories: [] })).toThrowError(CareersError);
  });
});

describe('validateATSReport', () => {
  it('coerces unknown severities to medium and sorts by priority', () => {
    const report = validateATSReport({
      overall: 65,
      checks: [{ id: 'headings', score: 70 }],
      issues: [
        { id: 'b', title: 'Second', severity: 'apocalyptic', priority: 2 },
        { id: 'a', title: 'First', severity: 'critical', priority: 1 },
      ],
    });
    expect(report.checks).toHaveLength(ATS_CHECK_CATEGORIES.length);
    expect(report.issues.map((i) => i.id)).toEqual(['a', 'b']);
    expect(report.issues[1].severity).toBe('medium');
    expect(report.issues[0].severity).toBe('critical');
  });

  it('drops issues without a title', () => {
    const report = validateATSReport({
      checks: [{ id: 'headings', score: 50 }],
      issues: [{ id: 'x', detail: 'no title' }],
    });
    expect(report.issues).toEqual([]);
  });
});

describe('validateCareerDNA', () => {
  it('keeps named traits with clamped confidence', () => {
    const dna = validateCareerDNA({
      traits: [{ name: 'Analytical', confidence: 400 }, { name: '', confidence: 50 }],
      personalitySummary: 'You are methodical.',
      strengths: ['Rigor'],
    });
    expect(dna.traits).toEqual([{ name: 'Analytical', confidence: 100 }]);
    expect(dna.strengths).toEqual(['Rigor']);
  });

  it('rejects an empty DNA payload', () => {
    expect(() => validateCareerDNA({})).toThrowError(CareersError);
  });
});
