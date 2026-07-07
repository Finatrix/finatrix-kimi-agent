/**
 * The resume processing pipeline:
 *
 *   Upload → Storage → Text extraction → AI parse → Career DNA
 *          → Resume Score → ATS Score → Save → Dashboard refresh
 *
 * Design properties:
 *  • Resumable — every stage persists onto the version row, so a failed run
 *    keeps the uploaded file + completed stages and `retryVersion` continues
 *    from wherever it stopped (re-downloading the stored file if needed).
 *  • Cost-aware — byte-hash dedupe reuses a previous version's complete
 *    analysis; each AI task is cached by text hash in resume_analysis, so
 *    the same content is never analysed twice.
 *  • Honest progress — onProgress reports the real stage; nothing is faked.
 */

import { parseResumeWithAI } from '../ai/parser';
import { generateCareerDNA } from '../ai/career-dna';
import { scoreResumeWithAI } from '../ai/scoring';
import { analyzeATSWithAI } from '../ai/ats';
import { extractResumeText } from '../parser/extract';
import { validateResumeFile } from '../parser/validate';
import type {
  ATSReport,
  CareerDNA,
  CareersSettings,
  ParsedResume,
  PipelineProgress,
  ResumeScoreReport,
  ResumeVersionRow,
} from '../types';
import { CareersError, toCareersError, withRetry } from '../utils/errors';
import { sha256OfBytes, sha256OfText } from '../utils/hash';
import { sanitizeFileName } from '../utils/sanitize';
import { getCachedAnalysis, saveAnalysis } from './analysisCache';
import { trackEvent } from './analytics';
import { applyAnalysisToProfile } from './careerProfile';
import {
  createResume,
  findVersionBySha,
  insertVersion,
  nextVersionNumber,
  saveNormalizedEntities,
  updateResume,
  updateVersion,
} from './resumes';
import { buildStoragePath, downloadResumeFile, uploadResumeFile } from './storage';

export interface PipelineInput {
  userId: string;
  file: File;
  /** Attach as a new version of an existing resume family… */
  resumeId?: string;
  /** …or create a new family with this display name. */
  resumeName?: string;
  industry?: string;
  settings: CareersSettings;
  onProgress: (p: PipelineProgress) => void;
}

