/**
 * Lazy access to a topic's editorial copy and article bodies — one chunk per
 * topic.
 *
 * The dynamic imports are written as literal entries rather than built from a
 * template string, because Vite can only code-split an import it can see
 * statically. A `() => import(\`./${slug}.ts\`)` would either bundle every topic
 * into the caller's chunk or fail to resolve at all — this shape gives one
 * chunk per topic, fetched only when that topic is opened.
 *
 * `content.test.ts` asserts this map covers exactly the topics in `TOPICS`, and
 * that each loaded module has copy for every article registered under it, so a
 * topic added to the registry and forgotten here fails a test rather than
 * rendering an empty page.
 */

import type { TopicContent } from './types';

type ContentLoader = () => Promise<{ default: TopicContent }>;

const LOADERS: Record<string, ContentLoader> = {
  /* ── Money ─────────────────────────────────────────────────────────────── */
  budgeting: () => import('./budgeting'),
  saving: () => import('./saving'),
  investing: () => import('./investing'),
  tax: () => import('./tax'),
  debt: () => import('./debt'),
  loans: () => import('./loans'),
  'credit-scores': () => import('./credit-scores'),
  insurance: () => import('./insurance'),
  retirement: () => import('./retirement'),
  'epf-nps': () => import('./epf-nps'),
  inflation: () => import('./inflation'),
  'behavioural-finance': () => import('./behavioural-finance'),
  'cash-flow': () => import('./cash-flow'),
  'net-worth': () => import('./net-worth'),
  'financial-independence': () => import('./financial-independence'),

  /* ── Careers ───────────────────────────────────────────────────────────── */
  resume: () => import('./resume'),
  ats: () => import('./ats'),
  'cover-letters': () => import('./cover-letters'),
  'interview-preparation': () => import('./interview-preparation'),
  'behavioural-interviews': () => import('./behavioural-interviews'),
  'technical-interviews': () => import('./technical-interviews'),
  'graduate-programs': () => import('./graduate-programs'),
  'banking-careers': () => import('./banking-careers'),
  'risk-compliance-careers': () => import('./risk-compliance-careers'),
  'aml-financial-crime': () => import('./aml-financial-crime'),
  'consulting-careers': () => import('./consulting-careers'),
  networking: () => import('./networking'),
  linkedin: () => import('./linkedin'),
  'assessment-centres': () => import('./assessment-centres'),
  'salary-negotiation': () => import('./salary-negotiation'),
  'international-students': () => import('./international-students'),
};

/** Topic slugs that have a content module. Used by the test that pairs them with `TOPICS`. */
export const TOPICS_WITH_CONTENT = Object.keys(LOADERS);

/**
 * Load a topic's copy and every article body in it. Resolves `null` for an
 * unknown topic rather than throwing, so the route can render its not-found
 * state instead of tripping the error boundary on a URL a visitor mistyped.
 */
export async function loadTopicContent(topicSlug: string): Promise<TopicContent | null> {
  const loader = LOADERS[topicSlug];
  if (!loader) return null;
  const mod = await loader();
  return mod.default;
}
