/**
 * `/learn/<topic>/<slug>` — an article.
 *
 * The header — H1, breadcrumb, author, updated date — comes from the eager index
 * and renders immediately. The answer block and the body suspend on the topic's
 * own chunk, inside Suspense boundaries of their own rather than the app-level
 * one, so a reader sees the page's identity at once instead of a full-page
 * spinner.
 *
 * The answer-first ordering is the same decision, applied editorially. The
 * summary states the conclusion before the table of contents, so a reader who
 * bounces after eight seconds still leaves with it — and so an AI answer engine
 * extracting a citation finds the claim rather than a preamble.
 */

import { Suspense, use, useEffect } from 'react';
import { Link, useParams } from 'react-router';
import NotFound from '../pages/NotFound';
import PageShell from '../marketing/PageShell';
import { Faq, Section } from '../marketing/ui';
import { TOOLS } from '../lib/tools';
import { applyContentSchema } from '../lib/seo';
import { readingMinutes } from '../content/readingTime';
import type { ArticleContent } from '../content/types';
import {
  AUTHOR,
  LEARN_ROOT,
  articleFor,
  articlePath,
  contentLinkFor,
  topicFor,
  topicPath,
  type Article,
} from '../shared/content';
import { Blocks } from './Blocks';
import { topicContentPromise } from './content';

/**
 * The loaded copy for one article, or null.
 *
 * A registered article with no copy is a bug the tests catch before it ships
 * (`content.test.ts` pairs every entry with a module). Returning null rather
 * than throwing keeps a deploy that somehow got here readable.
 */
function useArticleCopy(article: Article): ArticleContent | null {
  const content = use(topicContentPromise(article.topic));
  const path = articlePath(article);

  // Upgrade the page's JSON-LD now that the summary, FAQ and body are really on
  // the page. See `applyContentSchema`.
  useEffect(() => {
    applyContentSchema(path, content);
  }, [path, content]);

  return content?.articles[article.slug] ?? null;
}

