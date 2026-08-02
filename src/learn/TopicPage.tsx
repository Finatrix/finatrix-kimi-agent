/**
 * `/learn/<topic>` — a topic hub.
 *
 * The cornerstone page for its cluster of articles. It carries a real
 * explanation of the topic before it offers to send the reader anywhere, which
 * is the difference between a hub and a category listing: a page whose entire
 * content is links to other pages is thin regardless of how many links it has,
 * and both readers and search engines treat it that way.
 *
 * The definitions block is deliberate AI-search groundwork. An answer engine
 * deciding whether to cite a page looks for the topic's vocabulary defined
 * plainly and in one place; scattering those definitions across the articles
 * makes each of them slightly better and the topic as a whole much harder to
 * summarise.
 *
 * The heading, lede, guide list and tool strip come from the eager index and
 * render immediately; only the cornerstone prose suspends on the topic's own
 * chunk. So the largest contentful paint is the H1 and the guide list, not a
 * spinner waiting on a network round trip.
 */

import { Suspense, use, useEffect } from 'react';
import { Link, useParams } from 'react-router';
import NotFound from '../pages/NotFound';
import PageShell from '../marketing/PageShell';
import { Faq, Section } from '../marketing/ui';
import { TOOLS } from '../lib/tools';
import { applyContentSchema } from '../lib/seo';
import {
  LEARN_ROOT,
  articlePath,
  articlesInTopic,
  productLinksFor,
  topicFor,
  topicPath,
  type Article,
  type Topic,
} from '../shared/content';
import { topicContentPromise } from './content';

const KIND_LABEL: Record<Article['kind'], string> = {
  explainer: 'Explainer',
  howto: 'How-to',
  comparison: 'Comparison',
};

function ArticleCard({ article }: { article: Article }) {
  return (
    <li>
      <Link
        to={articlePath(article)}
        className="group flex h-full flex-col rounded-[16px] border border-hairline p-5 transition-colors hover:border-[color:var(--accent-text)] focus-visible:border-[color:var(--accent-text)]"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent-text">
          {KIND_LABEL[article.kind]}
        </span>
        <span className="mt-2 text-[16px] font-semibold leading-[1.35] tracking-[-0.01em] text-ink transition-colors group-hover:text-accent-text">
          {article.heading}
        </span>
        <span className="mt-2.5 flex-1 text-[14px] leading-[1.65] text-ink-2">
          {article.description}
        </span>
      </Link>
    </li>
  );
}

/** A card strip of internal links, used for both the tool and product rows. */
function LinkStrip({ links }: { links: ReadonlyArray<{ to: string; name: string; blurb: string }> }) {
  return (
    <ul
      className="grid gap-3"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}
    >
      {links.map((l) => (
        <li key={l.to}>
          <Link
            to={l.to}
            className="group block h-full rounded-[14px] border border-hairline p-4 transition-colors hover:border-[color:var(--accent-text)] focus-visible:border-[color:var(--accent-text)]"
          >
            <span className="block text-[14px] font-medium text-ink transition-colors group-hover:text-accent-text">
              {l.name}
            </span>
            <span className="mt-1 block text-[13px] leading-[1.55] text-ink-3">{l.blurb}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CopySkeleton() {
  return (
    <div className="mt-4 space-y-4" aria-hidden="true">
      {[95, 88, 74].map((w, i) => (
        <div
          key={w}
          className="h-4 rounded bg-surface-2"
          style={{ width: `${w}%`, opacity: 1 - i * 0.18 }}
        />
      ))}
    </div>
  );
}

function TopicCopy({ topic }: { topic: Topic }) {
  const content = use(topicContentPromise(topic.slug));
  const path = topicPath(topic);

  // Upgrade the page's JSON-LD now that the FAQ and the vocabulary are really
  // on the page. See `applyContentSchema`.
  useEffect(() => {
    applyContentSchema(path, content);
  }, [path, content]);

  // A registered topic with no copy is a bug the tests catch before it ships
  // (`content.test.ts` pairs every topic with a module). Rendering nothing
  // rather than crashing keeps a deploy that somehow got here readable.
  if (!content) return null;

  return (
    <>
      <Section id="overview" title={`${topic.name} in short`}>
        {content.topic.intro.map((para) => (
          <p key={para} className="mb-4 max-w-[68ch] text-[15.5px] leading-[1.75] text-ink-2">
            {para}
          </p>
        ))}
      </Section>

      <Section
        id="definitions"
        title="The vocabulary"
        intro="Terms the guides in this topic assume you have met. Each is defined as this site uses it, which is not always how a product brochure would."
      >
        {/* A `<dl>` rather than headed paragraphs: these are genuine
            term/definition pairs, and that is the structure that tells a screen
            reader which definition belongs to which term. */}
        <dl className="divide-y divide-hairline border-y border-hairline">
          {content.topic.definitions.map((d) => (
            <div key={d.term} className="py-4">
              <dt className="text-[15px] font-semibold text-ink">{d.term}</dt>
              <dd className="mt-1.5 max-w-[68ch] text-[14.5px] leading-[1.7] text-ink-2">
                {d.definition}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Faq entries={content.topic.faq} />
    </>
  );
}

export default function TopicPage() {
  const { topic: slug } = useParams();
  const topic = topicFor(slug);

  // An unregistered `/learn/<anything>` renders the real not-found page. The
  // edge already answers 404 for it (`isContentPath` gates the status), so the
  // status line and the rendered page agree — a soft 404 is worse than either.
  if (!topic) return <NotFound />;

  const articles = articlesInTopic(topic.slug);
  const tools = (topic.tools ?? [])
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter((t) => t !== undefined)
    .map((t) => ({ to: t.href, name: t.name, blurb: t.blurb }));
  const product = productLinksFor(topic).map((p) => ({ to: p.path, name: p.name, blurb: p.blurb }));

  return (
    <PageShell
      heading={topic.heading}
      name={topic.name}
      lede={topic.lede}
      crumbs={[{ name: 'Learn', path: LEARN_ROOT }]}
      updated={topic.updated}
    >
      {articles.length > 0 && (
        <Section
          id="guides"
          title="Guides"
          intro={`Every guide in ${topic.name.toLowerCase()}, each written to answer one question completely.`}
        >
          <ul
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))' }}
          >
            {articles.map((a) => (
              <ArticleCard key={a.slug} article={a} />
            ))}
          </ul>
        </Section>
      )}

      <Suspense fallback={<CopySkeleton />}>
        <TopicCopy topic={topic} />
      </Suspense>

      {tools.length > 0 && (
        <Section
          id="tools"
          title="Tools for this topic"
          intro="The calculators that do this topic's arithmetic. Free, no account needed."
          className="mt-16 border-t border-hairline pt-10"
        >
          <LinkStrip links={tools} />
        </Section>
      )}

      {product.length > 0 && (
        <Section
          id="product"
          title="Where FinatriX helps with this"
          intro="The part of the product built around this topic. Nothing here is required to use the guides."
          className="mt-16 border-t border-hairline pt-10"
        >
          <LinkStrip links={product} />
        </Section>
      )}
    </PageShell>
  );
}
