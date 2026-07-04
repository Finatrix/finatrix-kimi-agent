/**
 * Email Infrastructure client (Phase 4, Module 9). Sends through the
 * careers-email edge function; when RESEND_API_KEY isn't configured yet the
 * function returns `{ sent: false, reason: 'not-configured' }` rather than
 * erroring, so callers can surface "email delivery isn't set up yet"
 * without treating it as a failure.
 */

import { supabase } from '../../lib/supabase';
import type { EmailContent } from './emailTemplates';

export interface SendResult {
  sent: boolean;
  reason?: string;
}

export async function sendEmail(to: string, content: EmailContent): Promise<SendResult> {
  const { data, error } = await supabase.functions.invoke('careers-email', {
    body: { to, subject: content.subject, html: content.html, text: content.text },
  });
  if (error) return { sent: false, reason: 'request-failed' };
  return data as SendResult;
}