function Lines({ widths }: { widths: readonly number[] }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {widths.map((w, i) => (
        <div
          key={w}
          className="h-4 rounded bg-surface-2"
          style={{ width: `${w}%`, opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  );
}

/** The "In short" block: the conclusion, then the checkable takeaways. */
function ArticleHero({ article }: { article: Article }) {
  const copy = useArticleCopy(article);
  if (!copy) return null;

  return (
    <>
      <p className="mt-3 max-w-[68ch] text-[16px] leading-[1.7] text-ink">{copy.summary}</p>
      <ul className="mt-5 ml-5 list-disc space-y-2 border-t border-hairline pt-5 text-[14.5px] leading-[1.7] text-ink-2 marker:text-accent-text">
        {copy.keyPoints.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
    </>
  );
}

function ArticleBody({ article }: { article: Article }) {
  const copy = useArticleCopy(article);
  if (!copy) return null;

  const minutes = readingMinutes(copy);

  return (
    <>
      {/* The table of contents is a real `<nav>` with a label, so it is one of
          the landmarks a screen-reader user can jump between rather than a list
          of links they have to find. */}
      <nav
        aria-label="On this page"
        className="rounded-[16px] border border-hairline bg-surface-2 p-5"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          On this page · {minutes} min read
        </p>
        <ol className="mt-3 space-y-2">
          {copy.sections.map((s, i) => (
            <li key={s.id} className="flex gap-2.5 text-[14px] leading-[1.5]">
              <span aria-hidden="true" className="font-mono text-[11px] text-ink-3">
                {String(i + 1).padStart(2, '0')}
              </span>
              <a href={`#${s.id}`} className="fx-prose-link">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {copy.sections.map((section) => (
        <Section key={section.id} id={section.id} title={section.title}>
          <Blocks blocks={section.blocks} idPrefix={section.id} />
        </Section>
      ))}

      {copy.sources && copy.sources.length > 0 && (
        <Section
          id="sources"
          title="Sources"
          intro="Where to verify the rules and limits this guide states. Everything else on the page is arithmetic shown in full."
        >
          <ul className="ml-5 list-disc space-y-2 text-[14.5px] leading-[1.7] text-ink-2 marker:text-accent-text">
            {copy.sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fx-prose-link"
                >
                  {s.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                  <span aria-hidden="true" className="ml-0.5 text-[0.85em]">
                    ↗
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {copy.faq && copy.faq.length > 0 && <Faq entries={copy.faq} />}
    </>
  );
}

/** Hand-picked sibling articles, resolved from the registry so a bad key drops rather than 404s. */
function RelatedArticles({ keys }: { keys: readonly string[] }) {
  const links = keys
    .map((k) => contentLinkFor(`${LEARN_ROOT}/${k}`))
    .filter((l) => l !== null);
  if (!links.length) return null;

  return (
    <Section
      id="related"
      title="Read next"
      className="mt-16 border-t border-hairline pt-10"
    >
      <ul
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))' }}
      >
        {links.map((l) => (
          <li key={l.path}>
            <Link
              to={l.path}
              className="group block h-full rounded-[14px] border border-hairline p-4 transition-colors hover:border-[color:var(--accent-text)] focus-visible:border-[color:var(--accent-text)]"
            >
              <span className="block text-[14px] font-medium leading-[1.4] text-ink transition-colors group-hover:text-accent-text">
                {l.name}
              </span>
              <span className="mt-1.5 block text-[13px] leading-[1.55] text-ink-3">{l.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function ArticlePage() {
  const { topic: topicSlug, slug } = useParams();
  const topic = topicFor(topicSlug);
  const article = articleFor(topicSlug, slug);

  if (!topic || !article) return <NotFound />;

  const tools = (article.tools ?? [])
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter((t) => t !== undefined);

  return (
    <PageShell
      heading={article.heading}
      name={article.crumb}
      crumbs={[
        { name: 'Learn', path: LEARN_ROOT },
        { name: topic.name, path: topicPath(topic) },
      ]}
      updated={article.updated}
      updatedLabel="Updated"
      meta={
        <>
          <span aria-hidden="true">·</span>
          <span>
            By{' '}
            <Link to={AUTHOR.url} className="hover:text-accent-text transition-colors">
              {AUTHOR.name}
            </Link>
          </span>
        </>
      }
      hero={
        <div className="mt-8 rounded-[18px] border border-hairline bg-surface-2 p-6">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent-text">
            In short
          </h2>
          <Suspense fallback={<div className="mt-3"><Lines widths={[96, 90, 82, 55]} /></div>}>
            <ArticleHero article={article} />
          </Suspense>
        </div>
      }
    >
      <Suspense fallback={<Lines widths={[92, 78, 85, 60]} />}>
        <ArticleBody article={article} />
      </Suspense>

      {tools.length > 0 && (
        <Section
          id="tools"
          title="Tools used in this guide"
          className="mt-16 border-t border-hairline pt-10"
        >
          <ul
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}
          >
            {tools.map((tool) => (
              <li key={tool.id}>
                <Link
                  to={tool.href}
                  className="group block h-full rounded-[14px] border border-hairline p-4 transition-colors hover:border-[color:var(--accent-text)] focus-visible:border-[color:var(--accent-text)]"
                >
                  <span className="block text-[14px] font-medium text-ink transition-colors group-hover:text-accent-text">
                    {tool.name}
                  </span>
                  <span className="mt-1 block text-[13px] leading-[1.55] text-ink-3">
                    {tool.blurb}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {article.related && <RelatedArticles keys={article.related} />}

      <p className="mt-12 max-w-[68ch] border-t border-hairline pt-6 text-[13px] leading-[1.7] text-ink-3">
        This guide is educational and is not financial advice. Figures are illustrative and derived
        from the assumptions stated on this page. Confirm anything that affects a real decision, and
        speak to a registered adviser where the decision warrants it.
      </p>
    </PageShell>
  );
}
