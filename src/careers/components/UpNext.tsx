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
import { Icon } from '../../tools/ui/Icon';
import { CAREERS_ROUTES } from '../constants';
import { buildUpNextItems } from './upNextItems';
import type { Reminder } from '../types/jobs';
import type { TaskRow } from '../types/phase3';
import { formatDate } from '../utils/format';

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
  const items = useMemo(() => buildUpNextItems(reminders, tasks, limit), [reminders, tasks, limit]);
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
