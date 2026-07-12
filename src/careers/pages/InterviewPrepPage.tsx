/**
 * Interview Prep — personalised question sets, STAR answer building, and
 * timed/untimed AI mock interviews with scored feedback. Sessions persist,
 * so practice can stop and resume anytime.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { ScoreRing } from '../components/ScoreRing';
import { EmptyState, ErrorCard, PageLoading } from '../components/states';
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
      .map((v) => ({ label: `${r.name} · v${v.version_number}`, version: v }))
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
      notify('Upload and analyse a resume first — questions are personalised to it.', 'error');
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
    <div className="fx-page">
      <PageHead
        chip="Interview Prep"
        chipColor="#D4AF37"
        chipBg="rgba(212,175,55,.12)"
        icon="users"
        title="Walk in prepared"
      >
        Personalised questions from your resume and target role, STAR answers built
        from your real experience, and scored mock interviews with a practice plan.
      </PageHead>

      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      {!active ? (
        <>
          <div className="card">
            <div className="panel-eyebrow" style={{ marginBottom: 12 }}>New session</div>
            <div className="grid3" style={{ marginBottom: 10 }}>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl" htmlFor="ip-version">Resume</label>
                <select id="ip-version" className="fs" value={version?.id ?? ''} onChange={(e) => setVersionId(e.target.value)}>
                  {versions.length
                    ? versions.map((v) => <option key={v.version.id} value={v.version.id}>{v.label}</option>)
                    : <option value="">No analysed resume yet</option>}
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl" htmlFor="ip-app">For application (optional)</label>
                <select id="ip-app" className="fs" value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
                  <option value="">General practice</option>
                  {applications.map((a) => <option key={a.id} value={a.id}>{a.job_title} — {a.company_name}</option>)}
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl" htmlFor="ip-role">Role title</label>
                <input id="ip-role" className="fi" placeholder="e.g. Risk Analyst" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} />
              </div>
            </div>
            <div className="grid3" style={{ marginBottom: 14 }}>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl" htmlFor="ip-mode">Mode</label>
                <select id="ip-mode" className="fs" value={kind} onChange={(e) => setKind(e.target.value as 'prep' | 'mock')}>
                  <option value="prep">Practice (see guidance, build STAR answers)</option>
                  <option value="mock">Mock interview (answer, then get scored)</option>
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl" htmlFor="ip-diff">Difficulty</label>
                <select id="ip-diff" className="fs" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl" htmlFor="ip-count">Questions</label>
                <select id="ip-count" className="fs" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            {kind === 'mock' && (
              <label className="note" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
                Timed mode — {MOCK_SECONDS_PER_QUESTION / 60} minutes per question
              </label>
            )}
            <button className={`btn ${starting ? 'btn-loading' : ''}`} disabled={starting || !versions.length} onClick={() => void start()}>
              {starting ? 'Generating questions…' : kind === 'mock' ? 'Start mock interview' : 'Generate question set'}
            </button>
          </div>

          {sessions.length > 0 && (
            <div className="card">
              <div className="panel-eyebrow" style={{ marginBottom: 8 }}>Previous sessions</div>
              {sessions.map((s) => (
                <div className="act-row" key={s.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{s.role_title}</b> · {s.kind === 'mock' ? 'Mock' : 'Practice'} · {s.questions.length} questions · {s.difficulty}
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                      {formatDate(s.created_at)}{s.completed_at ? ' · completed' : ' · in progress'}
                    </div>
                  </div>
                  {s.score != null && <b style={{ color: scoreColor(s.score) }}>{s.score}</b>}
                  <button className="btn btn-ghost btn-sm" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => openSession(s)}>Open</button>
                  <button className="icon-btn danger" aria-label="Delete session" onClick={() => { if (user) void deleteSession(user.id, s.id).then(load); }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="lib-toolbar">
            <button className="btn btn-ghost btn-sm" onClick={() => { void persistAnswers(); setActive(null); void load(); }}>← All sessions</button>
            <b style={{ flex: 1 }}>{active.role_title} · {active.kind === 'mock' ? 'Mock interview' : 'Practice'}</b>
            {active.kind === 'mock' && timed && secondsLeft != null && !active.completed_at && (
              <span className="badge badge-gold" aria-live="polite">
                ⏱ {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
              </span>
            )}
            <span className="note">Question {current + 1} / {active.questions.length}</span>
          </div>

          {active.kind === 'mock' && (
            <details className="card" style={{ marginBottom: 10 }}>
              <summary className="panel-eyebrow" style={{ cursor: 'pointer' }}>Interview workspace — schedule &amp; outcome</summary>
              <div className="grid3" style={{ marginTop: 12 }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl" htmlFor="ws-round">Round</label>
                  <input id="ws-round" className="fi" value={active.round} placeholder="e.g. Round 2 — Panel"
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
            <div className="card result-hero-anim">
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
              <div className="grid2">
                <div>
                  <div className="panel-eyebrow" style={{ marginBottom: 6 }}>Strong areas</div>
                  {feedback.strongAreas.map((s, i) => <div className="tip tip-ok" key={i}>{s}</div>)}
                </div>
                <div>
                  <div className="panel-eyebrow" style={{ marginBottom: 6 }}>Weak areas</div>
                  {feedback.weakAreas.map((s, i) => <div className="tip tip-warn" key={i}>{s}</div>)}
                </div>
              </div>
              {feedback.practicePlan.length > 0 && (
                <div className="tip tip-info" style={{ marginTop: 8 }}>
                  <b>Practice plan</b>
                  {feedback.practicePlan.map((p, i) => <div key={i}>{i + 1}. {p}</div>)}
                </div>
              )}
            </div>
          ) : q ? (
            <div className="card">
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <span className="badge badge-gold">{q.category}</span>
                <span className="badge badge-mute">{q.difficulty}</span>
              </div>
              <p style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.5, marginBottom: 12 }}>{q.question}</p>

              {active.kind === 'prep' && q.guidance && (
                <div className="tip tip-info"><b>What a strong answer covers</b>{q.guidance}</div>
              )}
              {active.kind === 'prep' && q.modelAnswer && (
                <details style={{ marginTop: 8 }}>
                  <summary className="note" style={{ cursor: 'pointer' }}>Show a model answer</summary>
                  <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6, marginTop: 6 }}>{q.modelAnswer}</p>
                </details>
              )}

              <textarea
                className="fi"
                style={{ minHeight: 140, resize: 'vertical', lineHeight: 1.55, marginTop: 10 }}
                placeholder={active.kind === 'mock' ? 'Type your answer as you would say it…' : 'Draft your answer (optional — STAR builder can start from it)…'}
                aria-label="Your answer"
                value={answerFor(q.id).text}
                onChange={(e) => setAnswer(q.id, { text: e.target.value })}
                onBlur={() => void persistAnswers()}
              />

              {active.kind === 'prep' && (
                <>
                  <button
                    className={`btn btn-ghost btn-sm ${starBusy === q.id ? 'btn-loading' : ''}`}
                    disabled={!!starBusy}
                    style={{ marginTop: 10 }}
                    onClick={() => void runStar(q.id, q.question)}
                  >
                    Build STAR answer from my experience
                  </button>
                  {answerFor(q.id).star && (
                    <div style={{ marginTop: 12 }}>
                      {(['situation', 'task', 'action', 'result', 'reflection'] as const).map((part) => (
                        <div className="row-line" key={part} style={{ fontSize: 13, alignItems: 'flex-start' }}>
                          <b style={{ flex: '0 0 90px', textTransform: 'capitalize', color: 'var(--gold)' }}>{part}</b>
                          <span style={{ flex: 1, color: 'var(--ink2)' }}>{answerFor(q.id).star![part]}</span>
                        </div>
                      ))}
                      <div className="job-meta" style={{ marginTop: 8 }}>
                        <span>Confidence: <b style={{ color: scoreColor(answerFor(q.id).star!.confidence) }}>{answerFor(q.id).star!.confidence}/100</b></span>
                      </div>
                      {answerFor(q.id).star!.improvements.length > 0 && (
                        <div className="tip tip-warn" style={{ marginTop: 8 }}>
                          <b>To strengthen it</b>
                          {answerFor(q.id).star!.improvements.map((s, i) => <div key={i}>· {s}</div>)}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="btn btn-ghost btn-sm" disabled={current === 0} onClick={() => { void persistAnswers(); setCurrent((c) => c - 1); }}>← Previous</button>
                {current < active.questions.length - 1 ? (
                  <button className="btn btn-sm" onClick={() => { void persistAnswers(); setCurrent((c) => c + 1); }}>Next →</button>
                ) : active.kind === 'mock' ? (
                  <button className={`btn btn-sm ${finishing ? 'btn-loading' : ''}`} disabled={finishing} onClick={() => void finishMock()}>
                    {finishing ? 'Scoring…' : 'Finish & get feedback'}
                  </button>
                ) : (
                  <button className="btn btn-sm" onClick={() => { void persistAnswers(); setActive(null); void load(); }}>Done</button>
                )}
              </div>
            </div>
          ) : (
            <div className="card"><EmptyState icon="warn" title="No questions in this session" /></div>
          )}
        </>
      )}

      <ToolFoot>
        <b>Interview Prep</b> · STAR answers only ever use your real, stored experience
      </ToolFoot>
    </div>
  );
}
