/**
 * Upload page — pick a file, choose where it lands (new resume or a new
 * version of an existing one), then watch the real pipeline stages run:
 * upload → extraction → AI parse → Career DNA → scores → save.
 */

import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { track } from '../../lib/analytics';
import { useToast } from '../../tools/ui/Toast';
import { Dropzone } from '../components/Dropzone';
import { PipelineProgress } from '../components/PipelineProgress';
import { ErrorCard } from '../components/states';
import { CAREERS_ROUTES, INDUSTRY_OPTIONS } from '../constants';
import { useCareers } from '../context/CareersContext';
import { validateResumeFile } from '../parser/validate';
import { runPipeline, retryVersion, type PipelineOutcome } from '../services/pipeline';
import { getVersion, uniqueResumeName } from '../services/resumes';
import type { PipelineProgress as Progress } from '../types';
import { CareersError, toCareersError } from '../utils/errors';
import { formatBytes } from '../utils/format';
import { sanitizeFileName } from '../utils/sanitize';
import { RsIcon } from '../areas/resume/icons';
import '../areas/resume/resume.css';

type Phase = 'idle' | 'ready' | 'running' | 'done' | 'error';

export default function CareersUpload() {
  const { user } = useAuth();
  const { resumes, settings, refresh } = useCareers();
  const { notify } = useToast();

  const [phase, setPhase] = useState<Phase>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [targetResume, setTargetResume] = useState(''); // '' = create new
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [progress, setProgress] = useState<Progress>({ step: 'uploading', pct: null });
  const [failedStep, setFailedStep] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PipelineOutcome | null>(null);
  const [error, setError] = useState<CareersError | null>(null);
  const failedVersionId = useRef<string | null>(null);
  // Live step mirror for failure attribution (written from pipeline callbacks).
  const progressRef = useRef<Progress>({ step: 'uploading', pct: null });

  const activeResumes = resumes.filter((r) => !r.is_archived);
  // Every family, archived included — a name clash with an archived resume is
  // still a clash the moment it is restored.
  const existingNames = resumes.map((r) => r.name);

  const onFile = useCallback(async (f: File) => {
    try {
      await validateResumeFile(f);
      setFile(f);
      // Suffixed if a family already owns this name, so re-uploading after a
      // failed run never produces two indistinguishable library cards.
      setName(uniqueResumeName(sanitizeFileName(f.name).replace(/\.[a-z0-9]+$/i, ''), existingNames));
      setPhase('ready');
      setError(null);
    } catch (e) {
      setError(toCareersError(e));
      setPhase('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumes]);

  const start = useCallback(async () => {
    if (!user || !file) return;
    setPhase('running');
    setError(null);
    setFailedStep(null);
    const onProgress = (p: Progress) => {
      progressRef.current = p;
      setProgress(p);
    };
    try {
      const result = await runPipeline({
        userId: user.id,
        file,
        resumeId: targetResume || undefined,
        resumeName: targetResume ? undefined : name.trim() || undefined,
        industry: industry || undefined,
        settings,
        onProgress,
      });
      setOutcome(result);
      setPhase('done');
      // Emitted on the pipeline COMPLETING, not on the file being dropped: a
      // resume that fails to parse is not an uploaded resume, and counting the
      // drop would make the funnel's most fragile step look perfect.
      // `reusedAnalysis` separates a genuine new analysis from a duplicate
      // re-upload, which cost nothing and mean something different.
      track('resume_uploaded', { ok: true, kind: result.reusedAnalysis ? 'duplicate' : 'new' });
      await refresh();
      if (result.reusedAnalysis) {
        notify('Duplicate detected — reused the existing analysis at no AI cost.', 'info');
      } else {
        notify('Resume analysed and saved.', 'ok');
      }
    } catch (e) {
      const err = toCareersError(e);
      failedVersionId.current = err.versionId ?? null;
      setFailedStep(progressRef.current.step);
      // `where` is the pipeline stage that failed — parse, OCR, AI, storage.
      // Upload is the first thing a new Careers subscriber does, so a stage
      // that fails often is the most expensive bug in the product to not know
      // about.
      track('resume_uploaded', { ok: false, where: progressRef.current.step, kind: err.code });
      setError(err);
      setPhase('error');
      await refresh();
    }
  }, [user, file, targetResume, name, industry, settings, refresh, notify]);

  const retry = useCallback(async () => {
    if (!user) return;
    // A persisted failed version resumes from its last completed stage;
    // otherwise (failed before any row existed) just start over.
    if (!failedVersionId.current) {
      void start();
      return;
    }
    setPhase('running');
    setError(null);
    setFailedStep(null);
    try {
      const version = await getVersion(user.id, failedVersionId.current);
      if (!version) {
        void start();
        return;
      }
      const done = await retryVersion(user.id, version, settings, (p) => {
        progressRef.current = p;
        setProgress(p);
      });
      setOutcome({ resumeId: done.resume_id, version: done, reusedAnalysis: false });
      setPhase('done');
      await refresh();
      notify('Resume analysed and saved.', 'ok');
    } catch (e) {
      const err = toCareersError(e);
      setFailedStep(progressRef.current.step);
      setError(err);
      setPhase('error');
    }
  }, [user, settings, refresh, notify, start]);

  const reset = () => {
    setPhase('idle');
    setFile(null);
    setOutcome(null);
    setError(null);
    setFailedStep(null);
    failedVersionId.current = null;
  };

  return (
    <div className="rs-narrow">
      {error && phase !== 'error' && <ErrorCard error={error} />}

      {(phase === 'idle' || phase === 'ready') && (
        <>
          {!file ? (
            <Dropzone onFile={(f) => void onFile(f)} />
          ) : (
            <section className="cx-panel" aria-label="Resume details">
              <div className="rs-file">
                <span className="rs-file-icon"><RsIcon name="file" size={22} /></span>
                <div className="cx-row-main">
                  <p className="cx-row-title">{file.name}</p>
                  <p className="cx-row-meta"><span className="cx-num">{formatBytes(file.size)}</span></p>
                </div>
                <button type="button" className="cx-icon-btn" aria-label={`Remove ${file.name}`} onClick={reset}>
                  <RsIcon name="close" size={16} />
                </button>
              </div>

              <div className="rs-fields">
                <div className="fg">
                  <label className="fl" htmlFor="up-target">Save as</label>
                  <select
                    id="up-target"
                    className="fs"
                    value={targetResume}
                    onChange={(e) => setTargetResume(e.target.value)}
                  >
                    <option value="">New resume</option>
                    {activeResumes.map((r) => (
                      <option key={r.id} value={r.id}>
                        New version of “{r.name}”
                      </option>
                    ))}
                  </select>
                </div>

                {!targetResume && (
                  <>
                    <div className="fg">
                      <label className="fl" htmlFor="up-name">Resume name</label>
                      <input
                        id="up-name"
                        className="fi"
                        value={name}
                        maxLength={80}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Finance resume"
                      />
                    </div>
                    <div className="fg">
                      <label className="fl" htmlFor="up-industry">Target industry (optional)</label>
                      <select id="up-industry" className="fs" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                        <option value="">Not set</option>
                        {INDUSTRY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>

              <button type="button" className="cx-btn cx-btn-primary" onClick={() => void start()}>
                Analyse resume
              </button>
            </section>
          )}
          <p className="cx-sub cx-muted" style={{ marginTop: 14, fontSize: 13 }}>
            Files are stored privately in your account. Identical files are only analysed once.
          </p>
        </>
      )}

      {phase === 'running' && (
        <section className="cx-panel" aria-label="Processing">
          <div className="cx-panel-head"><h2>Analysing {file?.name}</h2></div>
          <PipelineProgress progress={progress} />
        </section>
      )}

      {phase === 'error' && error && (
        <section className="cx-panel" aria-label="Processing stopped">
          <div className="cx-panel-head"><h2>Processing stopped</h2></div>
          <PipelineProgress progress={progress} failedAt={failedStep ?? progress.step} />
          <div className="cx-notice" role="alert" style={{ marginTop: 16 }}>
            <p style={{ margin: 0 }}>{error.message}</p>
          </div>
          <div className="rs-actions-row" style={{ marginTop: 16 }}>
            {error.retryable ? (
              <button type="button" className="cx-btn cx-btn-primary" onClick={() => void retry()}>Try again</button>
            ) : (
              <button type="button" className="cx-btn cx-btn-primary" onClick={reset}>Choose a different file</button>
            )}
          </div>
        </section>
      )}

      {phase === 'done' && outcome && (
        <section className="cx-panel" aria-label="Analysis complete">
          <div className="cx-panel-head"><h2 role="status">Analysis complete</h2></div>
          <p className="cx-sub">
            {outcome.version.file_name}, version <span className="cx-num">{outcome.version.version_number}</span>
            {outcome.reusedAnalysis ? '. This file was analysed before, so the earlier result was reused.' : ''}
          </p>
          <div className="rs-done-scores">
            <div className="rs-big">
              <b>{outcome.version.resume_score ?? '–'}</b>
              <span>Resume score</span>
            </div>
            {outcome.version.ats_score != null && (
              <div className="rs-big">
                <b>{outcome.version.ats_score}</b>
                <span>ATS score</span>
              </div>
            )}
          </div>
          {outcome.version.ats_score == null && (
            <p className="cx-sub cx-muted" style={{ marginBottom: 18 }}>
              Open the analysis from your resume list and add the job description you are targeting to get an ATS score.
            </p>
          )}
          <div className="rs-actions-row">
            <Link to={CAREERS_ROUTES.resumes} className="cx-btn cx-btn-primary">Open resume</Link>
            <Link to={CAREERS_ROUTES.jobs} className="cx-btn">Find matching jobs</Link>
            <button type="button" className="cx-btn cx-btn-quiet" onClick={reset}>Upload another</button>
          </div>
        </section>
      )}
    </div>
  );
}
