const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥', deg: '°',
};

/** Decode the HTML entities that appear in ATS payloads. Unknown entities are left alone. */
export function decodeEntities(value: string): string {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1]!.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

/**
 * HTML to readable plain text. Handles ATS payloads that ship entity-escaped HTML
 * (`&lt;p&gt;`), as Greenhouse does, by decoding first when no raw tags are present.
 */
export function htmlToText(value: unknown): string {
  let html = typeof value === 'string' ? value : '';
  if (!html.trim()) return '';
  if (!/<[a-z][^>]*>/i.test(html) && /&lt;[a-z]/i.test(html)) html = decodeEntities(html);
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|table|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
