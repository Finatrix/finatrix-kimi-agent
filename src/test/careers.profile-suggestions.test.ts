import { describe, it, expect } from 'vitest';
import { buildProfileSuggestions } from '../careers/services/careerProfile';
import type { CareerProfileRow, ParsedResume } from '../careers/types';

function profile(over: Partial<CareerProfileRow> = {}): CareerProfileRow {
  return {
    user_id: 'u', current_role: '', preferred_role: '', preferred_industry: '',
    years_experience: null, highest_qualification: '', primary_skills: [], secondary_skills: [],
    location_preference: '', employment_type: '', salary_expectation: '', notice_period: '',
    visa_status: '', work_rights: '', languages: [], career_dna: null, suggestions: {},
    settings: {}, created_at: '', updated_at: '',
    ...over,
  };
}

function parsed(): ParsedResume {
  return {
    personal: { name: 'A', email: '', phone: '', location: 'Bengaluru', linkedin: '', github: '', portfolio: '' },
    summary: '', careerObjective: '', yearsOfExperience: 6,
    currentDesignation: 'Senior Analyst', currentIndustry: 'Finance',
    experience: [], education: [{ institution: 'IIM', degree: 'MBA', field: 'Finance', startDate: '', endDate: '', grade: '' }],
    skills: {
      technical: ['SQL', 'Excel'], soft: ['Communication'], business: [], leadership: [],
      tools: ['Tableau'], frameworks: [], programmingLanguages: [], cloudPlatforms: [], databases: [],
    },
    projects: [], certifications: [], languages: ['English', 'Hindi'],
    achievements: [], awards: [], publications: [], volunteerWork: [], publicSpeaking: [], research: [], patents: [],
    insights: { careerGaps: [], promotionHistory: '', employmentStability: '', jobSwitchingPattern: '', careerProgression: '' },
  };
}

describe('buildProfileSuggestions', () => {
  it('suggests values for empty fields', () => {
    const s = buildProfileSuggestions(profile(), parsed());
    expect(s.current_role).toBe('Senior Analyst');
    expect(s.preferred_industry).toBe('Finance');
    expect(s.years_experience).toBe('6');
    expect(s.highest_qualification).toBe('MBA — Finance');
    expect(s.primary_skills).toBe('SQL, Excel');
    expect(s.languages).toBe('English, Hindi');
  });

  it('never suggests over a matching manual value', () => {
    const s = buildProfileSuggestions(
      profile({ current_role: 'Senior Analyst', languages: ['English', 'Hindi'] }),
      parsed()
    );
    expect(s.current_role).toBeUndefined();
    expect(s.languages).toBeUndefined();
    // Differing manual values still yield a *suggestion*, never an overwrite.
    const s2 = buildProfileSuggestions(profile({ current_role: 'VP Risk' }), parsed());
    expect(s2.current_role).toBe('Senior Analyst');
  });
});
