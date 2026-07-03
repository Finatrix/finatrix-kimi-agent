/**
 * Smart reminders — pure derivation from application data, no storage of its
 * own. The notifications service materializes these into the notifications
 * table with dedupe keys so each event notifies exactly once.
 */

import type { ApplicationRow, Reminder } from '../types/jobs';
import { ACTIVE_STAGES } from '../types/jobs';

const DAY = 24 * 60 * 60 * 1000;

/** Days of silence after which an active application counts as stale. */
const INACTIVE_AFTER_DAYS = 14;
/** Days after applying with no response before suggesting a follow-up. */
const FOLLOW_UP_AFTER_DAYS = 7;
/** How far ahead deadline/interview/offer reminders start firing. */
const LEAD_DAYS = 3;

export function computeReminders(applications: ApplicationRow[], now = new Date()): Reminder[] {
  const reminders: Reminder[] = [];
  const nowMs = now.getTime();

  for (const app of applications) {
    if (app.archived) continue;
    const label = `${app.job_title || 'Role'} at ${app.company_name || 'company'}`;
    const active = (ACTIVE_STAGES as readonly string[]).includes(app.stage);

    const withinLead = (iso: string | null) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return Number.isFinite(t) && t - nowMs <= LEAD_DAYS * DAY && nowMs - t <= 2 * DAY;
    };

    if (active && app.stage !== 'applied' && withinLead(app.closes_at)) {
      reminders.push({
        id: `deadline:${app.id}`,
        applicationId: app.id,
        kind: 'deadline',
        title: `Application deadline approaching — ${label}`,
        dueAt: app.closes_at!,
        overdue: new Date(app.closes_at!).getTime() < nowMs,
      });
    }

    if (active && withinLead(app.interview_at)) {
      reminders.push({
        id: `interview:${app.id}:${app.interview_at}`,
        applicationId: app.id,
        kind: 'interview',
        title: `Interview coming up — ${label}`,
        dueAt: app.interview_at!,
        overdue: false,
      });
    }

    if ((app.stage === 'offer_received' || app.stage === 'negotiating') && withinLead(app.offer_expires_at)) {
      reminders.push({
        id: `offer:${app.id}`,
        applicationId: app.id,
        kind: 'offer_expiry',
        title: `Offer expires soon — ${label}`,
        dueAt: app.offer_expires_at!,
        overdue: new Date(app.offer_expires_at!).getTime() < nowMs,
      });
    }

    if (app.stage === 'applied' && app.applied_at) {
      const applied = new Date(app.applied_at).getTime();
      if (Number.isFinite(applied) && nowMs - applied >= FOLLOW_UP_AFTER_DAYS * DAY) {
        reminders.push({
          id: `followup:${app.id}`,
          applicationId: app.id,
          kind: 'follow_up',
          title: `No response for ${Math.floor((nowMs - applied) / DAY)} days — follow up on ${label}`,
          dueAt: new Date(applied + FOLLOW_UP_AFTER_DAYS * DAY).toISOString(),
          overdue: true,
        });
      }
    }

    if (active && app.stage !== 'applied') {
      const updated = new Date(app.updated_at).getTime();
      if (Number.isFinite(updated) && nowMs - updated >= INACTIVE_AFTER_DAYS * DAY) {
        reminders.push({
          id: `inactive:${app.id}`,
          applicationId: app.id,
          kind: 'inactive',
          title: `“${label}” has been idle for ${Math.floor((nowMs - updated) / DAY)} days`,
          dueAt: app.updated_at,
          overdue: true,
        });
      }
    }
  }

  return reminders.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}
