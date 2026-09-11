/**
 * "Up next" — the dashboard's action surface.
 *
 * The ordering rules are the whole point of the component: an overdue item
 * outranks everything, dated beats undated, and nothing silently disappears.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { UpNext } from '../careers/components/UpNext';
import { CAREERS_ROUTES } from '../careers/constants';
import type { Reminder } from '../careers/types/jobs';
import type { TaskRow } from '../careers/types/phase3';

afterEach(cleanup);

const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: Math.random().toString(36).slice(2),
    applicationId: 'app-1',
    kind: 'interview',
    title: 'Interview — Acme: Analyst',
    dueAt: iso(2),
    overdue: false,
    ...over,
  };
}

function task(over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: 'u1',
    application_id: null,
    title: 'Send portfolio',
    detail: '',
    kind: 'follow_up',
    status: 'open',
    priority: 'medium',
    due_at: null,
    completed_at: null,
    created_at: iso(-5),
    updated_at: iso(-5),
    ...over,
  } as TaskRow;
}

const renderUpNext = (props: Partial<Parameters<typeof UpNext>[0]> = {}) =>
  render(
    <MemoryRouter>
      <UpNext reminders={[]} tasks={[]} hasResume {...props} />
    </MemoryRouter>
  );

describe('UpNext', () => {
  it('offers the next real action when nothing is due', () => {
    renderUpNext({ hasResume: true });
    const cta = screen.getByRole('link', { name: /find matching jobs/i });
    expect(cta).toHaveAttribute('href', CAREERS_ROUTES.jobs);
  });

  it('points a user with no resume at upload instead', () => {
    renderUpNext({ hasResume: false });
    expect(screen.getByRole('link', { name: /upload a resume/i })).toHaveAttribute(
      'href',
      CAREERS_ROUTES.upload
    );
  });

  it('shows reminders and open tasks together', () => {
    renderUpNext({
      reminders: [reminder({ title: 'Interview — Acme' })],
      tasks: [task({ title: 'Send portfolio' })],
    });
    expect(screen.getByText('Interview — Acme')).toBeInTheDocument();
    expect(screen.getByText('Send portfolio')).toBeInTheDocument();
  });

  it('puts overdue items first and counts them', () => {
    renderUpNext({
      reminders: [
        reminder({ title: 'Soon', dueAt: iso(3), overdue: false }),
        reminder({ title: 'Late', dueAt: iso(-3), overdue: true }),
      ],
    });

    expect(screen.getByText('1 overdue')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByText('Late')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Soon')).toBeInTheDocument();
  });

  it('orders dated items by due date and sinks undated ones', () => {
    renderUpNext({
      reminders: [reminder({ title: 'Later', dueAt: iso(9) }), reminder({ title: 'Sooner', dueAt: iso(1) })],
      tasks: [task({ title: 'No date', due_at: null })],
    });

    const titles = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(titles[0]).toContain('Sooner');
    expect(titles[1]).toContain('Later');
    expect(titles[2]).toContain('No date');
  });

  it('treats a past task due date as overdue', () => {
    renderUpNext({ tasks: [task({ title: 'Chase recruiter', due_at: iso(-1) })] });
    expect(screen.getByText('1 overdue')).toBeInTheDocument();
  });

  it('leaves finished tasks out', () => {
    renderUpNext({
      tasks: [
        task({ title: 'Done thing', status: 'done' }),
        task({ title: 'Dropped thing', status: 'dismissed' }),
      ],
    });
    expect(screen.queryByText('Done thing')).toBeNull();
    expect(screen.queryByText('Dropped thing')).toBeNull();
    // Falls through to the empty state rather than rendering an empty list.
    expect(screen.getByRole('link', { name: /find matching jobs/i })).toBeInTheDocument();
  });

  it('sends each kind to the page that can actually resolve it', () => {
    renderUpNext({
      reminders: [
        reminder({ kind: 'offer_expiry', title: 'Offer expires — Acme' }),
        reminder({ kind: 'assessment_due', title: 'Assessment due — Beta' }),
        reminder({ kind: 'resume_outdated', title: 'Resume is stale' }),
      ],
    });

    const hrefOf = (title: string) =>
      screen.getByRole('link', { name: `Open — ${title}` }).getAttribute('href');

    expect(hrefOf('Offer expires — Acme')).toBe(CAREERS_ROUTES.offers);
    expect(hrefOf('Assessment due — Beta')).toBe(CAREERS_ROUTES.assessments);
    expect(hrefOf('Resume is stale')).toBe(CAREERS_ROUTES.resumes);
  });

  it('caps the list so the dashboard never turns into a queue', () => {
    renderUpNext({
      reminders: Array.from({ length: 12 }, (_, i) => reminder({ title: `Item ${i}`, dueAt: iso(i + 1) })),
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });
});
