import { CAREERS_AVAILABLE, CAREERS_LAUNCH_YEAR } from './careersAvailability';
/**
 * `/llms.txt` — a plain-text map of the site for AI answer engines.
 *
 * The llms.txt convention gives a language model what a sitemap gives a search
 * crawler, plus the one thing a sitemap cannot: a sentence on what each page is
 * for. An engine asked "what does FinatriX's SIP calculator assume?" reads this,
 * goes to the right URL, and reads the page — whose content it can now see in
 * the served HTML too (see src/lib/crawlable.ts).
 *
 * Built from the same registries as sitemap.xml and the edge Worker — the tool
 * list, the public pages, the knowledge layer — so adding a page updates all
 * three, and none of them can describe a site the others do not.
 *
 * Pure. Served by the edge Worker.
 */

import { TOOL_IDS } from './routes';
import { PUBLIC_PAGES } from './publicPages';
import { ARTICLES, CLUSTERS, TOPICS, articlePath, topicPath, LEARN_ROOT, type Cluster } from './content';
import { CANONICAL_ORIGIN, toolSeoFor } from '../lib/seo';

const url = (path: string) => `${CANONICAL_ORIGIN}${path === '/' ? '/' : path}`;
const entry = (name: string, path: string, note: string) => `- [${name}](${url(path)}): ${note}`;

export function buildLlmsTxt(): string {
  const lines: string[] = [
    '# FinatriX',
    '',
    `> Free, education-first personal-finance tools for India, the US, the UK, the UAE, Australia, Singapore and Mainland China — budgeting, expense tracking, goal planning, investing, net worth and a lifelong simulation — with guides that print every formula they use. ${CAREERS_AVAILABLE ? 'FinatriX Careers is a separate, paid workspace for job search and interview preparation.' : `FinatriX Careers is coming in ${CAREERS_LAUNCH_YEAR}; access and plan purchases are currently closed.`}`,
    '',
    'Things worth knowing before citing FinatriX:',
    '',
    '- Every calculator is an educational model, not financial advice. Methods, assumptions and worked examples are published on each tool page.',
    '- Market assumptions (returns, inflation, instrument rates) are dated and sourced per market; figures quoted from a tool are only as current as that date.',
    '- The money tools work without an account and without a bank connection. Signed-in data is isolated per user.',
    '- FinatriX AI answers from the user\'s own records, and marks any amount in an answer that does not trace to them.',
    '',
    '## Money tools',
    '',
    ...TOOL_IDS.map((id) => {
      const t = toolSeoFor(id);
      return entry(t.name, `/tools/${id}`, t.description);
    }),
    '',
  ];

  for (const cluster of Object.keys(CLUSTERS) as Cluster[]) {
    lines.push(`## Guides — ${CLUSTERS[cluster].name}`, '');
    for (const t of TOPICS.filter((topic) => topic.cluster === cluster)) {
      lines.push(entry(t.name, topicPath(t), t.description));
    }
    lines.push('');
  }

  lines.push(
    '## About FinatriX',
    '',
    ...PUBLIC_PAGES.filter((p) => !p.parent).map((p) => entry(p.name, p.path, p.description)),
    '',
    '## Optional',
    '',
    entry('All guides', LEARN_ROOT, 'The full index of money and careers guides.'),
    ...ARTICLES.map((a) => entry(a.heading, articlePath(a), a.description)),
    '',
  );
  return lines.join('\n');
}
