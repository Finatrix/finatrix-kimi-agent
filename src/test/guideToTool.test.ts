/**
 * Learn → Calculate, enforced.
 *
 * The content moat this site is built on is not "we have guides" — plenty of
 * sites have guides. It is that a guide about emergency funds walks you into
 * the calculator that sizes one, in the paragraph where you start wanting it.
 *
 * That relationship is declared twice, in two places that can drift:
 *
 *   1. An article's `tools: [...]` in `shared/content.ts`. This drives the
 *      "guides that use this tool" strip on the calculator page and the
 *      structured data — it is the machine-readable claim.
 *   2. A `kind: 'tool'` block inside the article body. This is the contextual
 *      card a reader actually sees and clicks — the human-readable one.
 *
 * An article that declares a tool and never mentions it in the prose has made
 * the first claim without the second: the calculator page advertises the guide
 * as a way in, and the guide offers no way out. Nothing else catches that,
 * because both halves are individually valid.
 *
 * The reverse direction matters too. An inline card for a tool the article does
 * not declare puts a call to action in front of a reader that the registry does
 * not consider related — the "tools inserted into unrelated content" failure.
 */

import { describe, it, expect } from 'vitest';
import { ARTICLES } from '../shared/content';
import { TOOL_IDS } from '../shared/routes';
import { loadTopicContent } from '../content';
import type { Block } from '../content/types';

/** Every `toolId` named by a `kind: 'tool'` block anywhere in an article body. */
function inlineToolIds(sections: readonly { blocks: readonly Block[] }[]): Set<string> {
  const found = new Set<string>();
  for (const section of sections) {
    for (const block of section.blocks) {
      if (block.kind === 'tool') found.add(block.toolId);
    }
  }
  return found;
}

const WITH_TOOLS = ARTICLES.filter((a) => a.tools && a.tools.length > 0);

describe('guides lead into the tools they name', () => {
  it('finds articles that declare tools', () => {
    // A filter that quietly matched nothing would make every case below vacuous.
    expect(WITH_TOOLS.length).toBeGreaterThan(20);
  });

  it.each(WITH_TOOLS.map((a) => [`${a.topic}/${a.slug}`, a] as const))(
    '%s offers a contextual way into a tool it declares',
    async (_name, article) => {
      const copy = await loadTopicContent(article.topic);
      const body = copy?.articles[article.slug];
      expect(body, 'article has no body copy').toBeTruthy();

      const inline = inlineToolIds(body!.sections);
      expect(
        inline.size,
        'declares tools in the registry but never links to one from the prose — '
          + 'the calculator page lists this guide as a way in, and the guide offers no way out',
      ).toBeGreaterThan(0);
    },
  );

  it.each(WITH_TOOLS.map((a) => [`${a.topic}/${a.slug}`, a] as const))(
    '%s only promotes tools it declares as related',
    async (_name, article) => {
      const copy = await loadTopicContent(article.topic);
      const declared = new Set<string>(article.tools ?? []);
      for (const id of inlineToolIds(copy!.articles[article.slug].sections)) {
        expect(
          declared.has(id),
          `promotes "${id}" inline but does not declare it in \`tools\` — either it is `
            + 'relevant and belongs in the registry, or it is an unrelated call to action',
        ).toBe(true);
      }
    },
  );

  it('every inline tool card points at a calculator that exists', async () => {
    const ids = new Set<string>();
    for (const article of ARTICLES) {
      const copy = await loadTopicContent(article.topic);
      const body = copy?.articles[article.slug];
      if (body) for (const id of inlineToolIds(body.sections)) ids.add(id);
    }
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) {
      expect(TOOL_IDS as readonly string[], `unknown tool "${id}"`).toContain(id);
    }
  });
});
