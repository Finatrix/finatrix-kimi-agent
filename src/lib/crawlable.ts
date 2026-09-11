/**
 * The page, in the bytes a crawler receives.
 *
 * Every URL is served the same SPA shell: a `<head>` the edge Worker rewrites
 * per route, and a body that is `<div id="root"></div>` until JavaScript runs.
 * Google renders JavaScript and sees the page. Much of what else reads the web
 * does not — Bing's first pass, every AI answer engine's crawler (GPTBot,
 * ClaudeBot, PerplexityBot), feed readers, archivers, and a reader with
 * JavaScript off. To all of them each of the ~145 indexable URLs was a title, a
 * description and an empty body: no heading, no text, and not one link to
 * follow to the rest of the site.
 *
 * This builds the route's real content — its heading, lede, FAQ, a tool's
 * method and worked example, a guide's full body — as plain semantic HTML, for
 * the Worker to place inside the shell's `<noscript>`. That element is exactly
 * "content for a client that does not run scripts": a browser running
 * JavaScript never renders it, so there is no flash, no layout shift and no
 * second copy on screen; a client that does not run JavaScript parses it as
 * ordinary markup. And it is the same content the React page renders, from the
 * same registries, so what a crawler reads is what a reader sees.
 *
 * Imported by the edge Worker (and tests) only — never by the browser bundle.
 * Pure; every string that reaches the markup is escaped here.
 */

import { escapeHtml } from './sanitize';
import { seoForPath, toolSeoFor, NOINDEX } from './seo';
import { TOOL_IDS, type ToolId } from '../shared/routes';
import { PUBLIC_PAGES, publicPageFor, type FaqEntry } from '../shared/publicPages';
import { TOOL_FAQ } from '../shared/toolFaq';
import { TOOL_GUIDES } from '../shared/toolGuides';
import {
  CLUSTERS, LEARN_ROOT, TOPICS, articleFor, articlePath, articlesInTopic,
  articlesUsingTool, topicFor, topicPath, type Cluster,
} from '../shared/content';
import type { Block, TopicContent } from '../content/types';

const esc = escapeHtml;

/** The tiny inline syntax article prose uses: `[label](/path)` and `**bold**`. */
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

function inline(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    out += esc(text.slice(last, m.index));
    const [, label, href, bold] = m;
    if (bold !== undefined) out += `<strong>${esc(bold)}</strong>`;
    else if (href.startsWith('/') || href.startsWith('https://')) out += `<a href="${esc(href)}">${esc(label)}</a>`;
    else out += esc(label);
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

const link = (href: string, label: string) => `<a href="${esc(href)}">${esc(label)}</a>`;

function faqHtml(faq: readonly FaqEntry[] | undefined, heading = 'Frequently asked questions'): string {
  if (!faq?.length) return '';
  return `<section><h2>${esc(heading)}</h2>${faq
    .map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section>`;
}

function blockHtml(b: Block): string {
  switch (b.kind) {
    case 'p': return `<p>${inline(b.text)}</p>`;
    case 'h3': return `<h3>${inline(b.text)}</h3>`;
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      return `<${tag}>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${tag}>`;
    }
    case 'note':
    case 'warning':
      return `<aside><strong>${esc(b.title)}</strong> ${inline(b.text)}</aside>`;
    case 'table':
      return `<table><caption>${esc(b.caption)}</caption><thead><tr>${b.head
        .map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${b.rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${
        b.note ? `<p>${inline(b.note)}</p>` : ''}`;
    case 'formula':
      return `<p><strong>${esc(b.label)}:</strong> <code>${esc(b.expression)}</code></p><ul>${b.where
        .map((w) => `<li>${inline(w)}</li>`).join('')}</ul>`;
    case 'worked':
      return `<h4>${esc(b.title)}</h4><dl>${b.rows
        .map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join('')}</dl><p>${inline(b.conclusion)}</p>`;
    case 'tool':
      return `<p>${link(`/tools/${b.toolId}`, toolSeoFor(b.toolId).name)}: ${inline(b.text)}</p>`;
  }
}

/* ── Per-route content ── */

