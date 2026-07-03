/**
 * Career profile persistence. The profile is the user's manually-owned
 * professional identity: resume uploads only ever write into `suggestions`
 * and `career_dna` — a suggestion becomes a real field value only when the
 * user accepts it, so manual edits are never overwritten by AI.
 */

import { supabase } from '../../lib/supabase';
import { DEFAULT_SETTINGS } from '../constants';
import type {
  CareerDNA,
  CareerProfileFields,
  CareerProfileRow,
  CareersSettings,
  ParsedResume,
} from '../types';
import { mapSupabaseError } from '../utils/errors';

export async function getOrCreateProfile(userId: string): Promise<CareerProfileRow> {
  const { data, error } = await supabase
    .from('career_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error, 'Loading your career profile');
  if (data) return data as CareerProfileRow;

  const { data: created, error: insertError } = await supabase
    .from('career_profiles')
    .insert({ user_id: userId })
    .select()
    .single();
  if (insertError) {
    // A parallel tab may have created it between our select and insert.
    if (insertError.code === '23505') {
      const { data: existing, error: reselectError } = await supabase
        .from('career_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (!reselectError && existing) return existing as CareerProfileRow;
    }
    throw mapSupabaseError(insertError, 'Creating your career profile');
  }
  return created as CareerProfileRow;
}

export async function updateProfileFields(
  userId: string,
  patch: Partial<CareerProfileFields>
): Promise<CareerProfileRow> {
  const { data, error } = await supabase
    .from('career_profiles')
    .update(patch)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving your career profile');
  return data as CareerProfileRow;
}

export async function updateProfileMeta(
  userId: string,
  patch: Partial<Pick<CareerProfileRow, 'career_dna' | 'suggestions' | 'settings'>>
): Promise<CareerProfileRow> {
  const { data, error } = await supabase
    .from('career_profiles')
    .update(patch)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw mapSupabaseError(error, 'Saving settings');
  return data as CareerProfileRow;
}

export function resolveSettings(profile: CareerProfileRow | null): CareersSettings {
  return { ...DEFAULT_SETTINGS, ...(profile?.settings ?? {}) };
}

/**
 * Turn a parsed resume into profile field suggestions. Only fields that are
 * currently empty on the profile, or clearly differ, become suggestions —
 * and nothing is applied automatically.
 */
export function buildProfileSuggestions(
  profile: CareerProfileRow,
  parsed: ParsedResume
): Partial<Record<keyof CareerProfileFields, string>> {
  const suggestions: Partial<Record<keyof CareerProfileFields, string>> = {};
  const offer = (key: keyof CareerProfileFields, current: string | number | string[] | null, value: string) => {
    const currentStr = Array.isArray(current) ? current.join(', ') : String(current ?? '').trim();
    const next = value.trim();
    if (next && next !== currentStr) suggestions[key] = next;
  };

  offer('current_role', profile.current_role, parsed.currentDesignation);
  offer('preferred_industry', profile.preferred_industry, parsed.currentIndustry);
  if (parsed.yearsOfExperience != null) {
    offer('years_experience', profile.years_experience, String(parsed.yearsOfExperience));
  }
  const topDegree = parsed.education[0];
  if (topDegree) {
    offer(
      'highest_qualification',
      profile.highest_qualification,
      [topDegree.degree, topDegree.field].filter(Boolean).join(' — ')
    );
  }
  offer('primary_skills', profile.primary_skills, parsed.skills.technical.slice(0, 10).join(', '));
  offer(
    'secondary_skills',
    profile.secondary_skills,
    [...parsed.skills.soft.slice(0, 5), ...parsed.skills.tools.slice(0, 5)].join(', ')
  );
  offer('languages', profile.languages, parsed.languages.join(', '));
  offer('location_preference', profile.location_preference, parsed.personal.location);
  return suggestions;
}

/** Store fresh Career DNA + merged suggestions after a successful analysis. */
export async function applyAnalysisToProfile(
  userId: string,
  parsed: ParsedResume,
  dna: CareerDNA
): Promise<void> {
  const profile = await getOrCreateProfile(userId);
  const suggestions = { ...profile.suggestions, ...buildProfileSuggestions(profile, parsed) };
  await updateProfileMeta(userId, { career_dna: dna, suggestions });
}
