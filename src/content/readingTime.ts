/**
 * Reading time and word count for an article body.
 *
 * ONE implementation, shared by the two things that must agree about it: the
 * visible "N min read" stamp on the article page, and the `wordCount` /
 * `timeRequired` fields in that page's `Article` JSON-LD. A search result that
 * promises a four-minute read for a page that says twelve is a small dishonesty,
 * and the only way to be sure it never happens is for both to be the same
 * function over the same prose.
 *
 * Counts every string a reader actually sees, including table cells and the
 * labels inside worked examples — a guide that is mostly a table is not a
 * one-minute read just because its paragraphs are short.
 *
 * Pure. No DOM, no React — `src/lib/seo.ts` is bundled into the edge Worker and
 * imports this.
 */

import type { ArticleBody } from './types';

/** Every visible string in a body, in document order. */
export function proseOf(body: ArticleBody): string[] {
  const out: string[] = [];
  for (const section of body.sections) {
    out.push(section.title);
    for (const b of section.blocks) {
      switch (b.kind) {
        case 'p':
        case 'h3':
          out.push(b.text);
          break;
        case 'list':
          out.push(...b.items);
          break;
        case 'note':
        case 'warning':
          out.push(b.title, b.text);
          break;
        case 'table':
          out.push(b.caption, ...b.head, ...b.rows.flat());
          if (b.note) out.push(b.note);
          break;
        case 'formula':
          out.push(b.label, b.expression, ...b.where);
          break;
        case 'worked':
          out.push(b.title, ...b.rows.map((r) => `${r.label} ${r.value}`), b.conclusion);
          break;
        case 'tool':
          out.push(b.text);
          break;
      }
    }
  }
  return out;
}

export function wordCount(body: ArticleBody): number {
  const text = proseOf(body).join(' ').trim();
  return text ? text.split(/\s+/).length : 0;
}

/**
 * Minutes, at 220 words a minute — a common estimate for adult reading of
 * non-fiction on screen. Never returns 0: "0 min read" reads as an error.
 */
export function readingMinutes(body: ArticleBody): number {
  return Math.max(1, Math.round(wordCount(body) / 220));
}
