/**
 * Career Coach — deterministic Career Health Score over the user's stored
 * data, plus AI narrative (insights, roadmap, learning, certifications) that
 * is grounded in that same data, and a Q&A assistant that answers only from
 * it. Nothing here is generic advice.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { ScoreRing } from '../components/ScoreRing';
import { EmptyState, ErrorCard } from '../components/states';
import { CAREERS_ROUTES } from '../constants';
import { useCareers } from '../context/CareersContext';
import { computeApplicationStats, listApplications } from '../services/applications';
import { buildPeriodicReview } from '../services/automation';
import {
  askAssistant,
  buildCoachContext,
  getCoachReport,
  listLearningPaths,
  overallLearningProgress,
  saveLearningPath,
  type LearningPathRow,
} from '../services/coach';
import { computeCareerHealth } from '../services/health';
import { listSessions } from '../services/interviews';
import type { ApplicationRow, CoachReport, InterviewSessionRow, LearningItem } from '../types/jobs';
import { toCareersError, type CareersError } from '../utils/errors';
import { scoreColor } from '../utils/format';

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  references?: string[];
}

const SUGGESTED_QUESTIONS = [
  'Which application needs follow-up?',
  'What should I improve first?',
  'Which resume version should I use?',
  'What jobs should I apply for today?',
];

export default function CareerCoachPage() {
  const { user } = useAuth();
  const { loading, error: ctxError, resumes, profile, settings, refresh } = useCareers();
  const { notify } = useToast();

  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [sessions, setSessions] = useState<InterviewSessionRow[]>([]);
  const [paths, setPaths] = useState<LearningPathRow[]>([]);
  const [loadError, setLoadError] = useState<CareersError | null>(null);
  const [report, setReport] = useState<CoachReport | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [focus, setFocus] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [a, s, p] = await Promise.all([
        listApplications(user.id).catch(() => []),
        listSessions(user.id).catch(() => []),
        listLearningPaths(user.id).catch(() => []),
      ]);
      setApplications(a);
      setSessions(s);
      setPaths(p);
      setLoadError(null);
    } catch (e) {
      setLoadError(toCareersError(e));
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const [reviewPeriod, setReviewPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const review = useMemo(
    () => buildPeriodicReview(computeApplicationStats(applications), reviewPeriod),
    [applications, reviewPeriod]
  );

  const context = useMemo(
    () =>
      buildCoachContext({
        profile,
        resumes,
        applications,
        sessions,
        learningProgress: overallLearningProgress(paths),
      }),
    [profile, resumes, applications, sessions, paths]
  );

  // Health renders instantly (deterministic); AI narrative loads on demand.
  const health = useMemo(() => computeCareerHealth(context), [context]);
  const hasResume = context.resumeScore != null;

  const runReport = async () => {
    if (!user) return;
    setReportBusy(true);
    try {
      const r = await getCoachReport(user.id, context, focus || context.profile.preferredRole as string || 'overall career growth', settings.model);
      setReport(r);
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setReportBusy(false);
    }
  };

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || asking) return;
    setQuestion('');
    setChat((c) => [...c, { role: 'user', text }]);
    setAsking(true);
    try {
      const { answer, references } = await askAssistant(context, text, settings.model);
      setChat((c) => [...c, { role: 'ai', text: answer, references }]);
    } catch (e) {
      setChat((c) => [...c, { role: 'ai', text: toCareersError(e).message }]);
    } finally {
      setAsking(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const toggleLearningItem = async (item: LearningItem) => {
    if (!user || !report) return;
    const nextLearning = report.learning.map((l) => (l.name === item.name ? { ...l, done: !l.done } : l));
    setReport({ ...report, learning: nextLearning });
    try {
      const existing = paths.find((p) => p.title === 'Coach recommendations');
      await saveLearningPath(user.id, {
        id: existing?.id,
        title: 'Coach recommendations',
        targetRole: report.roadmap?.targetRole ?? '',
        items: nextLearning,
      });
      setPaths(await listLearningPaths(user.id));
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  if (loading) return <div style={{ minHeight: '50vh' }} aria-busy="true" />;

  return (
    <div className="fx-page">
      <PageHead
        chip="Career Coach"
        chipColor="#D4AF37"
        chipBg="rgba(212,175,55,.12)"
        icon="compass"
        title="Your long-term career advisor"
      >
        Every score and every suggestion below comes from your own data — resume
        intelligence, Career DNA, applications and interview practice. No generic advice.
      </PageHead>

      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      {!hasResume ? (
        <div className="card">
          <EmptyState
            icon="compass"
            title="The coach needs your resume first"
            action={
              <Link to={CAREERS_ROUTES.upload} className="btn btn-sm" style={{ textDecoration: 'none', width: 'auto', display: 'inline-block', padding: '12px 28px' }}>
                Upload resume
              </Link>
            }
          >
            Career Health, roadmaps and insights are all computed from your analysed
            resume, applications and practice sessions.
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Health score */}
          <div className="card result-card-anim">
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={health.overall} caption="Career health" size={130} />
                <div className="note" style={{ marginTop: 8 }}>
                  Offer probability: <b style={{ color: scoreColor(health.offerProbability) }}>{health.offerProbability}%</b>
                </div>
                <div className="note">
                  Promotion readiness: <b style={{ color: scoreColor(health.promotionReadiness) }}>{health.promotionReadiness}%</b>
                </div>
                <div className="note">
                  Role readiness: <b style={{ color: scoreColor(health.roleReadiness) }}>{health.roleReadiness}%</b>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                {health.categories.map((c) => (
                  <div className="cat-row" key={c.id}>
                    <span className="cat-label">{c.label}</span>
                    <div className="bar"><div className="bar-fill" style={{ width: `${c.score}%`, background: scoreColor(c.score) }} /></div>
                    <span className="cat-val">{c.score}</span>
                  </div>
                ))}
              </div>
            </div>
            {health.suggestions.length > 0 && (
              <div className="tip tip-info" style={{ marginTop: 14 }}>
                <b>Fastest ways to improve</b>
                {health.suggestions.map((s, i) => <div key={i}>· {s}</div>)}
              </div>
            )}
          </div>

          {/* Automation Engine — weekly/monthly progress digest, no AI cost */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div className="panel-eyebrow" style={{ marginBottom: 0 }}>{review.headline}</div>
              <div className="nav" style={{ padding: 0 }}>
                <a className={reviewPeriod === 'weekly' ? 'on' : ''} style={{ cursor: 'pointer' }} onClick={() => setReviewPeriod('weekly')}>Weekly</a>
                <a className={reviewPeriod === 'monthly' ? 'on' : ''} style={{ cursor: 'pointer' }} onClick={() => setReviewPeriod('monthly')}>Monthly</a>
              </div>
            </div>
            {review.bullets.map((b, i) => <div key={i} className="note">· {b}</div>)}
          </div>

          {/* AI narrative */}
          {!report ? (
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="panel-eyebrow" style={{ justifyContent: 'center', marginBottom: 10 }}>AI coach report</div>
              <p className="panel-sub" style={{ marginBottom: 14 }}>
                Personalised insights, a career roadmap, learning plan and certification
                recommendations — generated from your data, cached for the day.
              </p>
              <div style={{ display: 'flex', gap: 10, maxWidth: 520, margin: '0 auto' }}>
                <input
                  className="fi" style={{ padding: '11px 14px' }}
                  placeholder={`Focus (optional) — e.g. ${String(context.profile.preferredRole || 'Risk Manager')}`}
                  aria-label="Coaching focus"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                />
                <button className={`btn btn-sm ${reportBusy ? 'btn-loading' : ''}`} style={{ flexShrink: 0 }} disabled={reportBusy} onClick={() => void runReport()}>
                  {reportBusy ? 'Coaching…' : 'Generate report'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {(report.marketTrends || report.salaryForecast) && (
                <div className="card">
                  <div className="panel-eyebrow" style={{ marginBottom: 8 }}>Market trends &amp; salary forecast</div>
                  {report.marketTrends && <p style={{ marginBottom: report.salaryForecast ? 10 : 0 }}>{report.marketTrends}</p>}
                  {report.salaryForecast && <p className="note">{report.salaryForecast}</p>}
                </div>
              )}

              {report.insights.length > 0 && (
                <div className="card">
                  <div className="panel-eyebrow" style={{ marginBottom: 8 }}>Insights from your data</div>
                  {report.insights.map((ins, i) => (
                    <div className="act-row" key={i}>
                      <span className={`tl-dot tl-${ins.priority === 'high' ? 'red' : ins.priority === 'medium' ? 'yellow' : 'green'}`} style={{ flexShrink: 0, marginTop: 5 }} />
                      <span style={{ flex: 1 }}>{ins.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {report.roadmap && (
                <div className="card">
                  <div className="panel-eyebrow">Career roadmap</div>
                  <div className="panel-title">{report.roadmap.title || `Path to ${report.roadmap.targetRole}`}</div>
                  <div className="panel-sub" style={{ marginBottom: 14 }}>{report.roadmap.timeline}</div>
                  <div className="pipe">
                    {report.roadmap.steps.map((step, i) => (
                      <div className="pipe-step done" key={i}>
                        <div className="pipe-dot">{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div className="pipe-label">{step.title} {step.months ? <span className="note">· ~{step.months} months</span> : null}</div>
                          <div className="job-meta" style={{ marginTop: 4 }}>
                            {step.salaryRange && <span>💰 {step.salaryRange}</span>}
                            {step.demand && <span>{step.demand}</span>}
                          </div>
                          <div style={{ marginTop: 6 }}>
                            {step.skills.map((s) => <span className="tag gold" key={s}>{s}</span>)}
                            {step.certifications.map((s) => <span className="tag green" key={s}>{s}</span>)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid2">
                {report.learning.length > 0 && (
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div className="panel-eyebrow" style={{ marginBottom: 8 }}>Learning plan</div>
                    {report.learning.map((item) => (
                      <label className="act-row" key={item.name} style={{ cursor: 'pointer' }}>
                        <input type="checkbox" checked={item.done} onChange={() => void toggleLearningItem(item)} aria-label={`Mark ${item.name} done`} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ textDecoration: item.done ? 'line-through' : 'none' }}>{item.name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                            {[item.kind, item.provider, item.difficulty, item.hours ? `~${item.hours}h` : ''].filter(Boolean).join(' · ')}
                          </div>
                          {item.impact && <div style={{ fontSize: 12, color: 'var(--ink2)' }}>{item.impact}</div>}
                        </div>
                        <span className={`badge ${item.priority === 'high' ? 'badge-red' : item.priority === 'medium' ? 'badge-gold' : 'badge-mute'}`}>{item.priority}</span>
                      </label>
                    ))}
                  </div>
                )}
                {report.certifications.length > 0 && (
                  <div className="card" style={{ marginBottom: 12 }}>
                    <div className="panel-eyebrow" style={{ marginBottom: 8 }}>Certifications worth pursuing</div>
                    {report.certifications.map((c) => (
                      <div className="row-line" key={c.name} style={{ fontSize: 13, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <b>{c.name}</b>
                          <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
                            {[c.difficulty, c.cost, c.duration, c.salaryImpact].filter(Boolean).join(' · ')}
                          </div>
                          {c.reason && <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>{c.reason}</div>}
                        </div>
                        <span className={`badge ${c.priority === 'high' ? 'badge-red' : c.priority === 'medium' ? 'badge-gold' : 'badge-mute'}`}>{c.priority}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className={`btn btn-ghost btn-sm ${reportBusy ? 'btn-loading' : ''}`} disabled={reportBusy} onClick={() => void runReport()} style={{ marginBottom: 16 }}>
                Refresh report
              </button>
            </>
          )}

          {/* Assistant */}
          <div className="card">
            <div className="panel-eyebrow" style={{ marginBottom: 8 }}>Ask the coach</div>
            {chat.length === 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button key={q} className="btn btn-ghost btn-sm" style={{ width: 'auto', fontSize: 12 }} onClick={() => void ask(q)}>{q}</button>
                ))}
              </div>
            )}
            {chat.length > 0 && (
              <div className="chat-log" aria-live="polite">
                {chat.map((m, i) => (
                  <div key={i} className={`chat-msg ${m.role}`}>
                    {m.text}
                    {m.references && m.references.length > 0 && (
                      <div className="chat-refs">Based on: {m.references.join(' · ')}</div>
                    )}
                  </div>
                ))}
                {asking && <div className="chat-msg ai">Thinking…</div>}
                <div ref={chatEndRef} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input
                className="fi" style={{ padding: '11px 14px' }}
                placeholder="Ask anything about your job search…"
                aria-label="Ask the career coach"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void ask(question)}
              />
              <button className={`btn btn-sm ${asking ? 'btn-loading' : ''}`} style={{ flexShrink: 0 }} disabled={asking} onClick={() => void ask(question)}>
                Ask
              </button>
            </div>
            <p className="note" style={{ marginTop: 8 }}>
              Answers use only your stored FinatriX data. If something isn't tracked, the coach says so.
            </p>
          </div>
        </>
      )}

      <ToolFoot>
        <b>Career Coach</b> · grounded in your data, refreshed daily, cached to keep AI costs near zero
      </ToolFoot>
    </div>
  );
}
