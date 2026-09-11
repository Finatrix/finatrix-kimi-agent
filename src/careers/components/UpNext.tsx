/**
 * "Up next" — the one thing the Careers dashboard was missing.
 *
 * The dashboard reported on the user (scores, DNA, skills, funnel rates) but
 * never told them what to DO, so the only action on a returning user's landing
 * page was "Upload a new resume" — advice for someone who had already uploaded
 * one. Meanwhile the two facts with a deadline attached, upcoming interviews
 * and open tasks, existed in the data and were rendered nowhere on it.
 *
 * Nothing here is a new source of truth: reminders come from the same
 * `computeReminders` the Applications page uses, and tasks from the same
 * `listTasks` the Tasks page uses. This is a view onto work the product had
 * already computed and then declined to show at the moment it mattered.
 */

import { useMemo } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from '../../tools/ui/Icon';
import { CAREERS_ROUTES } from '../constants';
import type { Reminder } from '../types/jobs';
import type { TaskRow } from '../types/phase3';
import { formatDate } from '../utils/format';

interface Item {
  id: string;
  title: string;
  dueAt: string | null;
  overdue: boolean;
  icon: IconName;
  to: string;
  /** Short kind label, so a glanced row still says what sort of thing it is. */
  kind: string;
}

/** Where a reminder sends the user to actually deal with it. */
const REMINDER_ROUTE: Record<Reminder['kind'], string> = {
  deadline: CAREERS_ROUTES.applications,
  interview: CAREERS_ROUTES.applications,
  offer_expiry: CAREERS_ROUTES.offers,
  follow_up: CAREERS_ROUTES.applications,
  inactive: CAREERS_ROUTES.applications,
  assessment_due: CAREERS_ROUTES.assessments,
  resume_outdated: CAREERS_ROUTES.resumes,
};

const REMINDER_ICON: Record<Reminder['kind'], IconName> = {
  deadline: 'clock',
  interview: 'clock',
  offer_expiry: 'goal',
  follow_up: 'bills',
  inactive: 'warn',
  assessment_due: 'layers',
  resume_outdated: 'warn',
};

const REMINDER_KIND: Record<Reminder['kind'], string> = {
  deadline: 'Deadline',
  interview: 'Interview',
  offer_expiry: 'Offer',
  follow_up: 'Follow-up',
  inactive: 'Stalled',
  assessment_due: 'Assessment',
  resume_outdated: 'Resume',
};

/**
 * Merge the two streams into one due-date-ordered list.
 *
 * Overdue first, then soonest — an interview tomorrow outranks a task with no
 * date at all, and an undated task still appears rather than being dropped,
 * because "no deadline" is not the same as "not worth doing".
 */
function buildItems(reminders: Reminder[], tasks: TaskRow[], limit: number): Item[] {
  const now = Date.now();

  const fromReminders: Item[] = reminders.map((r) => ({
    id: `reminder-${r.id}`,
    title: r.title,
    dueAt: r.dueAt,
    overdue: r.overdue,
    icon: REMINDER_ICON[r.kind],
    to: REMINDER_ROUTE[r.kind],
    kind: REMINDER_KIND[r.kind],
  }));

  const fromTasks: Item[] = tasks
    .filter((t) => t.status !== 'done' && t.status !== 'dismissed')
    .map((t) => ({
      id: `task-${t.id}`,
      title: t.title,
      dueAt: t.due_at,
      overdue: !!t.due_at && new Date(t.due_at).getTime() < now,
      icon: 'check' as IconName,
      to: CAREERS_ROUTES.tasks,
      kind: 'Task',
    }));

  return [...fromReminders, ...fromTasks]
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      // Undated items sink below everything that has a date.
      if (!a.dueAt) return b.dueAt ? 1 : 0;
      if (!b.dueAt) return -1;
      return a.dueAt.localeCompare(b.dueAt);
    })
    .slice(0, limit);
}

export function UpNext({
  reminders,
  tasks,
  hasResume,
  limit = 5,
}: {
  reminders: Reminder[];
  tasks: TaskRow[];
  /** Drives the empty state: the next step differs before the first upload. */
  hasResume: boolean;
  limit?: number;
}) {
  const items = useMemo(() => buildItems(reminders, tasks, limit), [reminders, tasks, limit]);
  const overdueCount = items.filter((i) => i.overdue).length;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <div className="panel-eyebrow" style={{ flex: 1 }}>Up next</div>
        {overdueCount > 0 && (
          <span className="badge badge-red">{overdueCount} overdue</span>
        )}
      </div>

      {items.length === 0 ? (
        // Not a dead end: an empty queue is the moment to point at the one
        // action that creates the next one.
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.6, flex: '1 1 260px', margin: 0 }}>
            {hasResume
              ? 'Nothing due. Interviews, deadlines and follow-ups appear here as soon as you track an application.'
              : 'Nothing due yet — analyse a resume and your matches, deadlines and follow-ups will collect here.'}
          </p>
          <Link
            to={hasResume ? CAREERS_ROUTES.jobs : CAREERS_ROUTES.upload}
            className="btn btn-sm"
            style={{ textDecoration: 'none', flexShrink: 0 }}
          >
            {hasResume ? 'Find matching jobs' : 'Upload a resume'}
          </Link>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {items.map((item) => (
            <li className="act-row" key={item.id}>
              <div
                className="act-ic"
                style={item.overdue ? { color: 'var(--red)', background: 'rgba(255,90,82,.1)' } : undefined}
              >
                <Icon name={item.icon} size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 11.5, color: item.overdue ? 'var(--red)' : 'var(--ink3)' }}>
                  {item.kind}
                  {item.dueAt ? ` · ${item.overdue ? 'overdue — was due ' : 'due '}${formatDate(item.dueAt)}` : ''}
                </div>
              </div>
              <Link
                to={item.to}
                className="btn btn-ghost btn-sm"
                style={{ textDecoration: 'none', flexShrink: 0 }}
                // The row title alone ("Follow up with Acme") does not say
                // where the link goes when read out of context.
                aria-label={`Open — ${item.title}`}
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
