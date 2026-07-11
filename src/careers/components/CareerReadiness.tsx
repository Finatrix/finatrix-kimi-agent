import { Link } from 'react-router';
import { ScoreRing } from './ScoreRing';
import { CAREERS_ROUTES } from '../constants';
import type { ApplicationStats } from '../services/applications';

/**
 * Career Readiness — a guided journey that answers, at a glance: where am I,
 * how job-ready am I, and what should I do next. It mirrors the money
 * dashboard's journey pattern for one consistent ecosystem, and every figure is
 * derived from data the Careers pages already track (resume/ATS scores and the
 * application funnel) — nothing is fabricated.
 */
interface Props {
  hasResume: boolean;
  resumeScore: number | null;
  atsScore: number | null;
  stats: ApplicationStats | null;
}

interface Step {
  id: string;
  label: string;
  sub: string;
  href: string;
  done: boolean;
}

export function CareerReadiness({ hasResume, resumeScore, atsScore, stats }: Props) {
  const applied = stats?.applied ?? 0;
  const interviews = stats?.interviews ?? 0;
  const offers = stats?.offers ?? 0;
  const tracked = stats?.total ?? 0;

  const steps: Step[] = [
    { id: 'resume', label: 'Resume analysed', sub: hasResume ? (resumeScore != null ? `Score ${resumeScore}/100` : 'Analysed') : 'Upload to begin', href: hasResume ? CAREERS_ROUTES.resumes : CAREERS_ROUTES.upload, done: hasResume },
    { id: 'ats', label: 'ATS match', sub: atsScore != null ? `${atsScore}/100 against a role` : 'Add a job description', href: CAREERS_ROUTES.resumes, done: atsScore != null },
    { id: 'jobs', label: 'Target roles', sub: tracked > 0 ? `${tracked} tracked` : 'Save roles you want', href: CAREERS_ROUTES.jobs, done: tracked > 0 },
    { id: 'apply', label: 'Applications', sub: applied > 0 ? `${applied} applied` : 'Apply to your first role', href: CAREERS_ROUTES.applications, done: applied > 0 },
    { id: 'interview', label: 'Interviews', sub: interviews > 0 ? `${interviews} in progress` : 'Prep when they come', href: CAREERS_ROUTES.interviews, done: interviews > 0 },
    { id: 'offer', label: 'Offers', sub: offers > 0 ? `${offers} received` : 'The finish line', href: CAREERS_ROUTES.offers, done: offers > 0 },
  ];

  let pts = 0;
  if (hasResume) pts += 25;
  if (resumeScore != null) pts += Math.round((resumeScore / 100) * 20);
  if (atsScore != null) pts += 15;
  if (applied > 0) pts += 20;
  if (interviews > 0) pts += 12;
  if (offers > 0) pts += 8;
  const pct = Math.min(100, pts);

  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) ?? null;
  const stage = offers > 0 ? 'Fielding offers' : interviews > 0 ? 'Interviewing' : applied > 0 ? 'Applying' : hasResume ? 'Resume ready' : 'Getting started';

  return (
    <div className="card cr-card" aria-labelledby="fx-cr-title" style={{ marginBottom: 12 }}>
      <style>{`
        .cr-card .cr-top { display: grid; grid-template-columns: 200px 1fr; gap: 26px; align-items: center; }
        .cr-score { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; }
        .cr-stage-l { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--ink3); }
        .cr-stage-v { font-size: 17px; font-weight: 700; letter-spacing: -.01em; color: var(--ink); margin-top: 2px; }
        .cr-next { text-decoration: none; width: auto !important; display: inline-flex !important; align-items: center; gap: 7px; padding: 10px 18px !important; margin-top: 12px; font-size: 12.5px !important; }
        .cr-pipe .pipe-dot { text-decoration: none; }
        .cr-pipe .pipe-label { text-decoration: none; display: inline-block; }
        .cr-pipe .pipe-label:hover { color: var(--accent-text); }
        .cr-connect { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--hair2); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .cr-connect-note { font-size: 12.5px; color: var(--ink3); }
        .cr-connect a { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--accent-text); text-decoration: none; }
        .cr-connect a:hover { gap: 9px; }
        @media (max-width: 720px) {
          .cr-card .cr-top { grid-template-columns: 1fr; gap: 18px; }
          .cr-score { flex-direction: row; justify-content: center; gap: 20px; text-align: left; }
        }
      `}</style>

      <div className="panel-eyebrow" id="fx-cr-title">Career readiness</div>
      <div className="panel-sub" style={{ marginTop: 4, marginBottom: 18 }}>
        {doneCount} of {steps.length} milestones reached{next ? ` · next: ${next.label}` : ' · you’re at the finish line'}
      </div>

      <div className="cr-top">
        <div className="cr-score">
          <ScoreRing score={pct} caption="Job readiness" />
          <div>
            <div className="cr-stage-l">You’re at</div>
            <div className="cr-stage-v">{stage}</div>
            {next && (
              <Link to={next.href} className="btn btn-sm cr-next">
                Next: {next.label}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            )}
          </div>
        </div>

        <ol className="pipe cr-pipe" role="list">
          {steps.map((s) => {
            const state = s.done ? 'done' : next && s.id === next.id ? 'now' : '';
            return (
              <li key={s.id} className={`pipe-step ${state}`}>
                <span className="pipe-dot" aria-hidden="true">
                  {s.done ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  ) : (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'block' }} />
                  )}
                </span>
                <div style={{ minWidth: 0 }}>
                  <Link to={s.href} className="pipe-label" aria-label={`${s.label} — ${s.done ? 'done' : 'to do'}: ${s.sub}`}>{s.label}</Link>
                  <div className="pipe-sub">{s.sub}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="cr-connect">
        <span className="cr-connect-note">Your career and money picture, one FinatriX.</span>
        <Link to="/tools/dashboard">
          Open money dashboard
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      </div>
    </div>
  );
}
