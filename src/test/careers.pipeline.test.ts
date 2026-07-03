import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ParsedResume, ResumeVersionRow } from '../careers/types';
import { CareersError } from '../careers/utils/errors';

// ── Mock every collaborator so the pipeline's orchestration logic runs pure ──
vi.mock('../careers/services/resumes', () => ({
  createResume: vi.fn(async () => ({ id: 'resume-1' })),
  findVersionBySha: vi.fn(async () => null),
  insertVersion: vi.fn(),
  nextVersionNumber: vi.fn(async () => 1),
  saveNormalizedEntities: vi.fn(async () => undefined),
  updateResume: vi.fn(async () => ({})),
  updateVersion: vi.fn(),
}));
vi.mock('../careers/services/storage', () => ({
  buildStoragePath: vi.fn(() => 'user-1/file.pdf'),
  uploadResumeFile: vi.fn(async () => undefined),
  downloadResumeFile: vi.fn(async () => new Blob(['x'])),
}));
vi.mock('../careers/services/analysisCache', () => ({
  getCachedAnalysis: vi.fn(async () => null),
  saveAnalysis: vi.fn(async () => undefined),
}));
vi.mock('../careers/services/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('../careers/services/careerProfile', () => ({
  applyAnalysisToProfile: vi.fn(async () => undefined),
}));
vi.mock('../careers/ai/parser', () => ({ parseResumeWithAI: vi.fn() }));
vi.mock('../careers/ai/career-dna', () => ({ generateCareerDNA: vi.fn() }));
vi.mock('../careers/ai/scoring', () => ({ scoreResumeWithAI: vi.fn() }));
vi.mock('../careers/ai/ats', () => ({ analyzeATSWithAI: vi.fn() }));
vi.mock('../careers/parser/extract', () => ({ extractResumeText: vi.fn() }));
vi.mock('../careers/parser/validate', () => ({
  validateResumeFile: vi.fn(async () => ({ kind: 'pdf', extension: 'pdf' })),
}));

import { runPipeline, retryVersion } from '../careers/services/pipeline';
import { findVersionBySha, insertVersion, saveNormalizedEntities, updateVersion } from '../careers/services/resumes';
import { getCachedAnalysis } from '../careers/services/analysisCache';
import { parseResumeWithAI } from '../careers/ai/parser';
import { generateCareerDNA } from '../careers/ai/career-dna';
import { scoreResumeWithAI } from '../careers/ai/scoring';
import { analyzeATSWithAI } from '../careers/ai/ats';
import { extractResumeText } from '../careers/parser/extract';

const PARSED = { personal: { name: 'A' }, experience: [], skills: {} } as unknown as ParsedResume;
const DNA = { traits: [{ name: 'Analytical', confidence: 90 }], strengths: [], weaknesses: [], recommendedIndustries: [], suitableRoles: [], personalitySummary: 'x' };
const SCORE = { overall: 71, categories: [], improvements: [] };
const ATS = { overall: 66, checks: [], issues: [] };

const SETTINGS = { model: '', ocrEnabled: true, analyticsEnabled: true };

function baseVersion(): ResumeVersionRow {
  return {
    id: 'ver-1', resume_id: 'resume-1', user_id: 'user-1', version_number: 1,
    file_name: 'cv.pdf', file_path: 'user-1/file.pdf', file_size: 3, file_type: 'application/pdf',
    sha256: 'sha', stage: 'uploaded', status: 'processing', error: '', extraction_method: '',
    raw_text: '', parsed: null, resume_score: null, score_breakdown: null,
    ats_score: null, ats_report: null, career_dna: null, parse_ms: null, ai_ms: null,
    created_at: '', updated_at: '',
  };
}

/** In-memory version row that absorbs updateVersion patches like the DB would. */
let row: ResumeVersionRow;

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps implementations, so per-test overrides from earlier
  // tests must be reset explicitly.
  vi.mocked(findVersionBySha).mockResolvedValue(null);
  vi.mocked(getCachedAnalysis).mockResolvedValue(null);
  row = baseVersion();
  vi.mocked(insertVersion).mockImplementation(async (_uid, fields) => {
    row = { ...row, ...(fields as Partial<ResumeVersionRow>) };
    return row;
  });
  vi.mocked(updateVersion).mockImplementation(async (_uid, _id, patch) => {
    row = { ...row, ...(patch as Partial<ResumeVersionRow>) };
    return row;
  });
  vi.mocked(extractResumeText).mockResolvedValue({ text: 'resume text body '.repeat(20), method: 'pdf-text', pages: 1 });
  vi.mocked(parseResumeWithAI).mockResolvedValue({ result: PARSED, model: 'm', ms: 10 });
  vi.mocked(generateCareerDNA).mockResolvedValue({ result: DNA, model: 'm', ms: 10 });
  vi.mocked(scoreResumeWithAI).mockResolvedValue({ result: SCORE, model: 'm', ms: 10 });
  vi.mocked(analyzeATSWithAI).mockResolvedValue({ result: ATS, model: 'm', ms: 10 });
});

