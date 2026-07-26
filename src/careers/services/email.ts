/**
 * Email Infrastructure client (Phase 4, Module 9). Sends through the
 * careers-email edge function; when RESEND_API_KEY isn't configured yet the
 * function returns `{ sent: false, reason: 'not-configured' }` rather than
 * erroring, so callers can surface "email delivery isn't set up yet"
 * without treating it as a failure.
 *
 * ⚠️ INTENTIONALLY UNREFERENCED — do not delete as "dead code".
 * This module and `emailTemplates.ts` are the client half of a deliberately
 * inert feature: the `careers-email` edge function is deployed and the contract
 * is documented (docs/API.md, PROJECT-HANDOFF.md §9), but nothing calls
 * `sendEmail` until a Resend key exists and a product decision is made about
 * which events actually earn an email. Today users copy AI-drafted emails from
 * `services/emails.ts` and send them themselves.
 */

import { invokeAuthed } from '../../lib/functions';
import type { EmailContent } from './emailTemplates';

export interface SendResult {
  sent: boolean;
  reason?: string;
}

export async function sendEmail(to: string, content: EmailContent): Promise<SendResult> {
  const { data, error, reason } = await invokeAuthed<SendResult>('careers-email', {
    to, subject: content.subject, html: content.html, text: content.text,
  });
  if (reason === 'not-configured') return { sent: false, reason: 'not-configured' };
  if (reason === 'no-session') return { sent: false, reason: 'no-session' };
  if (error || !data) return { sent: false, reason: 'request-failed' };
  return data;
}
