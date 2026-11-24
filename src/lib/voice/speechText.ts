/**
 * Turning an on-screen answer into something worth hearing.
 *
 * Answers are written to be glanced at: a headline, figure tiles, markdown
 * bullets, sometimes a table. Read verbatim, that is asterisks, pipes and a
 * table nobody can follow by ear. This keeps the words and drops the markup.
 * Nothing here computes or rewrites a figure: every number spoken is one the
 * screen already shows, as written.
 */

/** Long answers stop at a sentence boundary near this; the rest stays on screen. */
export const MAX_SPOKEN_CHARS = 1200;

export interface SpokenAnswer {
  headline?: string;
  /** Tiles already formatted for display, e.g. "Food: ₹4,500". */
  tiles?: readonly string[];
  text: string;
}

function stripMarkdown(md: string): string {
  return md
    .split('\n')
    // A table read aloud is noise; the figures that matter are in the tiles.
    .filter((line) => !/^\s*\|/.test(line))
    .map((line) => line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__|\*|_|`)/g, '')
      .trim())
    .filter(Boolean)
    // Each bullet becomes a sentence, so the voice pauses between them.
    .map((line) => (/[.!?।॥:]$/.test(line) ? line : `${line}.`))
    .join(' ');
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('। '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > max / 3 ? cut.slice(0, end + 1) : cut;
}

export function speechTextFor(answer: SpokenAnswer, max = MAX_SPOKEN_CHARS): string {
  const parts = [
    answer.headline ? stripMarkdown(answer.headline) : '',
    ...(answer.tiles ?? []).map((t) => stripMarkdown(t)),
    stripMarkdown(answer.text),
  ].filter(Boolean);
  // The headline often repeats as the first bullet; say it once.
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return clip(unique.join(' ').replace(/\s+/g, ' ').trim(), max);
}

/**
 * Pieces short enough for every speech engine. Chrome stops speaking a single
 * utterance after about fifteen seconds, so the web reads sentence by sentence.
 */
export function speechChunks(text: string, max = 180): string[] {
  const sentences = text.match(/[^.!?।॥]+[.!?।॥]*\s*/g) ?? [text];
  const out: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > max && current) {
      out.push(current.trim());
      current = '';
    }
    if (s.length > max) {
      // One very long sentence: break at commas or spaces.
      let rest = s;
      while (rest.length > max) {
        const at = Math.max(rest.lastIndexOf(', ', max), rest.lastIndexOf(' ', max));
        const cut = at > max / 3 ? at + 1 : max;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut);
      }
      current = rest;
    } else {
      current += s;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}
