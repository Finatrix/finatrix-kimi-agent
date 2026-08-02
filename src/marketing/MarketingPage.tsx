/**
 * The registry-driven wrapper around `PageShell` for the public marketing and
 * trust pages.
 *
 * Everything it needs about a page — title, lede, breadcrumb trail and the
 * "last reviewed" stamp — comes from the `PublicPage` registry entry, so the
 * visible page and its `<head>` metadata are the same source. The chrome itself
 * lives in `PageShell`, which the knowledge layer also renders inside; see the
 * note there for why there is one shell rather than two.
 */

import { useMemo, type ReactNode } from 'react';
import PageShell from './PageShell';
import { ancestorsOf } from '../lib/seo';
import { publicPageFor } from '../shared/publicPages';

export default function MarketingPage({
  path,
  children,
  /** Optional hero content rendered between the lede and the body. */
  hero,
  /** Set for pages whose own content supplies a wider layout (comparison tables). */
  wide = false,
}: {
  path: string;
  children: ReactNode;
  hero?: ReactNode;
  wide?: boolean;
}) {
  const page = publicPageFor(path);

  // `ancestorsOf` walks `parent` links and is stable for a given page, so it is
  // memoised on the entry rather than the path — recomputing it on every render
  // of a page whose registry entry cannot change is pure waste.
  const crumbs = useMemo(() => (page ? ancestorsOf(page) : []), [page]);

  // A route rendering a shell for a path that is not registered would ship a
  // page with no title, no canonical and no sitemap row. Failing loudly in
  // development is how that gets caught before it is deployed; `publicPages`
  // has a test asserting the router and the registry agree, so this is the
  // belt to that braces.
  if (!page) {
    throw new Error(
      `MarketingPage: "${path}" is not in PUBLIC_PAGES. Add it to src/shared/publicPages.ts.`,
    );
  }

  return (
    <PageShell
      heading={page.heading ?? page.name}
      name={page.name}
      lede={page.lede}
      crumbs={crumbs}
      updated={page.updated}
      hero={hero}
      wide={wide}
    >
      {children}
    </PageShell>
  );
}
