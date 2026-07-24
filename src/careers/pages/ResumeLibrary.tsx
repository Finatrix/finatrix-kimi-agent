/**
 * Resume Library — the management center: every resume family with its
 * versions, searchable/sortable/filterable, in grid or list view, with
 * rename / favorite / duplicate / archive / delete / download / retry,
 * a full analysis viewer and side-by-side version comparison.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { Icon } from '../../tools/ui/Icon';
import { PageHead } from '../../tools/ui/common';
import { ScoreRing } from '../components/ScoreRing';
import { ConfirmDialog, EmptyState, ErrorCard, ModalShell, PageLoading } from '../components/states';
import { PipelineProgress } from '../components/PipelineProgress';
import { CAREERS_ROUTES } from '../constants';
import { useCareers } from '../context/CareersContext';
import { compareVersions } from '../services/compare';
import { retryVersion, runJdAts } from '../services/pipeline';
import {
  deleteResume,
  duplicateResume,
  updateResume,
} from '../services/resumes';
import { getResumeFileUrl } from '../services/storage';
import type { PipelineProgress as Progress, ResumeVersionRow, ResumeWithVersions } from '../types';
import { toCareersError } from '../utils/errors';
import { formatBytes, formatDate, formatDateTime, scoreColor } from '../utils/format';

type SortKey = 'updated' | 'name' | 'score' | 'ats';
type FilterKey = 'active' | 'favorites' | 'archived' | 'failed' | 'all';

function currentVersion(r: ResumeWithVersions): ResumeVersionRow | null {
  return r.versions.find((v) => v.id === r.current_version_id) ?? r.versions[0] ?? null;
}

const STATUS_WORD: Record<string, string> = {
  complete: 'analysed',
  failed: 'failed',
  processing: 'still processing',
};

/**
 * One line that identifies a record beyond its name — the file it came from,
 * its analysis outcome and when it last changed. Two families can share a
 * name, a file and a date; they cannot share all of this at once.
 */
function describeResume(r: ResumeWithVersions): string {
  const cur = currentVersion(r);
  const parts = [`“${r.name}”`];
  if (cur) {
    parts.push(cur.file_name);
    parts.push(`v${cur.version_number} · ${STATUS_WORD[cur.status] ?? cur.status}`);
  }
  parts.push(formatDateTime(r.updated_at));
  return parts.join(' · ');
}

