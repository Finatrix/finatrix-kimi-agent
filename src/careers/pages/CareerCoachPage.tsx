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
import { Tabs } from '../../tools/ui/Tabs';
import { ScoreRing } from '../components/ScoreRing';
import { ErrorCard, PageLoading } from '../components/states';
import { Empty, Panel } from '../ui/primitives';
import '../ui/forms.css';
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

/** Priority is always shown as text; colour only reinforces it. */
const priorityChip = (p: string) => `cx-chip ${p === 'high' ? 'cx-chip-bad' : p === 'medium' ? 'cx-chip-warn' : ''}`;

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
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'instant' }), 50);
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

  if (loading) return <PageLoading />;

  return (
    <div className="cxf-stack">
      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      {!hasResume ? (
        <div className="cx-panel">
          <Empty
            title="The coach needs your resume first"
            action={<Link to={CAREERS_ROUTES.upload} className="cx-btn cx-btn-primary">Upload a resume</Link>}
          >
            Career health, roadmaps and insights are all computed from your analysed
            resume, applications and practice sessions.
          </Empty>
        </div>
      ) : (
        <>
          <Panel title="Career health">
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing score={health.overall} caption="Career health" size={130} />
                <div className="cx-sub" style={{ marginTop: 8 }}>
                  {/* Not "probability": this is a readiness indicator over a
                      handful of data points, not a calibrated forecast. See
                      services/health.ts for the smoothing. */}
                  Offer outlook: <b className="cx-num" style={{ color: scoreColor(health.offerProbability) }}>{health.offerProbability}<span aria-hidden="true">/100</span><span className="sr-only"> out of 100</span></b>
                </div>
                <div className="cx-sub">
                  Promotion readiness: <b className="cx-num" style={{ color: scoreColor(health.promotionReadiness) }}>{health.promotionReadiness}%</b>
                </div>
                <div className="cx-sub">
                  Role readiness: <b className="cx-num" style={{ color: scoreColor(health.roleReadiness) }}>{health.roleReadiness}%</b>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                {health.categories.map((c) => (
                  <div className="cat-row" key={c.id}>
                    <span className="cat-label">{c.label}</span>
                    <div className="bar"><div className="bar-fill" style={{ width: `${c.score}%`, background: scoreColor(c.score) }} /></div>
                    <span className="cat-val cx-num">{c.score}</span>
                  </div>
                ))}
              </div>
            </div>
            {health.suggestions.length > 0 && (
              <div className="cx-notice" style={{ marginTop: 16, flexDirection: 'column' }}>
                <strong>Fastest ways to improve</strong>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {health.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </Panel>

          {/* Automation Engine: weekly/monthly progress digest, no AI cost */}
          <section className="cx-panel" aria-label={review.headline}>
            <div className="cx-panel-head" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <h2>{review.headline}</h2>
              <Tabs
                variant="nav"
                label="Review period"
                style={{ padding: 0 }}
                active={reviewPeriod}
                onChange={setReviewPeriod}
                items={[{ key: 'weekly', label: 'Weekly' }, { key: 'monthly', label: 'Monthly' }]}
              />
            </div>
            <ul className="cx-sub" style={{ margin: 0, paddingLeft: 18 }}>
              {review.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </section>

          {/* AI narrative */}
          {!report ? (
            <Panel title="Coach report">
              <p className="cx-sub" style={{ marginBottom: 14 }}>
                Personalised insights, a career roadmap, a learning plan and certification
                recommendations, generated from your data and cached for the day.
              </p>
              <div className="cxf-toolbar" style={{ marginBottom: 0 }}>
                <label className="sr-only" htmlFor="coach-focus">Coaching focus (optional)</label>
                <input
                  id="coach-focus"
                  className="fi cxf-grow"
                  placeholder={`Focus (optional), for example ${String(context.profile.preferredRole || 'Risk Manager')}`}
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                />
                <button type="button" className="cx-btn cx-btn-primary" disabled={reportBusy} onClick={() => void runReport()}>
                  {reportBusy ? 'Coaching' : 'Generate report'}
                </button>
              </div>
            </Panel>
          ) : (
            <>
              {(report.marketTrends || report.salaryForecast) && (
                <Panel title="Market trends and salary forecast">
                  {report.marketTrends && <p className="cx-sub" style={{ marginBottom: report.salaryForecast ? 10 : 0 }}>{report.marketTrends}</p>}
                  {report.salaryForecast && <p className="cx-sub">{report.salaryForecast}</p>}
                </Panel>
              )}

              {report.insights.length > 0 && (
                <Panel title="Insights from your data">
                  <ul className="cx-list">
                    {report.insights.map((ins, i) => (
                      <li key={i}>
                        <div className="cx-row">
                          <span className={priorityChip(ins.priority)}>{ins.priority} priority</span>
                          <div className="cx-row-main"><p className="cx-sub">{ins.text}</p></div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              {report.roadmap && (
                <Panel title="Career roadmap">
                  <p className="cx-row-title wrap" style={{ fontSize: 16 }}>{report.roadmap.title || `Path to ${report.roadmap.targetRole}`}</p>
                  <p className="cx-sub" style={{ marginBottom: 14 }}>{report.roadmap.timeline}</p>
                  <ol className="cx-list">
                    {report.roadmap.steps.map((step, i) => (
                      <li key={i}>
                        <div className="cx-row" style={{ alignItems: 'flex-start' }}>
                          <span className="cx-chip cx-num" aria-label={`Step ${i + 1}`}>{i + 1}</span>
                          <div className="cx-row-main">
                            <p className="cx-row-title wrap">{step.title}</p>
                            <p className="cx-row-meta">
                              {step.months ? <span className="cx-num">About {step.months} months</span> : null}
                              {step.salaryRange && <span>{step.salaryRange}</span>}
                              {step.demand && <span>{step.demand}</span>}
                            </p>
                            {(step.skills.length > 0 || step.certifications.length > 0) && (
                              <div className="cxf-chips" style={{ marginTop: 8 }}>
                                {step.skills.map((s) => <span className="cx-chip cx-chip-accent" key={s}>{s}</span>)}
                                {step.certifications.map((s) => <span className="cx-chip cx-chip-good" key={s}>{s}</span>)}
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Panel>
              )}

              <div className="cx-grid cx-grid-2">
                {report.learning.length > 0 && (
                  <Panel title="Learning plan">
                    <ul className="cx-list">
                      {report.learning.map((item) => (
                        <li key={item.name}>
                          <div className="cx-row" style={{ alignItems: 'flex-start' }}>
                            <input
                              type="checkbox" style={{ width: 20, height: 20, flex: 'none', marginTop: 2 }}
                              checked={item.done} onChange={() => void toggleLearningItem(item)} aria-label={`Mark ${item.name} done`}
                            />
                            <div className="cx-row-main">
                              <p className="cx-row-title wrap" style={item.done ? { textDecoration: 'line-through' } : undefined}>{item.name}</p>
                              <p className="cx-row-meta">
                                {item.kind && <span>{item.kind}</span>}
                                {item.provider && <span>{item.provider}</span>}
                                {item.difficulty && <span>{item.difficulty}</span>}
                                {item.hours ? <span className="cx-num">About {item.hours} hours</span> : null}
                              </p>
                              {item.impact && <p className="cx-sub" style={{ marginTop: 4 }}>{item.impact}</p>}
                            </div>
                            <span className={priorityChip(item.priority)}>{item.priority}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}
                {report.certifications.length > 0 && (
                  <Panel title="Certifications worth pursuing">
                    <ul className="cx-list">
                      {report.certifications.map((c) => (
                        <li key={c.name}>
                          <div className="cx-row" style={{ alignItems: 'flex-start' }}>
                            <div className="cx-row-main">
                              <p className="cx-row-title wrap">{c.name}</p>
                              <p className="cx-row-meta">
                                {c.difficulty && <span>{c.difficulty}</span>}
                                {c.cost && <span>{c.cost}</span>}
                                {c.duration && <span>{c.duration}</span>}
                                {c.salaryImpact && <span>{c.salaryImpact}</span>}
                              </p>
                              {c.reason && <p className="cx-sub" style={{ marginTop: 4 }}>{c.reason}</p>}
                            </div>
                            <span className={priorityChip(c.priority)}>{c.priority}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}
              </div>
              <div>
                <button type="button" className="cx-btn cx-btn-quiet cx-btn-sm" disabled={reportBusy} onClick={() => void runReport()}>
                  {reportBusy ? 'Refreshing' : 'Refresh report'}
                </button>
              </div>
            </>
          )}

          {/* Assistant */}
          <Panel title="Ask the coach">
            {chat.length === 0 && (
              <div className="cxf-chips" style={{ marginBottom: 12 }}>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button key={q} type="button" className="cx-btn cx-btn-sm" onClick={() => void ask(q)}>{q}</button>
                ))}
              </div>
            )}
            {chat.length > 0 && (
              <div className="chat-log" aria-live="polite">
                {chat.map((m, i) => (
                  <div key={i} className={`chat-msg ${m.role}`}>
                    {m.text}
                    {m.references && m.references.length > 0 && (
                      <div className="chat-refs">Based on: {m.references.join(', ')}</div>
                    )}
                  </div>
                ))}
                {asking && <div className="chat-msg ai">Thinking</div>}
                <div ref={chatEndRef} />
              </div>
            )}
            <div className="cxf-toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
              <label className="sr-only" htmlFor="coach-question">Ask the career coach</label>
              <input
                id="coach-question"
                className="fi cxf-grow"
                placeholder="Ask anything about your job search"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void ask(question)}
              />
              <button type="button" className="cx-btn cx-btn-primary" disabled={asking} onClick={() => void ask(question)}>
                Ask
              </button>
            </div>
            <p className="cx-sub" style={{ marginTop: 8 }}>
              Answers use only your stored FinatriX data. If something is not tracked, the coach says so.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}
