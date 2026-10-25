/**
 * Interview Prep — personalised question sets, STAR answer building, and
 * timed/untimed AI mock interviews with scored feedback. Sessions persist,
 * so practice can stop and resume anytime.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { ScoreRing } from '../components/ScoreRing';
import { ErrorCard, PageLoading } from '../components/states';
import { Empty } from '../ui/primitives';
import '../ui/forms.css';
import { useCareers } from '../context/CareersContext';
import { listApplications } from '../services/applications';
import {
  buildStarAnswer,
  completeMock,
  createSession,
  deleteSession,
  listSessions,
  saveAnswers,
  updateWorkspace,
} from '../services/interviews';
import type { ResumeVersionRow, ResumeWithVersions } from '../types';
import {
  INTERVIEW_OUTCOMES,
  INTERVIEW_TYPES,
  type ApplicationRow,
  type InterviewAnswer,
  type InterviewSessionRow,
  type StarAnswer,
} from '../types/jobs';
import { toCareersError, type CareersError } from '../utils/errors';
import { formatDate, scoreColor } from '../utils/format';

function completeVersions(resumes: ResumeWithVersions[]): { label: string; version: ResumeVersionRow }[] {
  return resumes.flatMap((r) =>
    r.versions.filter((v) => v.status === 'complete' && v.parsed)
      .map((v) => ({ label: `${r.name}, version ${v.version_number}`, version: v }))
  );
}

const MOCK_SECONDS_PER_QUESTION = 150;

export default function InterviewPrepPage() {
  const { user } = useAuth();
  const { loading, error: ctxError, resumes, settings, refresh } = useCareers();
  const { notify } = useToast();

  const versions = useMemo(() => completeVersions(resumes), [resumes]);
  const [versionId, setVersionId] = useState('');
  const version = versions.find((v) => v.version.id === versionId)?.version ?? versions[0]?.version ?? null;

  const [sessions, setSessions] = useState<InterviewSessionRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loadError, setLoadError] = useState<CareersError | null>(null);
  const [active, setActive] = useState<InterviewSessionRow | null>(null);

  // Setup form
  const [kind, setKind] = useState<'prep' | 'mock'>('prep');
  const [applicationId, setApplicationId] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'expert'>('medium');
  const [count, setCount] = useState(10);
  const [timed, setTimed] = useState(false);
  const [starting, setStarting] = useState(false);

  // Active session state
  const [answers, setAnswers] = useState<InterviewAnswer[]>([]);
  const [current, setCurrent] = useState(0);
  const [starBusy, setStarBusy] = useState<string>('');
  const [finishing, setFinishing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [s, a] = await Promise.all([listSessions(user.id), listApplications(user.id).catch(() => [])]);
      setSessions(s);
      setApplications(a.filter((x) => !x.archived));
      setLoadError(null);
    } catch (e) {
      setLoadError(toCareersError(e));
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Mock timer
  useEffect(() => {
    if (!active || active.kind !== 'mock' || !timed || active.completed_at) return;
    setSecondsLeft(MOCK_SECONDS_PER_QUESTION);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => (s == null || s <= 1 ? 0 : s - 1));
    }, 1_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, current, timed]);

  const start = async () => {
    if (!user || !version) {
      notify('Upload and analyse a resume first. Questions are personalised to it.', 'error');
      return;
    }
    const app = applications.find((a) => a.id === applicationId);
    const title = roleTitle.trim() || app?.job_title || version.parsed?.currentDesignation || 'General';
    setStarting(true);
    try {
      const session = await createSession(user.id, version, {
        kind,
        roleTitle: title,
        jobText: app ? `${app.job_title} at ${app.company_name}. ${app.notes}` : '',
        difficulty,
        count,
        applicationId: app?.id,
        jobId: app?.job_id ?? undefined,
      }, settings.model);
      setActive(session);
      setAnswers(session.answers);
      setCurrent(0);
      await load();
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setStarting(false);
    }
  };

  const openSession = (s: InterviewSessionRow) => {
    setActive(s);
    setAnswers(s.answers);
    setCurrent(0);
  };

  const answerFor = (questionId: string): InterviewAnswer =>
    answers.find((a) => a.questionId === questionId) ?? { questionId, text: '', star: null };

  const setAnswer = (questionId: string, patch: Partial<InterviewAnswer>) => {
    setAnswers((prev) => {
      const existing = prev.find((a) => a.questionId === questionId);
      if (existing) return prev.map((a) => (a.questionId === questionId ? { ...a, ...patch } : a));
      return [...prev, { questionId, text: '', star: null, ...patch }];
    });
  };

  const persistAnswers = async (next?: InterviewAnswer[]) => {
    if (!user || !active) return;
    try {
      const saved = await saveAnswers(user.id, active.id, next ?? answers);
      setActive(saved);
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  const runStar = async (questionId: string, questionText: string) => {
    if (!version) return;
    setStarBusy(questionId);
    try {
      const draft = answerFor(questionId).text;
      const star: StarAnswer = await buildStarAnswer(version, questionText, draft, settings.model, user?.id ?? '');
      setAnswer(questionId, { star });
      notify('STAR answer built from your real experience.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setStarBusy('');
    }
  };

  const finishMock = async () => {
    if (!user || !active) return;
    setFinishing(true);
    try {
      await persistAnswers();
      const done = await completeMock(user.id, { ...active, answers }, settings.model);
      setActive(done);
      await load();
      notify('Mock interview scored.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setFinishing(false);
    }
  };

  if (loading) return <PageLoading />;

  const q = active?.questions[current];
  const feedback = active?.feedback ?? null;

  return (
    <div className="cxf-stack">
      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      {!active ? (
        <>
          <section className="cx-panel" aria-labelledby="ip-new">
            <div className="cx-panel-head"><h2 id="ip-new">New session</h2></div>
            <div className="cxf-form">
              <div className="fg">
                <label className="fl" htmlFor="ip-version">Resume</label>
                <select id="ip-version" className="fs" value={version?.id ?? ''} onChange={(e) => setVersionId(e.target.value)}>
                  {versions.length
                    ? versions.map((v) => <option key={v.version.id} value={v.version.id}>{v.label}</option>)
                    : <option value="">No analysed resume yet</option>}
                </select>
              </div>
              <div className="fg">
                <label className="fl" htmlFor="ip-app">For application (optional)</label>
                <select id="ip-app" className="fs" value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
                  <option value="">General practice</option>
                  {applications.map((a) => <option key={a.id} value={a.id}>{a.job_title} at {a.company_name}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl" htmlFor="ip-role">Role title</label>
                <input id="ip-role" className="fi" placeholder="For example, Risk Analyst" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} />
              </div>
              <div className="fg">
                <label className="fl" htmlFor="ip-mode">Mode</label>
                <select id="ip-mode" className="fs" value={kind} onChange={(e) => setKind(e.target.value as 'prep' | 'mock')}>
                  <option value="prep">Practice (see guidance, build STAR answers)</option>
                  <option value="mock">Mock interview (answer, then get scored)</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl" htmlFor="ip-diff">Difficulty</label>
                <select id="ip-diff" className="fs" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl" htmlFor="ip-count">Questions</label>
                <select id="ip-count" className="fs" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {kind === 'mock' && (
                <label className="cxf-check cxf-wide cx-sub">
                  <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
                  Timed mode, {MOCK_SECONDS_PER_QUESTION / 60} minutes per question
                </label>
              )}
            </div>
            <div className="cxf-actions">
              <button type="button" className="cx-btn cx-btn-primary" disabled={starting || !versions.length} onClick={() => void start()}>
                {starting ? 'Generating questions' : kind === 'mock' ? 'Start mock interview' : 'Generate question set'}
              </button>            </div>
          </section>

          {sessions.length > 0 && (
            <section className="cx-panel" aria-labelledby="ip-prev">
              <div className="cx-panel-head"><h2 id="ip-prev">Previous sessions</h2></div>
              <ul className="cx-list">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <div className="cx-row">
                      <div className="cx-row-main">
                        <p className="cx-row-title">{s.role_title}</p>
                        <p className="cx-row-meta">
                          <span className="cx-chip">{s.kind === 'mock' ? 'Mock' : 'Practice'}</span>
                          <span className={`cx-chip ${s.completed_at ? 'cx-chip-good' : 'cx-chip-accent'}`}>{s.completed_at ? 'Completed' : 'In progress'}</span>
                          <span className="cx-num">{s.questions.length} questions</span>
                          <span>{s.difficulty}</span>
                          <span>{formatDate(s.created_at)}</span>
                        </p>
                      </div>
                      {s.score != null && <span className="cx-row-side cx-num" style={{ color: scoreColor(s.score), fontWeight: 600 }}>Score {s.score}</span>}
                      <div className="cx-row-actions">
                        <button type="button" className="cx-btn cx-btn-sm" onClick={() => openSession(s)}>Open</button>
                        <button type="button" className="cx-icon-btn" aria-label={`Delete session: ${s.role_title}`} onClick={() => { if (user) void deleteSession(user.id, s.id).then(load); }}>✕</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          <div className="cxf-toolbar">
            <button type="button" className="cx-btn" onClick={() => { void persistAnswers(); setActive(null); void load(); }}>Back to all sessions</button>
            <b style={{ flex: 1, minWidth: 0 }}>{active.role_title}, {active.kind === 'mock' ? 'mock interview' : 'practice'}</b>
            {active.kind === 'mock' && timed && secondsLeft != null && !active.completed_at && (
              <span className="cx-chip cx-chip-accent cx-num" role="timer" aria-label="Time left on this question">
                Time left {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
              </span>
            )}
            <span className="cx-sub cx-num">Question {current + 1} of {active.questions.length}</span>
          </div>

          {active.kind === 'mock' && (
            <details className="cx-panel">
              <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: 32 }}>Interview details: schedule and outcome</summary>
              <div className="cxf-form cxf-form-3" style={{ marginTop: 12 }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl" htmlFor="ws-round">Round</label>
                  <input id="ws-round" className="fi" value={active.round} placeholder="For example, Round 2, panel"
                    onChange={(e) => setActive({ ...active, round: e.target.value })}
                    onBlur={() => { if (user) void updateWorkspace(user.id, active.id, { round: active.round }); }} />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl" htmlFor="ws-type">Type</label>
                  <select id="ws-type" className="fs" value={active.interview_type}
                    onChange={(e) => {
                      const interview_type = e.target.value as typeof active.interview_type;
                      setActive({ ...active, interview_type });
                      if (user) void updateWorkspace(user.id, active.id, { interview_type });
                    }}>
                    <option value="">Not set</option>
                    {INTERVIEW_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl" htmlFor="ws-when">Scheduled</label>
                  <input id="ws-when" className="fi" type="datetime-local" value={active.scheduled_at?.slice(0, 16) ?? ''}
                    onChange={(e) => {
                      const scheduled_at = e.target.value ? new Date(e.target.value).toISOString() : null;
                      setActive({ ...active, scheduled_at });
                      if (user) void updateWorkspace(user.id, active.id, { scheduled_at });
                    }} />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl" htmlFor="ws-loc">Location</label>
                  <input id="ws-loc" className="fi" value={active.location}
                    onChange={(e) => setActive({ ...active, location: e.target.value })}
                    onBlur={() => { if (user) void updateWorkspace(user.id, active.id, { location: active.location }); }} />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl" htmlFor="ws-link">Meeting link</label>
                  <input id="ws-link" className="fi" value={active.meeting_link}
                    onChange={(e) => setActive({ ...active, meeting_link: e.target.value })}
                    onBlur={() => { if (user) void updateWorkspace(user.id, active.id, { meeting_link: active.meeting_link }); }} />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl" htmlFor="ws-outcome">Outcome</label>
                  <select id="ws-outcome" className="fs" value={active.outcome}
                    onChange={(e) => {
                      const outcome = e.target.value as typeof active.outcome;
                      setActive({ ...active, outcome });
                      if (user) void updateWorkspace(user.id, active.id, { outcome });
                    }}>
                    <option value="">Not set</option>
                    {INTERVIEW_OUTCOMES.map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
            </details>
          )}

          {feedback ? (
            <div className="cx-panel">
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                <ScoreRing score={feedback.overall} caption="Interview score" />
                <div style={{ flex: 1, minWidth: 220 }}>
                  {Object.entries(feedback.scores).map(([id, score]) => (
                    <div className="cat-row" key={id}>
                      <span className="cat-label" style={{ textTransform: 'capitalize' }}>{id}</span>
                      <div className="bar"><div className="bar-fill" style={{ width: `${score}%`, background: scoreColor(score) }} /></div>
                      <span className="cat-val">{score}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="cx-grid cx-grid-2">
                <div>
                  <div className="cx-panel-head"><h2>Strong areas</h2></div>
                  {feedback.strongAreas.map((s, i) => <div className="cx-notice" style={{ marginBottom: 8 }} key={i}>{s}</div>)}
                </div>
                <div>
                  <div className="cx-panel-head"><h2>Areas to work on</h2></div>
                  {feedback.weakAreas.map((s, i) => <div className="cx-notice" style={{ marginBottom: 8 }} key={i}>{s}</div>)}
                </div>
              </div>
              {feedback.practicePlan.length > 0 && (
                <div className="cx-notice" style={{ marginTop: 8, flexDirection: 'column' }}>
                  <strong>Practice plan</strong>
                  {feedback.practicePlan.map((p, i) => <div key={i}>{i + 1}. {p}</div>)}
                </div>
              )}
            </div>
          ) : q ? (
            <div className="cx-panel">
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <span className="cx-chip cx-chip-accent">{q.category}</span>
                <span className="cx-chip">{q.difficulty}</span>
              </div>
              <p style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.5, margin: '0 0 12px', color: 'var(--ink)' }}>{q.question}</p>

              {active.kind === 'prep' && q.guidance && (
                <div className="cx-notice" style={{ flexDirection: 'column' }}><strong>What a strong answer covers</strong>{q.guidance}</div>
              )}
              {active.kind === 'prep' && q.modelAnswer && (
                <details style={{ marginTop: 8 }}>
                  <summary className="cx-sub" style={{ cursor: 'pointer', minHeight: 32 }}>Show a model answer</summary>
                  <p className="cx-sub" style={{ marginTop: 6 }}>{q.modelAnswer}</p>
                </details>
              )}

              <textarea
                className="fi"
                style={{ minHeight: 140, resize: 'vertical', lineHeight: 1.55, marginTop: 10 }}
                placeholder={active.kind === 'mock' ? 'Type your answer as you would say it' : 'Draft your answer. The STAR builder can start from it.'}
                aria-label="Your answer"
                value={answerFor(q.id).text}
                onChange={(e) => setAnswer(q.id, { text: e.target.value })}
                onBlur={() => void persistAnswers()}
              />

              {active.kind === 'prep' && (
                <>
                  <button
                    type="button"
                    className="cx-btn"
                    disabled={!!starBusy}
                    style={{ marginTop: 10 }}
                    onClick={() => void runStar(q.id, q.question)}
                  >
                    {starBusy === q.id ? 'Building answer' : 'Build STAR answer from my experience'}
                  </button>
                  {answerFor(q.id).star && (
                    <dl className="cxf-facts" style={{ marginTop: 14, gridTemplateColumns: 'minmax(0, 1fr)' }}>
                      {(['situation', 'task', 'action', 'result', 'reflection'] as const).map((part) => (
                        <div key={part}>
                          <dt style={{ textTransform: 'capitalize' }}>{part}</dt>
                          <dd>{answerFor(q.id).star![part]}</dd>
                        </div>
                      ))}
                      <div>
                        <dt>Confidence</dt>
                        <dd className="cx-num" style={{ color: scoreColor(answerFor(q.id).star!.confidence) }}>{answerFor(q.id).star!.confidence} out of 100</dd>
                      </div>
                      {answerFor(q.id).star!.improvements.length > 0 && (
                        <div>
                          <dt>To strengthen it</dt>
                          <dd>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                              {answerFor(q.id).star!.improvements.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}
                </>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="button" className="cx-btn" disabled={current === 0} onClick={() => { void persistAnswers(); setCurrent((c) => c - 1); }}>Previous</button>
                {current < active.questions.length - 1 ? (
                  <button type="button" className="cx-btn cx-btn-primary" onClick={() => { void persistAnswers(); setCurrent((c) => c + 1); }}>Next</button>
                ) : active.kind === 'mock' ? (
                  <button type="button" className="cx-btn cx-btn-primary" disabled={finishing} onClick={() => void finishMock()}>
                    {finishing ? 'Scoring' : 'Finish and get feedback'}
                  </button>
                ) : (
                  <button type="button" className="cx-btn cx-btn-primary" onClick={() => { void persistAnswers(); setActive(null); void load(); }}>Done</button>
                )}
              </div>
            </div>
          ) : (
            <div className="cx-panel"><Empty title="No questions in this session" /></div>
          )}
        </>
      )}
    </div>
  );
}
