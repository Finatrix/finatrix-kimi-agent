/**
 * Text sanitization for untrusted content.
 *
 * Two threat surfaces share these helpers:
 *  - text that goes INTO an AI prompt (résumé text, transaction notes and
 *    merchant names — all user-authored, all a prompt-injection vector), and
 *  - text that comes BACK OUT of a model and renders in the UI.
 *
 * React escapes text on render; these helpers additionally strip control
 * characters, zero-width/bidi tricks and markup so stored and forwarded data is
 * clean everywhere it travels. `careers/utils/sanitize.ts` re-exports them, so
 * both modules normalise text identically.
 */

/** Control chars (except \n\t), zero-width chars, and bidi override marks. */
// eslint-disable-next-line no-control-regex
export const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Normalize and de-weaponize a block of extracted text. */
export function sanitizeText(input: string, maxLength = 200_000): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .slice(0, maxLength)
    .trim();
}

/** One-line field (names, titles, labels…). */
export function sanitizeField(input: unknown, maxLength = 300): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(CONTROL_CHARS, '')
    .replace(/<[^>]*>/g, '')      // strip any markup the model invented
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
    .trim();
}

/** Multi-line prose field (summaries, suggestions, answers…). */
export function sanitizeProse(input: unknown, maxLength = 2_000): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, maxLength)
    .trim();
}

/** Coerce unknown model output into a clean string array. */
export function sanitizeStringArray(input: unknown, maxItems = 50, maxLength = 300): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    const s = sanitizeField(item, maxLength);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Escape a string for safe embedding inside HTML attributes/exports. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Clamp any numeric-ish value into a 0–100 integer score. */
export function clampScore(input: unknown): number {
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}