const file = () => new File([new Uint8Array([1, 2, 3])], 'cv.pdf', { type: 'application/pdf' });

describe('runPipeline', () => {
  it('runs every stage in order and completes the version', async () => {
    const steps: string[] = [];
    const outcome = await runPipeline({
      userId: 'user-1', file: file(), settings: SETTINGS,
      onProgress: (p) => steps.push(p.step),
    });
    expect(steps).toEqual(['uploading', 'extracting', 'parsing', 'dna', 'scoring', 'ats', 'saving', 'complete']);
    expect(outcome.version.status).toBe('complete');
    expect(outcome.version.resume_score).toBe(71);
    expect(outcome.version.ats_score).toBe(66);
    expect(outcome.reusedAnalysis).toBe(false);
    expect(saveNormalizedEntities).toHaveBeenCalledWith('user-1', 'ver-1', PARSED);
  });

  it('reuses a byte-identical previous upload without any AI calls', async () => {
    vi.mocked(findVersionBySha).mockResolvedValue({
      ...baseVersion(), status: 'complete', stage: 'complete',
      parsed: PARSED, resume_score: 80, ats_score: 75, career_dna: DNA, raw_text: 'cached',
    });
    const outcome = await runPipeline({
      userId: 'user-1', file: file(), settings: SETTINGS, onProgress: () => undefined,
    });
    expect(outcome.reusedAnalysis).toBe(true);
    expect(outcome.version.resume_score).toBe(80);
    expect(parseResumeWithAI).not.toHaveBeenCalled();
    expect(scoreResumeWithAI).not.toHaveBeenCalled();
  });

  it('uses the analysis cache instead of calling AI again', async () => {
    vi.mocked(getCachedAnalysis).mockImplementation(async (_u, _sha, kind) => {
      if (kind === 'parse') return PARSED;
      if (kind === 'dna') return DNA;
      if (kind === 'score') return SCORE;
      return ATS;
    });
    const outcome = await runPipeline({
      userId: 'user-1', file: file(), settings: SETTINGS, onProgress: () => undefined,
    });
    expect(outcome.version.status).toBe('complete');
    expect(parseResumeWithAI).not.toHaveBeenCalled();
    expect(generateCareerDNA).not.toHaveBeenCalled();
  });

  it('marks the version failed, keeps completed stages, and tags the error for resume', async () => {
    vi.mocked(scoreResumeWithAI).mockRejectedValue(new CareersError('ai-limit', 'Daily AI limit reached.'));
    await expect(
      runPipeline({ userId: 'user-1', file: file(), settings: SETTINGS, onProgress: () => undefined })
    ).rejects.toMatchObject({ code: 'ai-limit', versionId: 'ver-1', resumeId: 'resume-1' });
    expect(row.status).toBe('failed');
    expect(row.error).toContain('Daily AI limit');
    // Earlier stages survive for the retry to skip.
    expect(row.parsed).toEqual(PARSED);
    expect(row.career_dna).toEqual(DNA);
  });
});

describe('retryVersion', () => {
  it('continues from the last completed stage without re-running earlier ones', async () => {
    // Failed after DNA: text + parse + dna done, scores missing.
    row = {
      ...baseVersion(), status: 'failed', error: 'boom', stage: 'dna',
      raw_text: 'existing text', parsed: PARSED, career_dna: DNA,
    };
    const steps: string[] = [];
    const done = await retryVersion('user-1', row, SETTINGS, (p) => steps.push(p.step));
    expect(done.status).toBe('complete');
    expect(extractResumeText).not.toHaveBeenCalled();
    expect(parseResumeWithAI).not.toHaveBeenCalled();
    expect(generateCareerDNA).not.toHaveBeenCalled();
    expect(scoreResumeWithAI).toHaveBeenCalledTimes(1);
    expect(analyzeATSWithAI).toHaveBeenCalledTimes(1);
    expect(steps).toEqual(['scoring', 'ats', 'saving', 'complete']);
  });
});
