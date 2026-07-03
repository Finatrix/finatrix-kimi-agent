/**
 * Upload page — pick a file, choose where it lands (new resume or a new
 * version of an existing one), then watch the real pipeline stages run:
 * upload → extraction → AI parse → Career DNA → scores → save.
 */

import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { Icon } from '../../tools/ui/Icon';
import { PageHead } from '../../tools/ui/common';
import { Dropzone } from '../components/Dropzone';
import { PipelineProgress } from '../components/PipelineProgress';
import { ScoreRing } from '../components/ScoreRing';
import { ErrorCard } from '../components/states';
import { CAREERS_ROUTES, INDUSTRY_OPTIONS } from '../constants';
import { useCareers } from '../context/CareersContext';
import { validateResumeFile } from '../parser/validate';
import { runPipeline, retryVersion, type PipelineOutcome } from '../services/pipeline';
import { getVersion } from '../services/resumes';
import type { PipelineProgress as Progress } from '../types';
import { CareersError, toCareersError } from '../utils/errors';
import { formatBytes } from '../utils/format';
import { sanitizeFileName } from '../utils/sanitize';

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

  const onFile = useCallback(async (f: File) => {
    try {
      await validateResumeFile(f);
      setFile(f);
      setName(sanitizeFileName(f.name).replace(/\.[a-z0-9]+$/i, ''));
      setPhase('ready');
      setError(null);
    } catch (e) {
      setError(toCareersError(e));
      setPhase('idle');
    }
  }, []);

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
    <div className="fx-page">
      <PageHead
        chip="FinatriX Careers"
        chipColor="#D4AF37"
        chipBg="rgba(212,175,55,.12)"
        icon="briefcase"
        title="Upload your resume"
      >
        PDF, DOCX or DOC up to 10 MB. We extract the text, build your Career DNA and
        score it for recruiters and ATS systems — all saved privately to your account.
      </PageHead>

      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {error && phase !== 'error' && <ErrorCard error={error} />}

        {(phase === 'idle' || phase === 'ready') && (
          <>
            {!file ? (
              <div className="card">
                <Dropzone onFile={(f) => void onFile(f)} />
              </div>
            ) : (
              <div className="card result-card-anim" style={{ animationDelay: '0ms' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                  <div className="act-ic" style={{ background: 'rgba(212,175,55,.12)', color: 'var(--gold)' }}>
                    <Icon name="bills" size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink2)' }}>{formatBytes(file.size)}</div>
                  </div>
                  <button className="icon-btn" aria-label="Remove file" onClick={reset}>✕</button>
                </div>

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
                        placeholder="e.g. Finance Resume"
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

                <button className="btn" onClick={() => void start()}>
                  Analyse resume
                </button>
              </div>
            )}
            <p className="note" style={{ textAlign: 'center', marginTop: 4 }}>
              Files are stored encrypted in your private storage. Identical files are never
              analysed twice — we detect duplicates and reuse results.
            </p>
          </>
        )}

        {phase === 'running' && (
          <div className="card">
            <div className="panel-eyebrow">Processing</div>
            <div className="panel-title" style={{ marginBottom: 18 }}>{file?.name}</div>
            <PipelineProgress progress={progress} />
          </div>
        )}

        {phase === 'error' && error && (
          <>
            <div className="card">
              <div className="panel-eyebrow">Processing stopped</div>
              <div className="panel-title" style={{ marginBottom: 18 }}>{file?.name}</div>
              <PipelineProgress progress={progress} failedAt={failedStep ?? progress.step} />
            </div>
            <ErrorCard error={error} onRetry={error.retryable ? () => void retry() : undefined} />
            {!error.retryable && (
              <button className="btn btn-ghost" onClick={reset}>Choose a different file</button>
            )}
          </>
        )}

        {phase === 'done' && outcome && (
          <div className="card result-hero-anim" style={{ textAlign: 'center' }}>
            <div
              className="dz-ic"
              style={{ background: 'rgba(52,210,122,.12)', color: 'var(--green)', margin: '0 auto 14px' }}
            >
              <Icon name="check" size={24} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>
              Analysis complete
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 6 }}>
              {outcome.version.file_name} · version {outcome.version.version_number}
              {outcome.reusedAnalysis ? ' · duplicate detected, analysis reused' : ''}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 28, margin: '24px 0' }}>
              <ScoreRing score={outcome.version.resume_score} caption="Resume score" />
              <ScoreRing score={outcome.version.ats_score} caption="ATS score" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Link to={CAREERS_ROUTES.dashboard} className="btn btn-ghost" style={{ flex: 1, textDecoration: 'none' }}>
                View dashboard
              </Link>
              <Link to={CAREERS_ROUTES.resumes} className="btn" style={{ flex: 1, textDecoration: 'none' }}>
                Open library
              </Link>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={reset}>
              Upload another resume
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
