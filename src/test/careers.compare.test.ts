import { describe, it, expect } from 'vitest';
import { compareVersions } from '../careers/services/compare';
import type { ParsedResume, ResumeVersionRow } from '../careers/types';

function version(over: Partial<ResumeVersionRow>): ResumeVersionRow {
  return {
    id: 'v', resume_id: 'r', user_id: 'u', version_number: 1,
    file_name: 'r.pdf', file_path: 'u/r.pdf', file_size: 1, file_type: 'application/pdf',
    sha256: '', stage: 'complete', status: 'complete', error: '', extraction_method: 'pdf-text',
    raw_text: '', parsed: null, resume_score: null, score_breakdown: null,
    ats_score: null, ats_report: null, career_dna: null, parse_ms: null, ai_ms: null,
    created_at: '2026-01-01', updated_at: '2026-01-01',
    ...over,
  };
}

function parsedWithSkills(technical: string[]): ParsedResume {
  return {
    personal: { name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
    summary: '', careerObjective: '', yearsOfExperience: null, currentDesignation: '', currentIndustry: '',
    experience: [], education: [],
    skills: { technical, soft: [], business: [], leadership: [], tools: [], frameworks: [], programmingLanguages: [], cloudPlatforms: [], databases: [] },
    projects: [], certifications: [], languages: [], achievements: [], awards: [], publications: [],
    volunteerWork: [], publicSpeaking: [], research: [], patents: [],
    insights: { careerGaps: [], promotionHistory: '', employmentStability: '', jobSwitchingPattern: '', careerProgression: '' },
  };
}

describe('compareVersions', () => {
  it('computes score deltas and skill diffs', () => {
    const a = version({
      resume_score: 60, ats_score: 55,
      parsed: parsedWithSkills(['Excel', 'SQL']),
      raw_text: 'one two three',
      score_breakdown: { overall: 60, improvements: [], categories: [{ id: 'skills', label: 'Skills', score: 50, suggestion: '' }] },
    });
    const b = version({
      id: 'v2', resume_score: 74, ats_score: 70,
      parsed: parsedWithSkills(['sql', 'Python']),
      raw_text: 'one two three four five',
      score_breakdown: { overall: 74, improvements: [], categories: [{ id: 'skills', label: 'Skills', score: 78, suggestion: '' }] },
    });
    const cmp = compareVersions(a, b);
    expect(cmp.resumeScore.delta).toBe(14);
    expect(cmp.atsScore.delta).toBe(15);
    expect(cmp.skillsAdded).toEqual(['Python']);
    expect(cmp.skillsRemoved).toEqual(['Excel']);
    expect(cmp.skillsShared).toEqual(['sql']); // case-insensitive match
    expect(cmp.categoryDeltas[0]).toMatchObject({ id: 'skills', delta: 28 });
    expect(cmp.wordCount).toEqual({ a: 3, b: 5 });
  });

  it('handles versions without analysis gracefully', () => {
    const cmp = compareVersions(version({}), version({ id: 'v2' }));
    expect(cmp.resumeScore.delta).toBeNull();
    expect(cmp.skillsAdded).toEqual([]);
    expect(cmp.categoryDeltas).toEqual([]);
  });
});