export interface PipelineOutcome {
  resumeId: string;
  version: ResumeVersionRow;
  /** True when a byte-identical earlier upload's analysis was reused. */
  reusedAnalysis: boolean;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineOutcome> {
  const { userId, file, settings, onProgress } = input;
  onProgress({ step: 'uploading', pct: null });

  const { extension } = await validateResumeFile(file);
  const bytes = await file.arrayBuffer();
  const sha256 = await sha256OfBytes(bytes);
  trackEvent('upload_started');

  // ── Duplicate detection: reuse a byte-identical, fully analysed upload ──
  const duplicate = await findVersionBySha(userId, sha256).catch(() => null);
  const reusable = duplicate && duplicate.status === 'complete' ? duplicate : null;

  const resumeId = input.resumeId ?? (
    await createResume(userId, {
      name: input.resumeName || sanitizeFileName(file.name).replace(/\.[a-z0-9]+$/i, ''),
      industry: input.industry,
    })
  ).id;

  let version: ResumeVersionRow;
  try {
    const versionNumber = await nextVersionNumber(userId, resumeId);

    if (reusable) {
      // Same bytes already analysed: share the stored file, copy the results.
      version = await insertVersion(userId, {
        resume_id: resumeId,
        version_number: versionNumber,
        file_name: sanitizeFileName(file.name),
        file_path: reusable.file_path,
        file_size: file.size,
        file_type: file.type,
        sha256,
        stage: 'complete',
        status: 'complete',
        extraction_method: reusable.extraction_method,
        raw_text: reusable.raw_text,
        parsed: reusable.parsed,
        resume_score: reusable.resume_score,
        score_breakdown: reusable.score_breakdown,
        ats_score: reusable.ats_score,
        ats_report: reusable.ats_report,
        career_dna: reusable.career_dna,
        parse_ms: reusable.parse_ms,
        ai_ms: reusable.ai_ms,
      });
      if (reusable.parsed) await saveNormalizedEntities(userId, version.id, reusable.parsed);
      onProgress({ step: 'saving', pct: null });
      await finalize(userId, resumeId, version.id, input.industry);
      onProgress({ step: 'complete', pct: null });
      trackEvent('upload_completed');
      return { resumeId, version, reusedAnalysis: true };
    }

    const path = buildStoragePath(userId, extension);
    await withRetry(() => uploadResumeFile(path, file));
    version = await insertVersion(userId, {
      resume_id: resumeId,
      version_number: versionNumber,
      file_name: sanitizeFileName(file.name),
      file_path: path,
      file_size: file.size,
      file_type: file.type,
      sha256,
      stage: 'uploaded',
      status: 'processing',
    });
  } catch (e) {
    trackEvent('upload_failed');
    throw toCareersError(e);
  }

  version = await processVersion(userId, version, file, settings, onProgress);
  await finalize(userId, resumeId, version.id, input.industry);
  onProgress({ step: 'complete', pct: null });
  trackEvent('upload_completed');
  return { resumeId, version, reusedAnalysis: false };
}

/** Continue a failed/interrupted version from its last completed stage. */
export async function retryVersion(
  userId: string,
  version: ResumeVersionRow,
  settings: CareersSettings,
  onProgress: (p: PipelineProgress) => void
): Promise<ResumeVersionRow> {
  let source: File | null = null;
  if (!version.raw_text) {
    onProgress({ step: 'uploading', pct: null });
    const blob = await downloadResumeFile(version.file_path);
    source = new File([blob], version.file_name, { type: version.file_type || blob.type });
  }
  await updateVersion(userId, version.id, { status: 'processing', error: '' });
  const done = await processVersion(userId, { ...version, status: 'processing', error: '' }, source, settings, onProgress);
  await finalize(userId, version.resume_id, done.id, undefined);
  onProgress({ step: 'complete', pct: null });
  return done;
}

// ─────────────────────────── internals ───────────────────────────

async function processVersion(
  userId: string,
  version: ResumeVersionRow,
  file: File | null,
  settings: CareersSettings,
  onProgress: (p: PipelineProgress) => void
): Promise<ResumeVersionRow> {
  try {
    // ── Text extraction ──
    let rawText = version.raw_text;
    if (!rawText) {
      if (!file) throw new CareersError('storage', 'The stored resume file could not be loaded for processing.');
      onProgress({ step: 'extracting', pct: null });
      const started = performance.now();
      const extraction = await extractResumeText(file, {
        ocrEnabled: settings.ocrEnabled,
        onOcrProgress: (pct) => onProgress({ step: 'extracting', pct }),
      });
      const parseMs = Math.round(performance.now() - started);
      rawText = extraction.text;
      if (extraction.method === 'ocr') trackEvent('ocr_used');
      trackEvent('parse_completed', parseMs);
      version = await updateVersion(userId, version.id, {
        raw_text: rawText,
        extraction_method: extraction.method,
        stage: 'extracted',
        parse_ms: parseMs,
      });
    }

    const textSha = await sha256OfText(rawText);
    const model = settings.model;
    let aiMs = version.ai_ms ?? 0;

    // ── AI parse ──
    let parsed = version.parsed;
    if (!parsed) {
      onProgress({ step: 'parsing', pct: null });
      const { result, ms } = await runCachedTask<ParsedResume>(
        userId, version.id, textSha, 'parse',
        () => withRetry(() => parseResumeWithAI(rawText, model), { attempts: 2 })
      );
      parsed = result;
      aiMs += ms;
      version = await updateVersion(userId, version.id, { parsed, stage: 'parsed', ai_ms: aiMs });
      await saveNormalizedEntities(userId, version.id, parsed);
    }
    const parsedResume = parsed;

    // ── Career DNA ──
    let dna = version.career_dna;
    if (!dna) {
      onProgress({ step: 'dna', pct: null });
      const { result, ms } = await runCachedTask<CareerDNA>(
        userId, version.id, textSha, 'dna',
        () => withRetry(() => generateCareerDNA(parsedResume, model), { attempts: 2 })
      );
      dna = result;
      aiMs += ms;
      version = await updateVersion(userId, version.id, { career_dna: dna, stage: 'dna', ai_ms: aiMs });
      await applyAnalysisToProfile(userId, parsedResume, dna).catch(() => undefined);
    }

    // ── Resume Score ──
    if (version.resume_score == null) {
      onProgress({ step: 'scoring', pct: null });
      const { result, ms } = await runCachedTask<ResumeScoreReport>(
        userId, version.id, textSha, 'score',
        () => withRetry(() => scoreResumeWithAI(rawText, model), { attempts: 2 })
      );
      aiMs += ms;
      version = await updateVersion(userId, version.id, {
        resume_score: result.overall,
        score_breakdown: result,
        stage: 'scored',
        ai_ms: aiMs,
      });
      trackEvent('resume_score', result.overall);
    }

    // ── ATS Score: deliberately NOT run here ──
    // A generic no-JD ATS score is misleading. ATS scoring now requires a job
    // description and runs on demand via runJdAts() (Resume Library → ATS
    // panel). Versions complete with ats_score null until the user provides a
    // JD; older versions keep their previously computed scores.

    // ── Finish ──
    onProgress({ step: 'saving', pct: null });
    trackEvent('ai_completed', aiMs);
    return await updateVersion(userId, version.id, { status: 'complete', stage: 'complete', error: '' });
  } catch (e) {
    const err = toCareersError(e);
    trackEvent('upload_failed');
    // Preserve completed stages; record why it stopped so retry can resume.
    await updateVersion(userId, version.id, { status: 'failed', error: err.message }).catch(() => undefined);
    err.versionId = version.id;
    err.resumeId = version.resume_id;
    throw err;
  }
}

/**
 * JD-aware ATS scoring (the required workflow: no ATS score without a job
 * description). Cached by resume text + file name + JD text, persisted onto
 * the version row exactly like the other analysis stages.
 */
export async function runJdAts(
  userId: string,
  version: ResumeVersionRow,
  jobText: string,
  settings: CareersSettings
): Promise<ResumeVersionRow> {
  const rawText = version.raw_text;
  if (!rawText) {
    throw new CareersError('validation', 'This version has no extracted text — re-run the analysis first.');
  }
  const jd = jobText.trim();
  if (jd.length < 100) {
    throw new CareersError('validation', 'Paste a fuller job description (at least a few sentences).');
  }
  const atsSha = await sha256OfText(`${rawText}\n::${version.file_name}\n::jd::${jd}`);
  const { result } = await runCachedTask<ATSReport>(
    userId, version.id, atsSha, 'ats',
    () => withRetry(() => analyzeATSWithAI(rawText, version.file_name, settings.model, jd), { attempts: 2 })
  );
  trackEvent('ats_score', result.overall);
  return updateVersion(userId, version.id, {
    ats_score: result.overall,
    ats_report: result,
  });
}

/** Check the analysis cache before paying for an AI task; store fresh results. */
async function runCachedTask<T>(
  userId: string,
  versionId: string,
  inputSha: string,
  kind: 'parse' | 'dna' | 'score' | 'ats',
  task: () => Promise<{ result: T; model: string; ms: number }>
): Promise<{ result: T; ms: number }> {
  const cached = await getCachedAnalysis<T>(userId, inputSha, kind).catch(() => null);
  if (cached) return { result: cached, ms: 0 };
  const { result, model, ms } = await task();
  await saveAnalysis(userId, versionId, inputSha, kind, model, result, ms).catch(() => undefined);
  return { result, ms };
}

async function finalize(
  userId: string,
  resumeId: string,
  versionId: string,
  industry: string | undefined
): Promise<void> {
  const patch: Parameters<typeof updateResume>[2] = { current_version_id: versionId };
  if (industry) patch.industry = industry;
  await updateResume(userId, resumeId, patch);
}
