/**
 * Home — the one next step, where the search stands, and what is due.
 *
 * Everything here is read from data the other areas already keep (resumes,
 * applications, tasks); nothing is computed that a section does not already
 * compute. The next step is chosen in a fixed order so it never contradicts
 * itself: a resume first, then a role, then keeping applications moving.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { CAREERS_ROUTES } from '../constants';
import { useCareers } from '../context/CareersContext';
import { buildUpNextItems } from '../components/upNextItems';
import { computeApplicationStats, listApplications } from '../services/applications';
import { computeReminders } from '../services/reminders';
import { listTasks } from '../services/tasks';
import type { ResumeVersionRow, ResumeWithVersions } from '../types';
import type { ApplicationRow } from '../types/jobs';
import type { TaskRow } from '../types/phase3';
import { formatDate } from '../utils/format';
import { CxIcon } from '../ui/icons';
import { Empty, Panel, Skeleton, Tiles } from '../ui/primitives';
import { Area } from './Area';

const CareerCoachPage = lazy(() => import('../pages/CareerCoachPage'));

type Stats = ReturnType<typeof computeApplicationStats>;

function latestVersion(resumes: ResumeWithVersions[]): { resume: ResumeWithVersions; version: ResumeVersionRow } | null {
  let best: { resume: ResumeWithVersions; version: ResumeVersionRow } | null = null;
  for (const resume of resumes) {
    if (resume.is_archived) continue;
    for (const version of resume.versions) {
      if (!best || version.updated_at > best.version.updated_at) best = { resume, version };
    }
  }
  return best;
}

interface NextStep {
  title: string;
  detail: string;
  action: { label: string; to: string };
}

function chooseNextStep(
  latest: ReturnType<typeof latestVersion>,
  stats: Stats | null,
  firstDue: { title: string; to: string; overdue: boolean } | null,
): NextStep {
  if (!latest) {
    return {
      title: 'Upload your resume to get a score and start matching.',
      detail: 'Add a PDF or Word file. You get a recruiter-style score, and every job you look at is ranked against it.',
      action: { label: 'Upload a resume', to: CAREERS_ROUTES.upload },
    };
  }
  if (latest.version.status === 'processing') {
    return {
      title: `“${latest.resume.name}” is being analysed.`,
      detail: 'This usually takes under a minute. You can search for jobs in the meantime.',
      action: { label: 'Search jobs', to: CAREERS_ROUTES.jobs },
    };
  }
  if (latest.version.status === 'failed') {
    return {
      title: `The analysis of “${latest.resume.name}” stopped before it finished.`,
      detail: latest.version.error || 'Open your resumes to run it again.',
      action: { label: 'Open resumes', to: CAREERS_ROUTES.resumes },
    };
  }
  if (firstDue?.overdue) {
    return {
      title: firstDue.title,
      detail: 'This is past its date. Deal with it first, then carry on with the rest of your list.',
      action: { label: 'Open', to: firstDue.to },
    };
  }
  if (!stats || stats.total === 0) {
    return {
      title: 'Find roles that fit you and save the first one.',
      detail: 'Search live openings in five countries. Each result shows how closely it matches your resume.',
      action: { label: 'Search jobs', to: CAREERS_ROUTES.jobs },
    };
  }
  if (stats.applied === 0) {
    return {
      title: `You have ${stats.saved} saved ${stats.saved === 1 ? 'role' : 'roles'}. Apply to the strongest match.`,
      detail: 'Tailor your resume to the role before you apply; it raises your ATS score for that job.',
      action: { label: 'Open applications', to: CAREERS_ROUTES.applications },
    };
  }
  if (firstDue) {
    return {
      title: firstDue.title,
      detail: 'The next dated item across your applications and tasks.',
      action: { label: 'Open', to: firstDue.to },
    };
  }
  return {
    title: 'Keep your applications moving.',
    detail: 'Log replies, follow up on quiet ones and keep searching for strong matches.',
    action: { label: 'Open applications', to: CAREERS_ROUTES.applications },
  };
}

const JOURNEY = ['Resume analysed', 'Role saved', 'Applied', 'Interviewing', 'Offer'] as const;

function journeyIndex(latest: ReturnType<typeof latestVersion>, stats: Stats | null): number {
  if (!latest || latest.version.status !== 'complete') return 0;
  if (!stats || stats.total === 0) return 1;
  if (stats.offers > 0 || stats.accepted > 0) return 5;
  if (stats.interviews > 0) return 4;
  if (stats.applied > 0) return 3;
  return 2;
}

function Overview() {
  const { user } = useAuth();
  const { loading, resumes } = useCareers();
  const [stats, setStats] = useState<Stats | null>(null);
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [appRows, taskRows] = await Promise.all([
      listApplications(user.id).catch(() => [] as ApplicationRow[]),
      listTasks(user.id).catch(() => [] as TaskRow[]),
    ]);
    setApps(appRows);
    setStats(computeApplicationStats(appRows));
    setTasks(taskRows);
    setReady(true);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load-on-mount, as every Careers area does
    void load();
  }, [load]);

  const latest = useMemo(() => latestVersion(resumes), [resumes]);
  const upNext = useMemo(() => buildUpNextItems(computeReminders(apps), tasks, 6), [apps, tasks]);
  const next = chooseNextStep(latest, stats, upNext[0] ?? null);
  const reached = journeyIndex(latest, stats);

  if (loading || !ready) {
    return (
      <div className="cx-grid">
        <div className="cx-panel"><Skeleton lines={3} label="Loading your next step" /></div>
        <div className="cx-panel"><Skeleton lines={4} label="Loading your applications" /></div>
      </div>
    );
  }

  const scored = latest?.version.status === 'complete' ? latest.version : null;

  return (
    <div className="cx-grid" style={{ gap: 20 }}>
      <section className="cx-next" aria-labelledby="cx-next-title">
        <div className="cx-grid cx-grid-main" style={{ gap: 24 }}>
          <div>
            <p className="cx-next-kicker">Your next step</p>
            <h2 id="cx-next-title">{next.title}</h2>
            <p>{next.detail}</p>
            <Link className="cx-btn cx-btn-primary" to={next.action.to}>
              {next.action.label}
              <CxIcon name="arrow" size={16} />
            </Link>
          </div>
          <ol className="cx-steps" aria-label="Where your search stands">
            {JOURNEY.map((label, i) => {
              const done = i < reached;
              const current = i === reached;
              return (
                <li key={label} className="cx-step" data-done={done} data-current={current} aria-current={current ? 'step' : undefined}>
                  <span className="cx-step-dot" aria-hidden="true">{done && <CxIcon name="check" size={12} strokeWidth={2.4} />}</span>
                  {label}
                  {done && <span className="sr-only"> (done)</span>}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {stats && stats.total > 0 && (
        <Tiles
          label="Applications at a glance"
          items={[
            { label: 'Applied', value: stats.applied, note: `${stats.saved} saved`, to: CAREERS_ROUTES.applications },
            { label: 'Interviewing', value: stats.interviews, note: `${stats.interviewRate}% of applications`, to: CAREERS_ROUTES.applications },
            { label: 'Offers', value: stats.offers, note: `${stats.accepted} accepted`, to: CAREERS_ROUTES.offers },
            { label: 'Response rate', value: `${stats.responseRate}%`, note: `${stats.rejections} rejected`, to: CAREERS_ROUTES.applications },
          ]}
        />
      )}

      <div className="cx-grid cx-grid-main">
        <Panel title="Up next" action={<Link to={CAREERS_ROUTES.tasks}>All tasks</Link>}>
          {upNext.length === 0 ? (
            <p className="cx-sub">
              Nothing is due. Deadlines, interviews, follow-ups and tasks from your applications collect here.
            </p>
          ) : (
            <ul className="cx-list">
              {upNext.map((item) => (
                <li key={item.id}>
                  <Link className="cx-row" to={item.to}>
                    <div className="cx-row-main">
                      <p className="cx-row-title">{item.title}</p>
                      <p className="cx-row-meta">
                        <span>{item.kind}</span>
                        {item.dueAt && <span>{formatDate(item.dueAt)}</span>}
                      </p>
                    </div>
                    {item.overdue && <span className="cx-chip cx-chip-bad">Overdue</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Your resume" action={latest ? <Link to={CAREERS_ROUTES.resumes}>All resumes</Link> : undefined}>
          {!latest ? (
            <Empty title="No resume yet" action={<Link className="cx-btn" to={CAREERS_ROUTES.upload}>Upload a resume</Link>}>
              Your resume powers matching, tailoring and interview practice.
            </Empty>
          ) : (
            <div>
              <p className="cx-row-title" style={{ whiteSpace: 'normal' }}>{latest.resume.name}</p>
              <p className="cx-row-meta" style={{ marginBottom: 16 }}>
                <span>Version {latest.version.version_number}</span>
                <span>Updated {formatDate(latest.version.updated_at)}</span>
              </p>
              {scored ? (
                <dl className="cx-tiles" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', margin: 0 }}>
                  <div className="cx-tile">
                    <dt className="cx-tile-label" style={{ marginTop: 0 }}>Resume score</dt>
                    <dd className="cx-tile-value" style={{ margin: '6px 0 0' }}>{scored.resume_score ?? '—'}</dd>
                  </div>
                  <div className="cx-tile">
                    <dt className="cx-tile-label" style={{ marginTop: 0 }}>ATS score</dt>
                    <dd className="cx-tile-value" style={{ margin: '6px 0 0' }}>{scored.ats_score ?? '—'}</dd>
                  </div>
                </dl>
              ) : (
                <p className="cx-sub">{latest.version.status === 'failed' ? 'The last analysis did not finish.' : 'Analysis in progress.'}</p>
              )}
              <p style={{ margin: '16px 0 0' }}>
                <Link className="cx-btn cx-btn-sm" to={CAREERS_ROUTES.coach}>
                  <CxIcon name="spark" size={15} />
                  Ask the career coach
                </Link>
              </p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

export function HomeArea() {
  const { user } = useAuth();
  const name = (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0];
  return (
    <Area
      title={name ? `Hi, ${name}` : 'Home'}
      description="Where your job search stands and what to do next."
      tabs={[
        { key: 'overview', label: 'Overview' },
        { key: 'coach', label: 'Career coach' },
      ]}
    >
      {(tab) =>
        tab === 'coach' ? (
          <Suspense fallback={<Skeleton lines={4} />}>
            <CareerCoachPage />
          </Suspense>
        ) : (
          <Overview />
        )
      }
    </Area>
  );
}
