/**
 * Every knowledge-layer route renders through the real App, signed out, with the
 * content its registry entry promises — and with a visible breadcrumb trail that
 * matches the `BreadcrumbList` JSON-LD emitted for the same URL.
 *
 * That last assertion is here because the mismatch it checks for shipped once
 * during development: the article page passed the TOPIC name as its final crumb,
 * so the visible trail read "Home › Learn › Investing › Investing" while the
 * markup claimed "… › SIP maths". Structured data that describes a navigation
 * the page does not show is exactly the kind of defect no unit test on the
 * registry alone can see — it needs the rendered DOM and the graph compared
 * against each other.
 *
 * The copy assertions use `findBy*` rather than `getBy*` throughout, because the
 * intro, FAQ, summary and key points now arrive with the topic's lazy chunk
 * rather than with the index. That is the whole point of the split, and the
 * tests have to wait for the same thing a reader does.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import App from '../App';
import {
  ARTICLES,
  CONTENT_PATHS,
  LEARN_ROOT,
  TOPICS,
  articlePath,
  topicPath,
  topicSlugForContentPath,
} from '../shared/content';
import { loadTopicContent } from '../content';
import type { TopicContent } from '../content/types';
import { structuredDataForPath } from '../lib/seo';

/** Every topic's copy, loaded once so assertions can name what should render. */
const COPY = new Map<string, TopicContent>();
for (const topic of TOPICS) {
  const loaded = await loadTopicContent(topic.slug);
  if (loaded) COPY.set(topic.slug, loaded);
}

/**
 * Render a route and let every Suspense boundary settle before returning.
 *
 * `render` wraps its work in a SYNCHRONOUS `act`, and both learn pages now
 * suspend on their topic chunk during the first render. React warns about that
 * ("a component suspended inside an `act` scope, but the `act` call was not
 * awaited") and, more importantly, the retry it schedules is not flushed — so
 * the copy never appears and every assertion against it times out. Wrapping the
 * render in an awaited async `act` is the documented fix, and it is closer to
 * what a browser does anyway.
 */
async function renderAt(path: string) {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
  });
  return result;
}

/** The crumb labels the rendered page actually shows, Home first. */
function visibleTrail(): string[] {
  const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
  return within(nav)
    .getAllByRole('listitem')
    .map((li) => li.textContent?.replace(/›/g, '').trim() ?? '');
}

/**
 * The crumb names the JSON-LD claims for the same URL.
 *
 * Resolved with the topic's copy, because that is what the edge Worker writes
 * into the served bytes and what the page upgrades to once its chunk lands.
 */
function markupTrail(path: string): string[] {
  const slug = topicSlugForContentPath(path);
  const graph = structuredDataForPath(path, slug ? COPY.get(slug) ?? null : null)!['@graph'] as Record<
    string,
    unknown
  >[];
  const list = graph.find((n) => n['@type'] === 'BreadcrumbList')!;
  return (list.itemListElement as Array<Record<string, string>>).map((c) => c.name);
}

describe('knowledge-layer routes', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('renders the hub with every topic linked', async () => {
    const { container } = await renderAt(LEARN_ROOT);
    expect(await screen.findByRole('heading', { level: 1, name: 'Learn' })).toBeInTheDocument();
    for (const topic of TOPICS) {
      // Matched by href rather than by accessible name: the nav and the footer
      // both carry links whose names overlap the topic names ("Invest" vs
      // "Investing"), and a name-based query cannot tell them apart.
      const links = container.querySelectorAll(`a[href="${topicPath(topic)}"]`);
      expect(links.length, `${topic.slug} must be linked from the hub`).toBeGreaterThan(0);
    }
  });

  for (const topic of TOPICS) {
    it(`renders the ${topic.slug} topic hub with its cornerstone content`, async () => {
      const copy = COPY.get(topic.slug)!;
      await renderAt(topicPath(topic));
      expect(
        await screen.findByRole('heading', { level: 1, name: topic.heading }),
      ).toBeInTheDocument();

      // The cornerstone intro is what stops the hub being a link list. It
      // arrives with the lazy chunk, hence findBy.
      expect(await screen.findByText(copy.topic.intro[0])).toBeInTheDocument();

      // Every definition is visible, which is what makes the DefinedTermSet
      // markup a description of the page rather than an assertion about it.
      //
      // Scoped to the vocabulary section rather than the whole document: a term
      // can legitimately equal the topic's own name ("Net worth" is both the H1
      // and a defined term), and a document-wide text query then matches two
      // elements and fails on a page that is entirely correct.
      const definitions = within(
        document.querySelector('section[aria-labelledby="definitions"]') as HTMLElement,
      );
      for (const d of copy.topic.definitions) {
        expect(definitions.getByText(d.term), `${topic.slug}: ${d.term}`).toBeInTheDocument();
      }

      // Same for the FAQ — Google requires the marked-up Q&A to be on the page.
      const faq = within(document.querySelector('section[aria-labelledby="faq"]') as HTMLElement);
      for (const entry of copy.topic.faq) {
        expect(faq.getByText(entry.q), `${topic.slug}: ${entry.q}`).toBeInTheDocument();
      }
    });
  }

  for (const article of ARTICLES) {
    it(`renders ${article.topic}/${article.slug} with its answer-first summary`, async () => {
      const copy = COPY.get(article.topic)!.articles[article.slug];
      await renderAt(articlePath(article));

      expect(
        await screen.findByRole('heading', { level: 1, name: article.heading }),
      ).toBeInTheDocument();
      // The summary is the block an answer engine quotes.
      expect(await screen.findByText(copy.summary)).toBeInTheDocument();
      for (const point of copy.keyPoints) {
        expect(screen.getByText(point)).toBeInTheDocument();
      }
      // Every section heading from the body, so a truncated chunk is caught.
      for (const section of copy.sections) {
        expect(
          screen.getByRole('heading', { level: 2, name: section.title }),
          `${article.slug}: ${section.title}`,
        ).toBeInTheDocument();
      }
    });
  }

  /**
   * Timeout raised well above vitest's 5s default on purpose. This renders
   * every content URL in one test — 99 lazy routes today — so its cost grows
   * with the knowledge layer, and it had been sitting just under the default:
   * ~0.9s on a dev machine, 5013ms on a CI runner, i.e. red in CI and green
   * locally for anyone who never looked at the pipeline.
   *
   * Raised rather than narrowed. Checking a sample of paths would run fast and
   * prove less: the whole value here is that NO content URL disagrees with its
   * own JSON-LD, and a breadcrumb regression tends to hit one topic, not all
   * of them. The ceiling is generous so adding articles doesn't re-break it,
   * while a genuine hang still fails instead of running forever.
   */
  it('shows a breadcrumb trail that matches the JSON-LD, on every content URL', async () => {
    for (const path of CONTENT_PATHS) {
      cleanup();
      await renderAt(path);
      // Wait for the lazy route to resolve before reading the trail.
      await screen.findByRole('heading', { level: 1 });
      expect(visibleTrail(), path).toEqual(markupTrail(path));
    }
  }, 60_000);

  it('renders the real not-found page for an unregistered /learn URL', async () => {
    await renderAt('/learn/budgeting/not-an-article');
    // The edge already answers 404 for this URL; the rendered page has to agree,
    // or it is a soft 404 competing with the real article for the same query.
    expect(await screen.findByText(/404|not found/i)).toBeInTheDocument();
  });
});
