/**
 * Text sanitization for resume content.
 *
 * Extracted resume text is untrusted input twice over: it goes INTO an AI
 * prompt (prompt-injection surface) and AI output eventually renders in the
 * UI (markup-injection surface). React already escapes text on render; these
 * helpers additionally strip control characters, zero-width/bidi tricks and
 * markup so stored data is clean everywhere it travels.
 */

/** Control chars (except \n\t), zero-width chars, and bidi override marks. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Normalize and de-weaponize a block of extracted resume text. */
export function sanitizeText(input: string, maxLength = 200_000): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .slice(0, maxLength)
    .trim();
}

/** One-line field coming out of the AI (names, titles, labels…). */
export function sanitizeField(input: unknown, maxLength = 300): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(CONTROL_CHARS, '')
    .replace(/<[^>]*>/g, '')      // strip any markup the model invented
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
    .trim();
}

/** Multi-line prose field out of the AI (summaries, suggestions…). */
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

/** Coerce unknown AI output into a clean string array. */
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

/** Clamp any numeric-ish AI value into a 0–100 integer score. */
export function clampScore(input: unknown): number {
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Keep only characters that make sense in a stored file name and cap length.
 * The storage path itself is always a generated UUID — this is only for the
 * display name we keep in the database.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(CONTROL_CHARS, '').replace(/[/\\]/g, '_').trim();
  return (cleaned || 'resume').slice(0, 160);
}
