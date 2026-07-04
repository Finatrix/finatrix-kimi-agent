/**
 * Email Infrastructure templates (Phase 4, Module 9). Pure functions —
 * {subject, html, text} — no network calls here. `services/email.ts` sends
 * them through the careers-email edge function (Resend-ready, inert without
 * a RESEND_API_KEY secret).
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function wrap(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#0A0A0A;color:#F5F5F0;padding:24px;">
<div style="max-width:520px;margin:0 auto;">
<h2 style="color:#D4AF37;font-size:18px;margin-bottom:16px;">${title}</h2>
${bodyHtml}
<p style="margin-top:32px;font-size:11px;color:#8A8A8A;">FinatriX Careers</p>
</div></body></html>`;
}

export function welcomeEmail(name: string): EmailContent {
  const subject = `Welcome to FinatriX Careers, ${name}`;
  const text = `Welcome, ${name}! Upload your first resume to get your Resume Score, ATS audit and Career DNA.`;
  return { subject, text, html: wrap(subject, `<p>${text}</p>`) };
}

export function emailVerificationEmail(verifyUrl: string): EmailContent {
  const subject = 'Verify your FinatriX email';
  const text = `Verify your email: ${verifyUrl}`;
  return { subject, text, html: wrap(subject, `<p>Confirm your email address to activate your account.</p><p><a href="${verifyUrl}" style="color:#D4AF37;">Verify email</a></p>`) };
}

export function passwordResetEmail(resetUrl: string): EmailContent {
  const subject = 'Reset your FinatriX password';
  const text = `Reset your password: ${resetUrl}`;
  return { subject, text, html: wrap(subject, `<p>Click below to choose a new password. If you didn't request this, ignore this email.</p><p><a href="${resetUrl}" style="color:#D4AF37;">Reset password</a></p>`) };
}

export function subscriptionEmail(planName: string, status: string): EmailContent {
  const subject = `Your ${planName} subscription is ${status}`;
  const text = `Your FinatriX subscription (${planName}) is now ${status}.`;
  return { subject, text, html: wrap(subject, `<p>${text}</p>`) };
}

export function paymentEmail(amount: string, status: 'succeeded' | 'failed'): EmailContent {
  const subject = status === 'succeeded' ? 'Payment received' : 'Payment failed';
  const text = status === 'succeeded' ? `We received your payment of ${amount}. Thank you.` : `Your payment of ${amount} failed. Please update your payment method.`;
  return { subject, text, html: wrap(subject, `<p>${text}</p>`) };
}

export function applicationReminderEmail(jobTitle: string, company: string, reason: string): EmailContent {
  const subject = `Reminder: ${jobTitle} at ${company}`;
  const text = reason;
  return { subject, text, html: wrap(subject, `<p>${reason}</p>`) };
}

export function interviewReminderEmail(jobTitle: string, company: string, when: string): EmailContent {
  const subject = `Interview tomorrow: ${jobTitle} at ${company}`;
  const text = `Your interview for ${jobTitle} at ${company} is scheduled for ${when}.`;
  return { subject, text, html: wrap(subject, `<p>${text}</p><p>Good luck — review your prep notes in Interview Prep.</p>`) };
}

export function offerReminderEmail(company: string, expiresAt: string): EmailContent {
  const subject = `Offer from ${company} expires soon`;
  const text = `Your offer from ${company} expires on ${expiresAt}. Review it in Offer Management.`;
  return { subject, text, html: wrap(subject, `<p>${text}</p>`) };
}

export function careerReportEmail(period: 'weekly' | 'monthly', headline: string, bullets: string[]): EmailContent {
  const subject = period === 'weekly' ? 'Your weekly career report' : 'Your monthly career report';
  const text = `${headline}\n\n${bullets.join('\n')}`;
  return {
    subject, text,
    html: wrap(headline, `<ul>${bullets.map((b) => `<li style="margin-bottom:6px;">${b}</li>`).join('')}</ul>`),
  };
}
