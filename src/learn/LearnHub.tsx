/**
 * `/learn` — the entry point to the knowledge layer.
 *
 * A hub page earns its place only if it helps someone choose; a grid of links
 * with no orientation is a sitemap with styling. So each topic card carries the
 * topic's own lede and its article count, and the two clusters are introduced
 * rather than merely labelled.
 */

import { Link } from 'react-router';
import PageShell from '../marketing/PageShell';
import { Section } from '../marketing/ui';
import { TOOLS } from '../lib/tools';
import {
  CLUSTERS,
  TOPICS,
  articlesInTopic,
  topicPath,
  type Cluster,
  type Topic,
} from '../shared/content';

function TopicCard({ topic }: { topic: Topic }) {
  const count = articlesInTopic(topic.slug).length;
  return (
    <li>
      <Link
        to={topicPath(topic)}
        className="group flex h-full flex-col rounded-[16px] border border-hairline p-5 transition-colors hover:border-[color:var(--accent-text)] focus-visible:border-[color:var(--accent-text)]"
      >
        <span className="text-[16px] font-semibold tracking-[-0.01em] text-ink transition-colors group-hover:text-accent-text">
          {topic.name}
        </span>
        <span className="mt-2 flex-1 text-[14px] leading-[1.65] text-ink-2">{topic.lede}</span>
        <span className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
          {count} {count === 1 ? 'guide' : 'guides'}
        </span>
      </Link>
    </li>
  );
}

function ClusterSection({ cluster }: { cluster: Cluster }) {
  const topics = TOPICS.filter((t) => t.cluster === cluster);
  if (!topics.length) return null;
  const meta = CLUSTERS[cluster];
  return (
    <Section id={`cluster-${cluster}`} title={meta.name} intro={meta.blurb}>
      <ul
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))' }}
      >
        {topics.map((t) => (
          <TopicCard key={t.slug} topic={t} />
        ))}
      </ul>
    </Section>
  );
}

export default function LearnHub() {
  return (
    <PageShell
      heading="Learn"
      name="Learn"
      lede="Guides to money and careers, written against what the calculators on this site actually compute — with the formulas and the assumptions shown, so you can check every number."
      updated="2026-08-01"
    >
      <Section id="how-to-read" title="How these guides are written">
        <p className="max-w-[68ch] text-[15px] leading-[1.75] text-ink-2">
          Every figure in a guide is arithmetic you can redo from the inputs on the same page. Where
          a guide describes a calculation, it is the calculation the tool runs — the formulas are
          printed rather than summarised, and the assumed rates are the ones in the code. Nothing
          here is financial advice, and no specific fund, bank or product is ever recommended.
        </p>
      </Section>

      <ClusterSection cluster="money" />
      <ClusterSection cluster="careers" />

      <Section
        id="tools"
        title="The calculators behind the guides"
        intro="Every guide points at the tool that does its arithmetic. All seven are free, work signed out, and keep your figures in your own browser until you choose to sync them."
      >
        <ul className="flex flex-wrap gap-2.5">
          {TOOLS.map((tool) => (
            <li key={tool.id}>
              <Link
                to={tool.href}
                className="inline-flex rounded-full border border-hairline px-4 py-2 text-[13px] text-ink-2 transition-colors hover:border-[color:var(--accent-text)] hover:text-accent-text focus-visible:border-[color:var(--accent-text)]"
              >
                {tool.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </PageShell>
  );
}
