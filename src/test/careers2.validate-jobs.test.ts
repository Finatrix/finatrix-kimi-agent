import { describe, it, expect } from 'vitest';
import {
  coverLetterText,
  validateAiMatch,
  validateAssistantAnswer,
  validateCoach,
  validateCoverLetter,
  validateInterviewFeedback,
  validateJobAnalysis,
  validateQuestions,
  validateStar,
  validateTailoring,
} from '../careers/ai/validate-jobs';
import { CareersError } from '../careers/utils/errors';

describe('validateJobAnalysis', () => {
  it('builds a full analysis with keyword tiers', () => {
    const { analysis, keywords } = validateJobAnalysis({
      extraction: { company: 'HDFC', title: 'Risk Analyst', responsibilities: ['Monitor risk'] },
      intelligence: { difficulty: 60, suitsGraduates: true, summary: 'Steady mid-level role.' },
      skills: [{ name: 'SQL', category: 'Programming', required: true, weight: 90 }],
      keywords: [
        { keyword: 'risk management', tier: 'primary', weight: 95, frequency: 4 },
        { keyword: 'stakeholders', tier: 'made-up-tier', weight: 40, frequency: 1 },
      ],
    });
    expect(analysis.extraction.company).toBe('HDFC');
    expect(analysis.skills[0].category).toBe('programming');
    expect(keywords.keywords[0].keyword).toBe('risk management');
    expect(keywords.keywords[1].tier).toBe('secondary'); // coerced unknown tier
  });

  it('rejects an empty analysis', () => {
    expect(() => validateJobAnalysis({})).toThrowError(CareersError);
  });

  it('strips markup smuggled through the model', () => {
    const { analysis } = validateJobAnalysis({
      extraction: { title: '<img onerror=x src=y>Analyst' },
      intelligence: { summary: 'ok<script>bad()</script>' },
      skills: [],
    });
    expect(analysis.extraction.title).toBe('Analyst');
    expect(analysis.intelligence.summary).not.toContain('<script>');
  });
});

describe('validateAiMatch', () => {
  it('clamps scores and keeps reasoned recommendations', () => {
    const part = validateAiMatch({
      scores: { technical: 150, experience: 70 },
      insights: {
        strengths: [{ text: 'Strong SQL', priority: 'high' }],
        recommendations: [{ action: 'add', target: 'AML section', detail: 'Add it', reason: 'JD requires AML', priority: 'high' }],
      },
    });
    expect(part.scores.technical).toBe(100);
    expect(part.insights.recommendations[0].reason).toContain('AML');
  });

  it('tolerates bare-string list items', () => {
    const part = validateAiMatch({
      scores: { technical: 50 },
      insights: { missingSkills: ['Python', 'Tableau'] },
    });
    expect(part.insights.missingSkills.map((i) => i.text)).toEqual(['Python', 'Tableau']);
    expect(part.insights.missingSkills[0].priority).toBe('medium');
  });

  it('throws on an all-zero score payload', () => {
    expect(() => validateAiMatch({ scores: {}, insights: {} })).toThrowError(CareersError);
  });
});

describe('validateTailoring', () => {
  it('keeps sections with improvements and reasons', () => {
    const report = validateTailoring({
      summary: 'Tailored summary',
      sections: [
        { section: 'Summary', original: 'old', improved: 'new and better', addedKeywords: ['risk'], reason: 'aligns to JD' },
        { section: 'skills', improved: '' }, // dropped: no improvement text
      ],
      addedKeywords: ['risk'],
      formattingSuggestions: ['Use standard headings'],
    });
    expect(report.sections).toHaveLength(1);
    expect(report.sections[0].section).toBe('summary');
  });

  it('rejects empty tailoring output', () => {
    expect(() => validateTailoring({ sections: [] })).toThrowError(CareersError);
  });
});

describe('cover letters', () => {
  it('validates and flattens sections in order', () => {
    const sections = validateCoverLetter({
      opening: 'Dear team,', introduction: 'I build risk models.', whyCompany: 'Your scale.',
      whyRole: 'Fits my track.', relevantExperience: 'Five years in AML.', achievements: 'Cut losses 20%.',
      closing: 'Thanks.', callToAction: 'Happy to talk.', signature: 'Jane',
    });
    const text = coverLetterText(sections);
    expect(text.startsWith('Dear team,')).toBe(true);
    expect(text.endsWith('Jane')).toBe(true);
    expect(text.split('\n\n')).toHaveLength(9);
  });

  it('rejects letters with too few sections', () => {
    expect(() => validateCoverLetter({ opening: 'Hi', signature: 'X' })).toThrowError(CareersError);
  });
});

describe('interview validators', () => {
  it('validates question sets with coerced categories', () => {
    const qs = validateQuestions({
      questions: [
        { category: 'behavioural', question: 'Tell me about a conflict.', guidance: 'STAR', difficulty: 'medium' },
        { category: 'weird', question: 'Why us?', difficulty: 'nope' },
        { category: 'technical', question: 'Explain VaR.', difficulty: 'hard' },
      ],
    });
    expect(qs).toHaveLength(3);
    expect(qs[1].category).toBe('behavioural');
    expect(qs[1].difficulty).toBe('medium');
    expect(qs.map((q) => q.id)).toEqual(['q-1', 'q-2', 'q-3']);
  });

  it('rejects sets under three questions', () => {
    expect(() => validateQuestions({ questions: [{ question: 'only one' }] })).toThrowError(CareersError);
  });

  it('validates STAR answers', () => {
    const star = validateStar({ situation: 'S', task: 'T', action: 'A', result: 'R', reflection: 'X', confidence: 130, improvements: ['quantify'] });
    expect(star.confidence).toBe(100);
    expect(() => validateStar({})).toThrowError(CareersError);
  });

  it('derives overall feedback score from categories when missing', () => {
    const fb = validateInterviewFeedback({
      scores: { confidence: 60, communication: 60, technical: 60, leadership: 60, star: 60, behavioural: 60 },
      strongAreas: ['clarity'],
    });
    expect(fb.overall).toBe(60);
  });
});

describe('coach validators', () => {
  it('accepts insights, roadmap, learning and certifications', () => {
    const part = validateCoach({
      insights: [{ text: '3 of 5 target jobs need SQL', priority: 'high' }],
      roadmap: { title: 'To Risk Manager', targetRole: 'Risk Manager', timeline: '24 months', steps: [{ title: 'Senior Analyst', months: 12, skills: ['SQL'] }] },
      learning: [{ name: 'SQL Bootcamp', kind: 'course', difficulty: 'beginner', hours: 20, priority: 'high', impact: 'unlocks 68% of jobs' }],
      certifications: [{ name: 'FRM', priority: 'medium', reason: 'Risk roles favour it' }],
    });
    expect(part.roadmap?.steps).toHaveLength(1);
    expect(part.learning[0].done).toBe(false);
    expect(part.certifications[0].name).toBe('FRM');
  });

  it('rejects an entirely empty coach payload', () => {
    expect(() => validateCoach({})).toThrowError(CareersError);
  });

  it('validates assistant answers and requires text', () => {
    const a = validateAssistantAnswer({ answer: 'Follow up with Acme.', references: ['application: Acme'] });
    expect(a.references).toHaveLength(1);
    expect(() => validateAssistantAnswer({ answer: '' })).toThrowError(CareersError);
  });
});