export default function ResumeLibrary() {
  const { user } = useAuth();
  const { loading, error, resumes, settings, refresh } = useCareers();
  const { notify } = useToast();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('updated');
  const [filter, setFilter] = useState<FilterKey>('active');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [renameTarget, setRenameTarget] = useState<ResumeWithVersions | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ResumeWithVersions | null>(null);
  const [analysisTarget, setAnalysisTarget] = useState<{ resume: ResumeWithVersions; version: ResumeVersionRow } | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [retryState, setRetryState] = useState<{ versionId: string; progress: Progress } | null>(null);

  // Badge owners across the whole library.
  const { latestId, bestAtsId, bestScoreId } = useMemo(() => {
    let latest: ResumeVersionRow | null = null;
    let bestAts: ResumeVersionRow | null = null;
    let bestScore: ResumeVersionRow | null = null;
    for (const r of resumes) {
      for (const v of r.versions) {
        if (v.status !== 'complete') continue;
        if (!latest || v.created_at > latest.created_at) latest = v;
        if (v.ats_score != null && (bestAts?.ats_score == null || v.ats_score > bestAts.ats_score)) bestAts = v;
        if (v.resume_score != null && (bestScore?.resume_score == null || v.resume_score > bestScore.resume_score)) bestScore = v;
      }
    }
    return { latestId: latest?.id, bestAtsId: bestAts?.id, bestScoreId: bestScore?.id };
  }, [resumes]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = resumes.filter((r) => {
      if (filter === 'active' && r.is_archived) return false;
      if (filter === 'favorites' && (!r.is_favorite || r.is_archived)) return false;
      if (filter === 'archived' && !r.is_archived) return false;
      if (filter === 'failed' && !r.versions.some((v) => v.status === 'failed')) return false;
      return true;
    });
    if (q) {
      list = list.filter((r) =>
        [r.name, r.industry, r.notes, ...r.versions.map((v) => v.file_name)]
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    const score = (r: ResumeWithVersions, key: 'resume_score' | 'ats_score') =>
      Math.max(-1, ...r.versions.map((v) => v[key] ?? -1));
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'score': return score(b, 'resume_score') - score(a, 'resume_score');
        case 'ats': return score(b, 'ats_score') - score(a, 'ats_score');
        default: return b.updated_at.localeCompare(a.updated_at);
      }
    });
  }, [resumes, search, sortBy, filter]);

  const allCompleteVersions = useMemo(
    () =>
      resumes.flatMap((r) =>
        r.versions
          .filter((v) => v.status === 'complete')
          .map((v) => ({ resume: r, version: v }))
      ),
    [resumes]
  );

  // ── actions ──
  const act = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      await refresh();
      notify(`${label}.`, 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  const onToggleFavorite = (r: ResumeWithVersions) =>
    act(r.is_favorite ? 'Removed from favorites' : 'Added to favorites', () =>
      updateResume(user!.id, r.id, { is_favorite: !r.is_favorite }));

  const onToggleArchive = (r: ResumeWithVersions) =>
    act(r.is_archived ? 'Restored from archive' : 'Archived', () =>
      updateResume(user!.id, r.id, { is_archived: !r.is_archived }));

  const onRename = () => {
    if (!renameTarget || !renameValue.trim()) return;
    const target = renameTarget;
    setRenameTarget(null);
    void act('Renamed', () => updateResume(user!.id, target.id, { name: renameValue.trim().slice(0, 80) }));
  };

  const onDuplicate = (r: ResumeWithVersions) =>
    act('Duplicated', () => duplicateResume(user!.id, r));

  const onDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    void act('Deleted', () => deleteResume(user!.id, target));
  };

  const onDownloadOriginal = async (v: ResumeVersionRow) => {
    try {
      const url = await getResumeFileUrl(v.file_path);
      const a = document.createElement('a');
      a.href = url;
      a.download = v.file_name;
      a.rel = 'noopener';
      a.click();
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  const onDownloadJson = (r: ResumeWithVersions, v: ResumeVersionRow) => {
    const payload = {
      resume: r.name,
      version: v.version_number,
      fileName: v.file_name,
      analysedAt: v.updated_at,
      resumeScore: v.resume_score,
      scoreBreakdown: v.score_breakdown,
      atsScore: v.ats_score,
      atsReport: v.ats_report,
      careerDna: v.career_dna,
      parsed: v.parsed,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${r.name.replace(/[^\w-]+/g, '_')}_v${v.version_number}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onRetry = async (v: ResumeVersionRow) => {
    if (!user) return;
    setRetryState({ versionId: v.id, progress: { step: 'uploading', pct: null } });
    try {
      await retryVersion(user.id, v, settings, (p) =>
        setRetryState({ versionId: v.id, progress: p })
      );
      await refresh();
      notify('Analysis completed.', 'ok');
    } catch (e) {
      await refresh();
      notify(toCareersError(e).message, 'error');
    } finally {
      setRetryState(null);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="fx-page">
      <PageHead
        chip="Resume Library"
        chipColor="#D4AF37"
        chipBg="rgba(212,175,55,.12)"
        icon="layers"
        title="Every version, one place"
      >
        Manage your tailored resumes — compare versions, track score improvements and
        keep the strongest one ready for every application.
      </PageHead>

      {error && <ErrorCard error={error} onRetry={() => void refresh()} />}

      {!error && (
        <>
          <div className="lib-toolbar">
            <input
              className="fi"
              type="search"
              placeholder="Search resumes…"
              aria-label="Search resumes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="fs" aria-label="Sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
              <option value="updated">Newest first</option>
              <option value="name">Name A–Z</option>
              <option value="score">Highest Resume Score</option>
              <option value="ats">Highest ATS Score</option>
            </select>
            <select className="fs" aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)}>
              <option value="active">Active</option>
              <option value="favorites">Favorites</option>
              <option value="failed">Needs attention</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
            <button
              className="icon-btn"
              aria-label={view === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
              title={view === 'grid' ? 'List view' : 'Grid view'}
              onClick={() => setView((v) => (v === 'grid' ? 'list' : 'grid'))}
            >
              <Icon name={view === 'grid' ? 'bills' : 'layers'} size={14} />
            </button>
            {allCompleteVersions.length >= 2 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setCompareOpen(true)}>
                Compare versions
              </button>
            )}
          </div>

          {!visible.length ? (
            <div className="card">
              <EmptyState
                icon="layers"
                title={resumes.length ? 'Nothing matches your filters' : 'Your library is empty'}
                action={
                  !resumes.length ? (
                    <Link to={CAREERS_ROUTES.upload} className="btn btn-sm" style={{ textDecoration: 'none', width: 'auto', display: 'inline-block', padding: '12px 28px' }}>
                      Upload your first resume
                    </Link>
                  ) : undefined
                }
              >
                {resumes.length
                  ? 'Try a different search or filter.'
                  : 'Upload a resume to start building your version history.'}
              </EmptyState>
            </div>
          ) : (
            <div className={`lib-grid ${view === 'list' ? 'list' : ''}`}>
              {visible.map((r) => {
                const cur = currentVersion(r);
                return (
                  <div className="card" key={r.id} style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                          {r.is_archived && <span className="badge badge-mute">Archived</span>}
                          {r.is_favorite && <span className="badge badge-gold">★ Favorite</span>}
                          {cur?.id === latestId && <span className="badge badge-blue">Latest</span>}
                          {cur?.id === bestScoreId && <span className="badge badge-green">Top score</span>}
                          {cur?.id === bestAtsId && <span className="badge badge-green">Best ATS</span>}
                          {cur?.status === 'failed' && <span className="badge badge-red">Failed</span>}
                          {cur?.status === 'processing' && <span className="badge badge-mute">Processing</span>}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 650, letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name}
                        </div>
                        {/* Date *and* time: two records created the same day
                            from the same file were otherwise identical here,
                            leaving nothing on the card to tell them apart. */}
                        <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3 }}>
                          {r.industry || 'No industry'} · {r.versions.length} version{r.versions.length === 1 ? '' : 's'} · {formatDateTime(r.updated_at)}
                        </div>
                        {cur && cur.status !== 'complete' && (
                          <div style={{ fontSize: 12, color: cur.status === 'failed' ? 'var(--red)' : 'var(--ink3)', marginTop: 4, fontWeight: 600 }}>
                            {cur.status === 'failed'
                              ? 'Analysis failed — this copy has no scores'
                              : 'Analysis still running'}
                          </div>
                        )}
                      </div>
                      <button
                        className={`icon-btn ${r.is_favorite ? 'gold' : ''}`}
                        aria-label={r.is_favorite ? 'Remove favorite' : 'Mark favorite'}
                        onClick={() => void onToggleFavorite(r)}
                      >
                        ★
                      </button>
                    </div>

                    {cur && (
                      <div style={{ display: 'flex', gap: 18, alignItems: 'center', margin: '16px 0' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor(cur.resume_score) }}>
                            {cur.resume_score ?? '—'}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Resume</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor(cur.ats_score) }}>
                            {cur.ats_score ?? '—'}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>ATS</div>
                        </div>
                        <div style={{ flex: 1, fontSize: 12, color: 'var(--ink2)', minWidth: 0 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cur.file_name}</div>
                          <div style={{ color: 'var(--ink3)' }}>{formatBytes(cur.file_size)} · v{cur.version_number}</div>
                        </div>
                      </div>
                    )}

                    {retryState && cur && retryState.versionId === cur.id && (
                      <div style={{ marginBottom: 14 }}>
                        <PipelineProgress progress={retryState.progress} />
                      </div>
                    )}

                    {cur?.status === 'failed' && cur.error && (
                      <p className="note" style={{ color: 'var(--red)', marginBottom: 12 }}>{cur.error}</p>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto' }}>
                      {cur?.status === 'complete' && (
                        <button className="btn btn-sm" style={{ flex: '1 1 auto' }} onClick={() => setAnalysisTarget({ resume: r, version: cur })}>
                          View analysis
                        </button>
                      )}
                      {cur?.status === 'failed' && !retryState && (
                        <button className="btn btn-sm" style={{ flex: '1 1 auto' }} onClick={() => void onRetry(cur)}>
                          Retry processing
                        </button>
                      )}
                      <button className="icon-btn" title="Rename" aria-label={`Rename ${r.name}`} onClick={() => { setRenameTarget(r); setRenameValue(r.name); }}>
                        <Icon name="bills" size={13} />
                      </button>
                      {cur && (
                        <button className="icon-btn" title="Download original" aria-label="Download original file" onClick={() => void onDownloadOriginal(cur)}>
                          <Icon name="arrow-up" size={13} style={{ transform: 'rotate(180deg)' }} />
                        </button>
                      )}
                      {cur?.parsed && (
                        <button className="icon-btn" title="Download parsed JSON" aria-label="Download parsed JSON" onClick={() => onDownloadJson(r, cur)}>
                          {'{}'}
                        </button>
                      )}
                      <button className="icon-btn" title="Duplicate" aria-label={`Duplicate ${r.name}`} onClick={() => void onDuplicate(r)}>
                        ⧉
                      </button>
                      <button className="icon-btn" title={r.is_archived ? 'Restore' : 'Archive'} aria-label={r.is_archived ? 'Restore' : 'Archive'} onClick={() => void onToggleArchive(r)}>
                        <Icon name="park" size={13} />
                      </button>
                      <button className="icon-btn danger" title="Delete" aria-label={`Delete ${r.name}`} onClick={() => setDeleteTarget(r)}>
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Rename dialog */}
      {renameTarget && (
        <ModalShell label="Rename resume" onClose={() => setRenameTarget(null)}>
            <h3>Rename resume</h3>
            <p className="note" style={{ margin: '4px 0 0' }}>{describeResume(renameTarget)}</p>
            <input
              className="fi"
              value={renameValue}
              maxLength={80}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onRename()}
              aria-label="Resume name"
              style={{ marginTop: 10 }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setRenameTarget(null)}>Cancel</button>
              <button className="btn btn-sm" style={{ flex: 1 }} onClick={onRename}>Save</button>
            </div>
        </ModalShell>
      )}

      {/* Names alone are not unique, so the confirmation spells out exactly
          which record is about to go: its file, when it was last touched and
          whether it is the analysed copy or the failed one. */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this resume?"
        body={deleteTarget ? `${describeResume(deleteTarget)} — this record and all ${deleteTarget.versions.length} of its versions, files and analyses will be permanently removed.` : ''}
        confirmLabel="Delete forever"
        danger
        onConfirm={onDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {analysisTarget && (
        <AnalysisModal
          resume={analysisTarget.resume}
          version={analysisTarget.version}
          onClose={() => setAnalysisTarget(null)}
        />
      )}

      {compareOpen && (
        <CompareModal
          options={allCompleteVersions}
          onClose={() => setCompareOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────── analysis viewer ───────────────────────────

function AnalysisModal({
  resume,
  version,
  onClose,
}: {
  resume: ResumeWithVersions;
  version: ResumeVersionRow;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { settings, refresh } = useCareers();
  const { notify } = useToast();
  const [selected, setSelected] = useState(version.id);
  // Versions updated in-modal (JD-based ATS) override the possibly-stale prop.
  const [patched, setPatched] = useState<Record<string, ResumeVersionRow>>({});
  const [jdText, setJdText] = useState('');
  const [jdOpen, setJdOpen] = useState(false);
  const [atsBusy, setAtsBusy] = useState(false);
  const v = patched[selected] ?? resume.versions.find((x) => x.id === selected) ?? version;
  const parsed = v.parsed;

  const generateAts = async (text: string) => {
    if (!user) {
      notify('Sign in to run the ATS analysis.', 'error');
      return;
    }
    setAtsBusy(true);
    try {
      const updated = await runJdAts(user.id, v, text, settings);
      setPatched((p) => ({ ...p, [updated.id]: updated }));
      notify('ATS Score generated against your job description.', 'ok');
      void refresh();
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setAtsBusy(false);
    }
  };

  const atsFromFile = async (file: File) => {
    setAtsBusy(true);
    try {
      const { extractResumeText } = await import('../parser/extract');
      const { text } = await extractResumeText(file, { ocrEnabled: false });
      setJdText(text);
      await generateAts(text);
    } catch (e) {
      notify(toCareersError(e).message, 'error');
      setAtsBusy(false);
    }
  };
  return (
    <ModalShell label={`Analysis of ${resume.name}`} onClose={onClose} wide>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <h3 style={{ flex: 1, marginBottom: 0 }}>{resume.name}</h3>
          {resume.versions.length > 1 && (
            <select className="fs" style={{ width: 'auto', padding: '7px 34px 7px 12px', fontSize: 13 }} value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Version">
              {resume.versions.map((x) => (
                <option key={x.id} value={x.id}>v{x.version_number} · {formatDate(x.created_at)}</option>
              ))}
            </select>
          )}
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <p className="note" style={{ marginBottom: 16 }}>
          {v.file_name} · analysed {formatDate(v.updated_at)} · extracted via {v.extraction_method || '—'}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 26, marginBottom: 22 }}>
          <ScoreRing score={v.resume_score} caption="Resume score" size={96} />
          <ScoreRing score={v.ats_score} caption="ATS score" size={96} />
        </div>

        {v.score_breakdown && (
          <>
            <div className="panel-eyebrow" style={{ marginBottom: 10 }}>Score breakdown</div>
            <div className="grid2" style={{ gap: '4px 24px', marginBottom: 18 }}>
              {v.score_breakdown.categories.map((c) => (
                <div key={c.id} style={{ padding: '7px 0', borderBottom: '1px solid var(--hair2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{c.label}</span>
                    <b style={{ color: scoreColor(c.score) }}>{c.score}</b>
                  </div>
                  {c.suggestion && <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{c.suggestion}</div>}
                </div>
              ))}
            </div>
            {v.score_breakdown.improvements.length > 0 && (
              <div className="tip tip-info" style={{ marginBottom: 18 }}>
                <b>Top improvements</b>
                {v.score_breakdown.improvements.map((s, i) => (
                  <div key={i}>· {s}</div>
                ))}
              </div>
            )}
          </>
        )}

        {v.status === 'complete' && v.ats_score == null && (
          <div className="tip tip-info" style={{ marginBottom: 18 }}>
            <b>Upload a Job Description to generate an accurate ATS Score.</b>
            ATS systems score resumes against a specific job — a generic score would be misleading,
            so FinatriX scores your resume against the role you're actually targeting.
            {!jdOpen ? (
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-sm" style={{ width: 'auto' }} onClick={() => setJdOpen(true)}>
                  Upload a Job Description
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <textarea
                  className="fi"
                  style={{ minHeight: 120, resize: 'vertical', lineHeight: 1.55 }}
                  placeholder="Paste the job description here…"
                  aria-label="Job description for ATS scoring"
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button
                    className={`btn btn-sm ${atsBusy ? 'btn-loading' : ''}`}
                    style={{ width: 'auto' }}
                    disabled={atsBusy}
                    onClick={() => void generateAts(jdText)}
                  >
                    {atsBusy ? 'Scoring…' : 'Generate ATS Score'}
                  </button>
                  <label className="btn btn-ghost btn-sm" style={{ width: 'auto', cursor: 'pointer' }}>
                    Upload JD as PDF / DOCX
                    <input
                      type="file" hidden accept=".pdf,.docx,.doc"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void atsFromFile(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {v.ats_score != null && (
          <div className="tip tip-info" style={{ marginBottom: 14 }}>
            <b>Keep going with this job.</b>
            Run the full workflow for the same job description — resume match with missing skills,
            tailoring suggestions and{' '}
            <Link to={CAREERS_ROUTES.interviews} style={{ color: 'var(--gold)' }}>interview questions</Link> — from the{' '}
            <Link to={`${CAREERS_ROUTES.jobs}?view=analyzer`} style={{ color: 'var(--gold)' }}>Job Description Analyzer</Link>.
          </div>
        )}

        {v.ats_report && v.ats_report.issues.length > 0 && (
          <>
            <div className="panel-eyebrow" style={{ marginBottom: 10 }}>ATS issues</div>
            {v.ats_report.issues.map((iss) => (
              <div key={iss.id} className="tip tip-warn" style={{ marginBottom: 8 }}>
                <b>
                  <span className={`badge ${iss.severity === 'critical' || iss.severity === 'high' ? 'badge-red' : iss.severity === 'medium' ? 'badge-gold' : 'badge-mute'}`} style={{ marginRight: 8 }}>
                    {iss.severity}
                  </span>
                  {iss.title}
                </b>
                {iss.detail}
                {iss.fix && <div style={{ marginTop: 4, color: 'var(--ink)' }}>Fix: {iss.fix}</div>}
              </div>
            ))}
          </>
        )}

        {v.career_dna && (
          <>
            <div className="panel-eyebrow" style={{ margin: '18px 0 10px' }}>Career DNA</div>
            <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6, marginBottom: 12 }}>{v.career_dna.personalitySummary}</p>
            <div className="grid2">
              <div>
                {v.career_dna.strengths.slice(0, 5).map((s) => <span className="tag green" key={s}>{s}</span>)}
              </div>
              <div>
                {v.career_dna.weaknesses.slice(0, 5).map((s) => <span className="tag red" key={s}>{s}</span>)}
              </div>
            </div>
          </>
        )}

        {parsed && (
          <>
            <div className="panel-eyebrow" style={{ margin: '18px 0 10px' }}>Extracted profile</div>
            <p className="note" style={{ marginBottom: 8 }}>
              {parsed.personal.name}{parsed.personal.email ? ` · ${parsed.personal.email}` : ''}
              {parsed.currentDesignation ? ` · ${parsed.currentDesignation}` : ''}
              {parsed.yearsOfExperience != null ? ` · ${parsed.yearsOfExperience} yrs experience` : ''}
            </p>
            {parsed.experience.slice(0, 6).map((e, i) => (
              <div className="row-line" key={i} style={{ fontSize: 13 }}>
                <div style={{ flex: 1 }}>
                  <b>{e.title}</b> · {e.company}
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    {e.startDate}{e.endDate || e.isCurrent ? ` – ${e.isCurrent ? 'present' : e.endDate}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
    </ModalShell>
  );
}

// ─────────────────────────── compare ───────────────────────────

function CompareModal({
  options,
  onClose,
}: {
  options: { resume: ResumeWithVersions; version: ResumeVersionRow }[];
  onClose: () => void;
}) {
  const [aId, setAId] = useState(options[1]?.version.id ?? options[0]?.version.id ?? '');
  const [bId, setBId] = useState(options[0]?.version.id ?? '');
  const a = options.find((o) => o.version.id === aId);
  const b = options.find((o) => o.version.id === bId);
  const cmp = a && b && a.version.id !== b.version.id ? compareVersions(a.version, b.version) : null;

  // Name + version number alone repeat across same-named families; the analysis
  // timestamp is what actually distinguishes two otherwise identical options.
  const label = (o: { resume: ResumeWithVersions; version: ResumeVersionRow }) =>
    `${o.resume.name} · v${o.version.version_number} · ${formatDateTime(o.version.updated_at)}`;

  const deltaEl = (d: number | null) => (
    <span className={`cmp-delta ${d == null || d === 0 ? 'flat' : d > 0 ? 'up' : 'down'}`}>
      {d == null ? '—' : d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : '='}
    </span>
  );

  return (
    <ModalShell label="Compare resume versions" onClose={onClose} wide>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ flex: 1, marginBottom: 0 }}>Compare versions</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="grid2" style={{ marginBottom: 18 }}>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl" htmlFor="cmp-a">Baseline (A)</label>
            <select className="fs" id="cmp-a" value={aId} onChange={(e) => setAId(e.target.value)}>
              {options.map((o) => <option key={o.version.id} value={o.version.id}>{label(o)}</option>)}
            </select>
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl" htmlFor="cmp-b">Candidate (B)</label>
            <select className="fs" id="cmp-b" value={bId} onChange={(e) => setBId(e.target.value)}>
              {options.map((o) => <option key={o.version.id} value={o.version.id}>{label(o)}</option>)}
            </select>
          </div>
        </div>

        {!cmp ? (
          <p className="note">Pick two different versions to compare.</p>
        ) : (
          <>
            <table className="cmp" style={{ marginBottom: 18 }}>
              <tbody>
                <tr>
                  <td style={{ color: 'var(--ink2)' }}>Resume Score</td>
                  <td>{cmp.resumeScore.a ?? '—'}</td>
                  <td>{cmp.resumeScore.b ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{deltaEl(cmp.resumeScore.delta)}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--ink2)' }}>ATS Score</td>
                  <td>{cmp.atsScore.a ?? '—'}</td>
                  <td>{cmp.atsScore.b ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{deltaEl(cmp.atsScore.delta)}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--ink2)' }}>Experience entries</td>
                  <td>{cmp.experienceCount.a}</td>
                  <td>{cmp.experienceCount.b}</td>
                  <td style={{ textAlign: 'right' }}>{deltaEl(cmp.experienceCount.b - cmp.experienceCount.a)}</td>
                </tr>
                <tr>
                  <td style={{ color: 'var(--ink2)' }}>Word count</td>
                  <td>{cmp.wordCount.a}</td>
                  <td>{cmp.wordCount.b}</td>
                  <td style={{ textAlign: 'right' }}>{deltaEl(cmp.wordCount.b - cmp.wordCount.a)}</td>
                </tr>
              </tbody>
            </table>

            {cmp.categoryDeltas.length > 0 && (
              <>
                <div className="panel-eyebrow" style={{ marginBottom: 8 }}>Biggest category shifts</div>
                {cmp.categoryDeltas.slice(0, 6).map((c) => (
                  <div key={c.id} className="row-line" style={{ fontSize: 13 }}>
                    <span style={{ flex: 1 }}>{c.label}</span>
                    <span style={{ color: 'var(--ink2)' }}>{c.a} → {c.b}</span>
                    {deltaEl(c.delta)}
                  </div>
                ))}
              </>
            )}

            <div className="grid2" style={{ marginTop: 16 }}>
              <div>
                <div className="panel-eyebrow" style={{ marginBottom: 8 }}>Skills added in B</div>
                {cmp.skillsAdded.length
                  ? cmp.skillsAdded.slice(0, 15).map((s) => <span className="tag green" key={s}>{s}</span>)
                  : <p className="note">None</p>}
              </div>
              <div>
                <div className="panel-eyebrow" style={{ marginBottom: 8 }}>Skills removed in B</div>
                {cmp.skillsRemoved.length
                  ? cmp.skillsRemoved.slice(0, 15).map((s) => <span className="tag red" key={s}>{s}</span>)
                  : <p className="note">None</p>}
              </div>
            </div>
          </>
        )}
    </ModalShell>
  );
}
