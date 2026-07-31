/**
 * Pulling a JSON object out of a model completion.
 *
 * The edge function asks OpenRouter for `response_format: json_object`, but
 * models still occasionally wrap the object in a ```json fence or a sentence of
 * preamble. This tolerates all three shapes and returns an empty object rather
 * than throwing, so a malformed reply degrades into "the model gave me nothing
 * usable" instead of an exception surfacing deep inside a component.
 *
 * Lives in the shared AI layer because every consumer of `requestCompletion`
 * needs it. (Careers still carries its own copy in `careers/ai/validate.ts`;
 * that one should be folded into this when Careers is next opened.)
 */

export type JsonDict = Record<string, unknown>;

export function extractJson(content: string): JsonDict {
  const trimmed = content.trim();
  const candidates: string[] = [trimmed];

  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence) candidates.unshift(fence[1].trim());

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));

  for (const c of candidates) {
    try {
      const parsed: unknown = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as JsonDict;
    } catch {
      /* try the next candidate */
    }
  }
  return {};
}
