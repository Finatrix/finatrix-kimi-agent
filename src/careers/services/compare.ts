/**
 * Version comparison — pure functions that diff two analysed resume
 * versions for the side-by-side compare view in the Resume Library.
 */

import type { ResumeVersionRow, SkillGroups } from '../types';

export interface ScoreDelta {
  id: string;
  label: string;
  a: number;
  b: number;
  delta: number;
}

export interface VersionComparison {
  resumeScore: { a: number | null; b: number | null; delta: number | null };
  atsScore: { a: number | null; b: number | null; delta: number | null };
  categoryDeltas: ScoreDelta[];
  skillsAdded: string[];
  skillsRemoved: string[];
  skillsShared: string[];
  experienceCount: { a: number; b: number };
  wordCount: { a: number; b: number };
}

function allSkills(groups: SkillGroups | undefined | null): string[] {
  if (!groups) return [];
  const all = [
    ...groups.technical, ...groups.soft, ...groups.business, ...groups.leadership,
    ...groups.tools, ...groups.frameworks, ...groups.programmingLanguages,
    ...groups.cloudPlatforms, ...groups.databases,
  ];
  return [...new Set(all.map((s) => s.trim()).filter(Boolean))];
}

function delta(a: number | null, b: number | null): number | null {
  return a != null && b != null ? b - a : null;
}

/** Compare version A (baseline) against version B (candidate). */
export function compareVersions(a: ResumeVersionRow, b: ResumeVersionRow): VersionComparison {
  const skillsA = allSkills(a.parsed?.skills);
  const skillsB = allSkills(b.parsed?.skills);
  const lowerA = new Set(skillsA.map((s) => s.toLowerCase()));
  const lowerB = new Set(skillsB.map((s) => s.toLowerCase()));

  const categoriesA = new Map((a.score_breakdown?.categories ?? []).map((c) => [c.id, c]));
  const categoryDeltas: ScoreDelta[] = (b.score_breakdown?.categories ?? []).flatMap((cb) => {
    const ca = categoriesA.get(cb.id);
    if (!ca) return [];
    return [{ id: cb.id, label: cb.label, a: ca.score, b: cb.score, delta: cb.score - ca.score }];
  });
  categoryDeltas.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  return {
    resumeScore: { a: a.resume_score, b: b.resume_score, delta: delta(a.resume_score, b.resume_score) },
    atsScore: { a: a.ats_score, b: b.ats_score, delta: delta(a.ats_score, b.ats_score) },
    categoryDeltas,
    skillsAdded: skillsB.filter((s) => !lowerA.has(s.toLowerCase())),
    skillsRemoved: skillsA.filter((s) => !lowerB.has(s.toLowerCase())),
    skillsShared: skillsB.filter((s) => lowerA.has(s.toLowerCase())),
    experienceCount: { a: a.parsed?.experience.length ?? 0, b: b.parsed?.experience.length ?? 0 },
    wordCount: {
      a: a.raw_text ? a.raw_text.split(/\s+/).filter(Boolean).length : 0,
      b: b.raw_text ? b.raw_text.split(/\s+/).filter(Boolean).length : 0,
    },
  };
}
