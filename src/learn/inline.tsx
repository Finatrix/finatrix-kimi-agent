/**
 * The tiny inline syntax article prose is written in: `[label](/path)` and
 * `**bold**`. Nothing else.
 *
 * It exists for one reason — internal linking. Section G of the content plan
 * asks every page to link naturally to the related tools and articles it
 * mentions, and a block model whose prose is a plain string cannot do that: the
 * links end up in a "related" strip at the foot of the page, which is a
 * navigation element rather than a contextual link and is read as one.
 *
 * SAFETY. This produces React elements, never HTML. There is no `innerHTML`
 * anywhere in the path, so a body cannot inject markup even if it tried, and the
 * output of an unmatched or malformed pattern is the literal text — it fails
 * closed, as plain prose.
 *
 * External links are recognised (anything not starting with `/`) and rendered
 * with `rel="noopener noreferrer"` plus a visible indication that they leave the
 * site. Internal links use the router's `Link`, so they never cost a full page
 * load. `content.test.ts` asserts every internal target is a route the app
 * really serves.
 */

import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';

/**
 * One pattern for both forms, so a single pass over the string handles them in
 * document order. The alternation is ordered link-first because a link label may
 * itself contain `**`, and the reverse would split the label.
 */
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

/** Every internal link target in a string. Used by the link audit in the tests. */
export function internalTargets(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(INLINE)) {
    const href = m[2];
    if (href?.startsWith('/')) out.push(href);
  }
  return out;
}

/**
 * Parse `text` into React nodes.
 *
 * `keyPrefix` disambiguates the generated keys when several parsed strings are
 * siblings in one list — without it React warns about duplicate keys across
 * blocks that happen to contain the same markup at the same offset.
 */
export function inline(text: string, keyPrefix = ''): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const at = match.index;
    if (at > last) nodes.push(text.slice(last, at));

    const [, label, href, bold] = match;

    if (bold !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}b${at}`} className="font-semibold text-ink">
          {bold}
        </strong>,
      );
    } else if (href.startsWith('/')) {
      nodes.push(
        <Link key={`${keyPrefix}l${at}`} to={href} className="fx-prose-link">
          {label}
        </Link>,
      );
    } else {
      nodes.push(
        <a
          key={`${keyPrefix}x${at}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="fx-prose-link"
        >
          {label}
          {/* The icon is decorative; the words carry the meaning for anyone who
              cannot see it, which is why it is paired with visually-hidden text
              rather than left as a bare glyph (WCAG 2.4.4). */}
          <span className="sr-only"> (opens in a new tab)</span>
          <span aria-hidden="true" className="ml-0.5 text-[0.85em]">
            ↗
          </span>
        </a>,
      );
    }
    last = at + match[0].length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  if (!nodes.length) return text;

  return nodes.map((n, i) => <Fragment key={`${keyPrefix}f${i}`}>{n}</Fragment>);
}
