/**
 * The "Up next" list: dated reminders from applications plus open tasks,
 * overdue first, then by date. Shared by Home and the UpNext component.
 */
import type { IconName } from '../../tools/ui/Icon';
import { CAREERS_ROUTES } from '../constants';
import type { Reminder } from '../types/jobs';
import type { TaskRow } from '../types/phase3';

export interface UpNextItem {
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
export function buildUpNextItems(reminders: Reminder[], tasks: TaskRow[], limit: number): UpNextItem[] {
  const now = Date.now();

  const fromReminders: UpNextItem[] = reminders.map((r) => ({
    id: `reminder-${r.id}`,
    title: r.title,
    dueAt: r.dueAt,
    overdue: r.overdue,
    icon: REMINDER_ICON[r.kind],
    to: REMINDER_ROUTE[r.kind],
    kind: REMINDER_KIND[r.kind],
  }));

  const fromTasks: UpNextItem[] = tasks
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
