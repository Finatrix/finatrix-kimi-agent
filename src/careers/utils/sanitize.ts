/**
 * Text sanitization for resume content.
 *
 * The generic helpers moved to `src/lib/sanitize.ts` when the Money tools
 * gained an AI assistant — both surfaces feed user-authored text into prompts
 * and render model output back, so they must normalise text identically. They
 * are re-exported here unchanged; only `sanitizeFileName`, whose fallback name
 * is résumé-specific, stays Careers-owned.
 */

import { CONTROL_CHARS } from '../../lib/sanitize';

export {
  CONTROL_CHARS,
  clampScore,
  escapeHtml,
  sanitizeField,
  sanitizeProse,
  sanitizeStringArray,
  sanitizeText,
} from '../../lib/sanitize';

/**
 * Keep only characters that make sense in a stored file name and cap length.
 * The storage path itself is always a generated UUID — this is only for the
 * display name we keep in the database.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(CONTROL_CHARS, '').replace(/[/\\]/g, '_').trim();
  return (cleaned || 'resume').slice(0, 160);
}