function landing(): string {
  const tools = TOOL_IDS.map((id) => {
    const t = toolSeoFor(id);
    return `<li>${link(`/tools/${id}`, t.name)} — ${esc(t.description)}</li>`;
  }).join('');
  const pillars = TOPICS.filter((t) => t.pillar)
    .map((t) => `<li>${link(topicPath(t), t.name)} — ${esc(t.description)}</li>`).join('');
  return `<h1>See where your money goes. Decide what comes next.</h1>
<p>Bring your budget, spending and goals into one dashboard. Review the month, spot repeat payments and compare plans before you commit. Free money tools for India, the US, the UK and the UAE — no account needed to start.</p>
<section><h2>Free money tools</h2><ul>${tools}</ul></section>
<section><h2>Guides, with every formula shown</h2><ul>${pillars}</ul><p>${link(LEARN_ROOT, 'Browse every guide')}</p></section>
<section><h2>FinatriX Careers</h2><p>A separate, paid workspace for job search, résumés and interview preparation. ${link('/careers', 'See FinatriX Careers')}.</p></section>`;
}

function tool(id: ToolId): string {
  const seo = toolSeoFor(id);
  const guide = TOOL_GUIDES[id];
  const guides = articlesUsingTool(id).slice(0, 6)
    .map((a) => `<li>${link(articlePath(a), a.heading)}</li>`).join('');
  return `<h1>${esc(seo.name)}</h1>
<p>${esc(seo.description)}</p>
<p>${inline(guide.purpose)}</p>
<section><h2>How to use it</h2><ol>${guide.steps.map((s) => `<li>${inline(s)}</li>`).join('')}</ol></section>
<section><h2>How it is calculated</h2>${guide.method.map((m) => `<p>${inline(m)}</p>`).join('')}</section>
<section><h2>A worked example</h2>${blockHtml({ kind: 'worked', ...guide.worked })}</section>
<section><h2>Common mistakes</h2><ul>${guide.mistakes.map((m) => `<li>${inline(m)}</li>`).join('')}</ul></section>
<section><h2>What it assumes</h2><ul>${guide.limits.map((m) => `<li>${inline(m)}</li>`).join('')}</ul></section>
${faqHtml(TOOL_FAQ[id])}
<section><h2>Related tools</h2><ul>${guide.related
    .map((r) => `<li>${link(`/tools/${r}`, toolSeoFor(r).name)}</li>`).join('')}</ul></section>
${guides ? `<section><h2>Guides that use it</h2><ul>${guides}</ul></section>` : ''}`;
}

function learnHub(): string {
  const byCluster = (Object.keys(CLUSTERS) as Cluster[]).map((c) => {
    const topics = TOPICS.filter((t) => t.cluster === c)
      .map((t) => `<li>${link(topicPath(t), t.name)} — ${esc(t.description)}</li>`).join('');
    return `<section><h2>${esc(CLUSTERS[c].name)}</h2><p>${esc(CLUSTERS[c].blurb)}</p><ul>${topics}</ul></section>`;
  }).join('');
  return `<h1>Learn</h1><p>${esc(seoForPath(LEARN_ROOT).description)}</p>${byCluster}`;
}

function topic(slug: string, copy: TopicContent | null): string {
  const t = topicFor(slug)!;
  const articles = articlesInTopic(slug)
    .map((a) => `<li>${link(articlePath(a), a.heading)} — ${esc(a.description)}</li>`).join('');
  const intro = copy?.topic.intro.map((p) => `<p>${inline(p)}</p>`).join('') ?? '';
  const terms = copy?.topic.definitions.length
    ? `<section><h2>Key terms</h2><dl>${copy.topic.definitions
      .map((d) => `<dt>${esc(d.term)}</dt><dd>${inline(d.definition)}</dd>`).join('')}</dl></section>`
    : '';
  return `<h1>${esc(t.heading)}</h1><p>${esc(t.lede)}</p>${intro}${terms}
<section><h2>Guides in this topic</h2><ul>${articles}</ul></section>${faqHtml(copy?.topic.faq)}`;
}

