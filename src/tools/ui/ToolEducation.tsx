/**
 * The educational footer below each of the seven public calculators: how to use
 * the tool, how it computes its answer, where its limits are, the FAQ, and links
 * to the related tools.
 *
 * Rendered from ONE place — `ToolRoute` — rather than added to seven page
 * components. The tools' own pages are large and their layouts differ; bolting
 * the same four sections onto each of them would be seven edits now and seven
 * more every time the block changes, with no test able to notice when one was
 * missed.
 *
 * Two things depend on this component existing:
 *
 *  • The `FAQPage` structured data `seo.ts` emits for these URLs is only
 *    legitimate because these questions are visibly on the page. The array is
 *    literally the same one (`TOOL_FAQ`), so the markup and the render cannot
 *    come apart.
 *  • Internal linking. Before this, the seven highest-value organic landing
 *    pages linked to each other only through the top nav — no contextual link
 *    from a budget page to the goal planner it naturally leads to.
 *
 * Styled with Tailwind's theme tokens rather than the tools' own CSS classes, so
 * it renders correctly regardless of which tool's stylesheet happens to be
 * loaded on the route.
 */

import { Link } from 'react-router';
import { TOOLS } from '../../lib/tools';
import { articlePath, articlesUsingTool, topicPath, topicsUsingTool } from '../../shared/content';
import type { ToolId } from '../../shared/routes';
import { TOOL_FAQ } from '../../shared/toolFaq';
import { TOOL_GUIDES, type WorkedExample } from '../../shared/toolGuides';

function List({ items, ordered = false }: { items: readonly string[]; ordered?: boolean }) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag
      className={`ml-5 space-y-2 text-[14px] leading-[1.7] text-ink-2 marker:text-accent-text ${
        ordered ? 'list-decimal' : 'list-disc'
      }`}
    >
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </Tag>
  );
}

function Block({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-9">
      <h3 id={id} className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * A worked example, rendered as a `<dl>` — the same structure and the same
 * reasoning as the `worked` block in an article body: each row is a genuine
 * term/value pair, and that is what tells assistive technology the label and the
 * figure belong together.
 */
function Worked({ example }: { example: WorkedExample }) {
  return (
    <figure className="rounded-[14px] border border-hairline p-5">
      <figcaption className="text-[14px] font-semibold text-ink">{example.title}</figcaption>
      <dl className="mt-4 divide-y divide-hairline">
        {example.rows.map((r, i) => (
          <div
            key={i}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5"
          >
            <dt className="text-[13.5px] leading-[1.5] text-ink-2">{r.label}</dt>
            <dd className="text-[14px] font-medium tabular-nums text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 border-t border-hairline pt-4 text-[14px] leading-[1.7] text-ink-2">
        {example.conclusion}
      </p>
    </figure>
  );
}

export default function ToolEducation({ toolId }: { toolId: ToolId }) {
  const guide = TOOL_GUIDES[toolId];
  const faq = TOOL_FAQ[toolId];
  const tool = TOOLS.find((t) => t.id === toolId);
  const related = guide.related
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter((t) => t !== undefined);

  // Both derived from the content registry rather than listed here. `tools` on
  // an article and `tools` on a topic are the ONE place the relationship is
  // declared; this page and the guide pages are two views of it, which is what
  // makes a new guide appear on the right calculator the day it ships.
  const guides = articlesUsingTool(toolId);
  const topics = topicsUsingTool(toolId);

  return (
    // `h2` is the right level here: the tool page's own PageHead renders the h1,
    // so this continues the outline rather than starting a second one.
    <div className="mx-auto mt-12 w-full max-w-[820px] border-t border-hairline px-4 pb-16 pt-10 sm:px-0">
      <h2
        id="about-this-tool"
        className="scroll-mt-24 text-[20px] font-semibold tracking-[-0.02em] text-ink"
      >
        About {tool?.name ?? 'this tool'}
      </h2>
      <p className="mt-3 max-w-[68ch] text-[15px] leading-[1.7] text-ink-2">{guide.purpose}</p>

      <Block id="how-to-use" title="How to use it">
        <List items={guide.steps} ordered />
      </Block>

      <Block id="methodology" title="How this is calculated">
        <List items={guide.method} />
      </Block>

      <Block id="worked-example" title="A worked example">
        <Worked example={guide.worked} />
      </Block>

      <Block id="common-mistakes" title="Common mistakes">
        <List items={guide.mistakes} />
      </Block>

      <Block id="limits" title="What it assumes, and what it does not do">
        <List items={guide.limits} />
      </Block>

      <Block id="tool-faq" title="Frequently asked questions">
        <div className="divide-y divide-hairline border-y border-hairline">
          {faq.map((entry) => (
            <details key={entry.q} className="group">
              <summary className="flex cursor-pointer items-start justify-between gap-4 py-3.5 text-[14.5px] font-medium text-ink marker:content-[''] [&::-webkit-details-marker]:hidden">
                <span className="max-w-[62ch]">{entry.q}</span>
                <span
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-accent-text transition-transform duration-200 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mb-4 max-w-[68ch] text-[14px] leading-[1.75] text-ink-2">{entry.a}</p>
            </details>
          ))}
        </div>
      </Block>

      {guides.length > 0 && (
        <Block id="guides" title="Guides that use this tool">
          <ul className="grid gap-3 sm:grid-cols-2">
            {guides.map((a) => (
              <li key={`${a.topic}/${a.slug}`}>
                <Link
                  to={articlePath(a)}
                  className="group block h-full rounded-[14px] border border-hairline p-4 transition-colors hover:border-[color:var(--accent-text)] focus-visible:border-[color:var(--accent-text)]"
                >
                  <span className="block text-[14px] font-medium leading-[1.4] text-ink transition-colors group-hover:text-accent-text">
                    {a.heading}
                  </span>
                  <span className="mt-1.5 block text-[13px] leading-[1.5] text-ink-3">
                    {a.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {topics.length > 0 && (
        <Block id="further-reading" title="Further reading">
          <ul className="flex flex-wrap gap-2.5">
            {topics.map((t) => (
              <li key={t.slug}>
                <Link
                  to={topicPath(t)}
                  className="inline-flex rounded-full border border-hairline px-4 py-2 text-[13px] text-ink-2 transition-colors hover:border-[color:var(--accent-text)] hover:text-accent-text focus-visible:border-[color:var(--accent-text)]"
                >
                  {t.name}
                </Link>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {related.length > 0 && (
        <Block id="related-tools" title="Related tools">
          <ul className="grid gap-3 sm:grid-cols-3">
            {related.map((t) => (
              <li key={t.id}>
                <Link
                  to={t.href}
                  className="group block h-full rounded-[14px] border border-hairline p-4 transition-colors hover:border-[color:var(--accent-text)] focus-visible:border-[color:var(--accent-text)]"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="text-[14px] font-medium text-ink transition-colors group-hover:text-accent-text">
                      {t.name}
                    </span>
                  </span>
                  <span className="mt-1.5 block text-[13px] leading-[1.5] text-ink-3">
                    {t.blurb}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <p className="mt-10 font-mono text-[10px] uppercase leading-[1.6] tracking-[0.12em] text-ink-3">
        Educational tool · not financial advice ·{' '}
        <Link to="/help" className="hover:text-accent-text transition-colors">
          Help Centre
        </Link>{' '}
        ·{' '}
        <Link to="/faq" className="hover:text-accent-text transition-colors">
          FAQ
        </Link>{' '}
        ·{' '}
        <Link to="/terms" className="hover:text-accent-text transition-colors">
          Terms
        </Link>
      </p>
    </div>
  );
}