function article(topicSlug: string, slug: string, copy: TopicContent | null): string {
  const a = articleFor(topicSlug, slug)!;
  const t = topicFor(topicSlug)!;
  const body = copy?.articles[slug];
  const related = (a.related ?? [])
    .map((key) => {
      const [ts, as] = key.split('/');
      const r = articleFor(ts, as);
      return r ? `<li>${link(articlePath(r), r.heading)}</li>` : '';
    }).join('');
  return `<p>${link(topicPath(t), t.name)}</p>
<h1>${esc(a.heading)}</h1>
<p>${esc(a.description)}</p>
${body ? `<p><strong>The short answer:</strong> ${inline(body.summary)}</p>
<section><h2>Key points</h2><ul>${body.keyPoints.map((k) => `<li>${inline(k)}</li>`).join('')}</ul></section>
${body.sections.map((s) => `<section><h2 id="${esc(s.id)}">${esc(s.title)}</h2>${s.blocks.map(blockHtml).join('')}</section>`).join('')}
${faqHtml(body.faq)}
${body.sources?.length ? `<section><h2>Sources</h2><ul>${body.sources.map((s) => `<li>${link(s.url, s.label)}</li>`).join('')}</ul></section>` : ''}` : ''}
${related ? `<section><h2>Read next</h2><ul>${related}</ul></section>` : ''}
<p>Published ${esc(a.published)} · Updated ${esc(a.updated)}</p>`;
}

function publicPage(path: string): string {
  const page = publicPageFor(path)!;
  const parent = page.parent ? publicPageFor(page.parent) : null;
  return `${parent ? `<p>${link(parent.path, parent.name)}</p>` : ''}
<h1>${esc(page.heading ?? page.name)}</h1>
${page.lede ? `<p>${esc(page.lede)}</p>` : ''}
<p>${esc(page.description)}</p>
${faqHtml(page.faq)}`;
}

/** Any other indexable URL: what its head already says, in the body. */
function fallback(path: string): string {
  const seo = seoForPath(path);
  return `<h1>${esc(seo.title.replace(/\s+[|—-]\s+FinatriX$/, ''))}</h1><p>${esc(seo.description)}</p>`;
}

/** Links to every section of the site, so a crawler can reach them all from any page. */
function siteNav(): string {
  const tools = TOOL_IDS.map((id) => `<li>${link(`/tools/${id}`, toolSeoFor(id).name)}</li>`).join('');
  const pages = PUBLIC_PAGES.filter((p) => !p.parent && p.path !== '/careers/compare')
    .map((p) => `<li>${link(p.path, p.name)}</li>`).join('');
  return `<nav aria-label="FinatriX"><h2>FinatriX</h2><ul><li>${link('/', 'Home')}</li><li>${link(LEARN_ROOT, 'Learn')}</li>${pages}</ul>
<h2>Money tools</h2><ul>${tools}</ul></nav>`;
}

const WRAPPER = 'max-width:720px;margin:6vh auto;padding:0 24px;font-family:system-ui,sans-serif;line-height:1.6;color:#F5F5F0;background:#060607';

/**
 * The `<noscript>` contents for `pathname`, or null when the route is not
 * indexable — a private page keeps the shell's plain "needs JavaScript" notice,
 * and gains nothing a crawler should read.
 */
export function crawlableBodyFor(pathname: string, copy: TopicContent | null): string | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (seoForPath(path).robots === NOINDEX) return null;

  let main: string;
  const learn = path.split('/').filter(Boolean);
  const toolMatch = path.match(/^\/tools\/([^/]+)$/);
  if (path === '/' || path === '/home') main = landing();
  else if (toolMatch && (TOOL_IDS as readonly string[]).includes(toolMatch[1])) main = tool(toolMatch[1] as ToolId);
  else if (path === LEARN_ROOT) main = learnHub();
  else if (learn[0] === 'learn' && learn.length === 2 && topicFor(learn[1])) main = topic(learn[1], copy);
  else if (learn[0] === 'learn' && learn.length === 3 && articleFor(learn[1], learn[2])) main = article(learn[1], learn[2], copy);
  else if (publicPageFor(path)) main = publicPage(path);
  else main = fallback(path);

  return `<div style="${WRAPPER}"><main>${main}</main>
<p><em>FinatriX runs its interactive tools in the browser. Enable JavaScript and reload to use them.</em></p>
${siteNav()}</div>`;
}
