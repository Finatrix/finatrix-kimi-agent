/**
 * The two registries added in Phase 2 — money-tool comparisons and company
 * intelligence — carry the same structural risks the content layer does, so
 * they get the same structural guarantees.
 *
 * Three of these tests exist because of specific, plausible failures rather
 * than for symmetry:
 *
 *   • the sector→reading map is the ONE place a company page's related guides
 *     are declared. A renamed article would silently break the strip on four
 *     pages at once, and nothing on the page would look wrong;
 *   • the cross-link strips are derived, which is only an advantage if the
 *     derivation actually produces a fully connected set — a filter that
 *     accidentally excluded everything would render nothing and throw nothing;
 *   • the editorial promises on these pages ("no prices", "no deadlines") are
 *     the reason they can be published at all, and a promise nothing enforces
 *     is a promise that erodes. The last suite checks the data, not the prose.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALTERNATIVES,
  COMPARE_ROOT,
  alternativeFor,
  alternativePath,
  otherAlternatives,
} from '../shared/comparisons';
import { ALTERNATIVE_COPY, OUR_SIDE, alternativeCopyFor } from '../content/comparisons';
import {
  COMPANIES,
  COMPANIES_ROOT,
  SECTORS,
  companiesInSector,
  companyFor,
  companyPath,
  peersOf,
  readingForCompany,
  type Sector,
} from '../shared/companies';
import { COMPANY_CAVEAT, COMPANY_COPY, companyCopyFor } from '../content/companies';
import { LEARN_ROOT, articleFor, contentLinkFor } from '../shared/content';
import { PUBLIC_PAGE_PATHS, publicPageFor } from '../shared/publicPages';
import { isKnownRoute } from '../shared/routes';
import { CANONICAL_ORIGIN, seoForPath, structuredDataForPath } from '../lib/seo';

const APP_TSX = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');

describe('money-tool comparisons', () => {
  it('has unique slugs and resolves them', () => {
    const slugs = ALTERNATIVES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const a of ALTERNATIVES) {
      expect(alternativeFor(a.slug), a.slug).toBe(a);
      expect(a.slug, `${a.slug} must be url-safe`).toMatch(/^[a-z0-9-]+$/);
    }
    expect(alternativeFor('not-a-product')).toBeNull();
    expect(alternativeFor(undefined)).toBeNull();
  });

  it('registers a public page for the hub and every alternative', () => {
    expect(publicPageFor(COMPARE_ROOT), COMPARE_ROOT).not.toBeNull();
    for (const a of ALTERNATIVES) {
      const path = alternativePath(a);
      expect(publicPageFor(path), path).not.toBeNull();
      expect(publicPageFor(path)!.parent, `${path} parent`).toBe(COMPARE_ROOT);
      expect(isKnownRoute(path), path).toBe(true);
      expect(seoForPath(path).robots, path).toBe('index, follow');
      expect(seoForPath(path).canonical, path).toBe(`${CANONICAL_ORIGIN}${path}`);
    }
    expect(APP_TSX).toContain('path="/compare"');
    expect(APP_TSX).toContain('path="/compare/:alternative"');
  });

  /**
   * The section every comparison page leads with. If it were ever empty the
   * page would be an advertisement wearing a comparison's clothes, which is
   * precisely what the editorial rule at the top of the registry forbids.
   */
  it('names at least two genuine strengths and two limits for every alternative', () => {
    for (const a of ALTERNATIVES) {
      const copy = alternativeCopyFor(a.slug)!;
      expect(copy, `${a.slug} has no copy`).toBeTruthy();
      expect(copy.theirStrengths.length, `${a.slug} theirStrengths`).toBeGreaterThanOrEqual(2);
      expect(copy.theirLimits.length, `${a.slug} theirLimits`).toBeGreaterThanOrEqual(2);
      expect(copy.ourStrengths.length, `${a.slug} ourStrengths`).toBeGreaterThanOrEqual(2);
      for (const s of [...copy.theirStrengths, ...copy.theirLimits, ...copy.ourStrengths]) {
        expect(s.length, `${a.slug}: "${s}"`).toBeGreaterThan(30);
      }
      expect(copy.verdict.length, `${a.slug} verdict`).toBeGreaterThan(60);
      expect(copy.bestFor.them.length, `${a.slug} bestFor.them`).toBeGreaterThan(20);
      expect(copy.bestFor.us.length, `${a.slug} bestFor.us`).toBeGreaterThan(20);
    }
  });

  /**
   * The no-prices rule, enforced on the data rather than trusted to review.
   * A currency figure in any of these fields is the exact claim that goes stale
   * and that we promise on the hub page not to make.
   */
  it('quotes no price anywhere in the comparison copy', () => {
    const price = /(?:₹|\$|£|€)\s?\d|\b\d+(?:\.\d+)?\s?(?:usd|inr|aud|gbp|eur)\b|\bper month\b\s*[:-]?\s*[\d₹$£€]/i;
    for (const a of ALTERNATIVES) {
      const c = ALTERNATIVE_COPY[a.slug];
      const text = [
        a.category,
        c.pricingModel,
        c.dataModel,
        c.verdict,
        c.bestFor.them,
        c.bestFor.us,
        ...c.theirStrengths,
        ...c.theirLimits,
        ...c.ourStrengths,
      ];
      for (const line of text) {
        expect(price.test(line), `${a.slug} quotes a price: "${line}"`).toBe(false);
      }
    }
  });

  it('links every alternative to a checkable source', () => {
    for (const a of ALTERNATIVES) {
      expect(a.site, `${a.slug} site`).toMatch(/^https:\/\//);
    }
  });

  /** The cross-link strip is derived; this is what proves the derivation connects everything. */
  it('cross-links every comparison to every other one', () => {
    for (const a of ALTERNATIVES) {
      const others = otherAlternatives(a.slug);
      expect(others.length, `${a.slug} peers`).toBe(ALTERNATIVES.length - 1);
      expect(others.map((o) => o.slug), `${a.slug} links to itself`).not.toContain(a.slug);
      for (const o of others) {
        expect(publicPageFor(alternativePath(o)), `${a.slug} → ${o.slug}`).not.toBeNull();
      }
    }
  });

  it('states the FinatriX limitation once, and substantially', () => {
    expect(OUR_SIDE.limitation.length).toBeGreaterThan(120);
    expect(OUR_SIDE.limitation.toLowerCase()).toContain('bank feed');
  });
});

describe('company intelligence', () => {
  it('has unique slugs and resolves them', () => {
    const slugs = COMPANIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of COMPANIES) {
      expect(companyFor(c.slug), c.slug).toBe(c);
      expect(c.slug, `${c.slug} must be url-safe`).toMatch(/^[a-z0-9-]+$/);
      expect(SECTORS[c.sector], `${c.slug} sector`).toBeTruthy();
    }
    expect(companyFor('not-a-company')).toBeNull();
    expect(companyFor(undefined)).toBeNull();
  });

  it('registers a public page for the hub and every company', () => {
    expect(publicPageFor(COMPANIES_ROOT), COMPANIES_ROOT).not.toBeNull();
    for (const c of COMPANIES) {
      const path = companyPath(c);
      expect(publicPageFor(path), path).not.toBeNull();
      expect(publicPageFor(path)!.parent, `${path} parent`).toBe(COMPANIES_ROOT);
      expect(isKnownRoute(path), path).toBe(true);
      expect(seoForPath(path).robots, path).toBe('index, follow');
      expect(seoForPath(path).canonical, path).toBe(`${CANONICAL_ORIGIN}${path}`);
    }
    expect(APP_TSX).toContain('path="/companies"');
    expect(APP_TSX).toContain('path="/companies/:company"');
  });

  /**
   * A company page with an empty section renders a heading over nothing, which
   * is the thin-content failure the whole registry approach exists to prevent.
   */
  it('fills every section on every company page', () => {
    for (const c of COMPANIES) {
      const copy = companyCopyFor(c.slug)!;
      expect(copy, `${c.slug} has no copy`).toBeTruthy();
      expect(c.overview.length, `${c.slug} overview`).toBeGreaterThan(80);
      expect(copy.businessAreas.length, `${c.slug} businessAreas`).toBeGreaterThanOrEqual(3);
      expect(copy.graduatePrograms.length, `${c.slug} graduatePrograms`).toBeGreaterThanOrEqual(3);
      expect(copy.hiringProcess.length, `${c.slug} hiringProcess`).toBeGreaterThanOrEqual(3);
      expect(copy.careerPaths.length, `${c.slug} careerPaths`).toBeGreaterThanOrEqual(3);
      expect(copy.interviewPrep.length, `${c.slug} interviewPrep`).toBeGreaterThanOrEqual(3);
      for (const line of [
        ...copy.businessAreas,
        ...copy.graduatePrograms,
        ...copy.hiringProcess,
        ...copy.careerPaths,
        ...copy.interviewPrep,
      ]) {
        expect(line.length, `${c.slug}: "${line}"`).toBeGreaterThan(30);
      }
      expect(c.careersSite, `${c.slug} careersSite`).toMatch(/^https:\/\//);
    }
  });

  /**
   * The sector→reading map is the single declaration of which guides a company
   * page recommends. A renamed article would break four pages silently.
   */
  it('resolves every derived reading link to a real, indexable guide', () => {
    for (const c of COMPANIES) {
      const reading = readingForCompany(c);
      expect(reading.length, `${c.slug} has no reading`).toBeGreaterThanOrEqual(3);
      for (const key of reading) {
        const [topic, slug] = key.split('/');
        expect(articleFor(topic, slug), `${c.slug} → ${key} is not a registered article`)
          .not.toBeNull();
        const path = `${LEARN_ROOT}/${key}`;
        expect(contentLinkFor(path), `${c.slug} → ${path}`).not.toBeNull();
        expect(seoForPath(path).robots, `${c.slug} → ${path} is noindex`).toBe('index, follow');
      }
    }
  });

  it('cross-links every company to its sector peers', () => {
    for (const c of COMPANIES) {
      const peers = peersOf(c);
      expect(peers.map((p) => p.slug), `${c.slug} links to itself`).not.toContain(c.slug);
      for (const p of peers) {
        expect(p.sector, `${c.slug} peer ${p.slug} is a different sector`).toBe(c.sector);
        expect(publicPageFor(companyPath(p)), `${c.slug} → ${p.slug}`).not.toBeNull();
      }
    }
  });

  it('populates every declared sector', () => {
    for (const sector of Object.keys(SECTORS) as Sector[]) {
      expect(companiesInSector(sector).length, `${sector} is empty`).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * The claims these pages promise NOT to make. A structured page about a named
   * employer reads as authoritative, so the guardrail has to be mechanical.
   */
  it('publishes no salary figures, headcounts or dated deadlines', () => {
    const forbidden = [
      { label: 'a currency figure', re: /(?:₹|\$|£|€|A\$)\s?\d/ },
      { label: 'a headcount', re: /\b\d[\d,]*\s?(?:\+|k)?\s?(?:employees|staff|people|headcount)\b/i },
      { label: 'a month deadline', re: /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i },
      { label: 'a calendar year', re: /\b(?:19|20)\d{2}\b/ },
    ];
    for (const c of COMPANIES) {
      const cc = COMPANY_COPY[c.slug];
      const lines = [
        c.overview,
        ...cc.businessAreas,
        ...cc.graduatePrograms,
        ...cc.hiringProcess,
        ...cc.careerPaths,
        ...cc.interviewPrep,
      ];
      for (const text of lines) {
        for (const { label, re } of forbidden) {
          expect(re.test(text), `${c.slug} contains ${label}: "${text}"`).toBe(false);
        }
      }
    }
  });

  it('states the caveat once, and names what the pages are not', () => {
    expect(COMPANY_CAVEAT.length).toBeGreaterThan(200);
    for (const phrase of ['no relationship', 'careers site']) {
      expect(COMPANY_CAVEAT.toLowerCase(), `caveat must mention "${phrase}"`).toContain(phrase);
    }
  });
});

describe('both surfaces, as public pages', () => {
  const NEW_PATHS = [
    COMPARE_ROOT,
    ...ALTERNATIVES.map(alternativePath),
    COMPANIES_ROOT,
    ...COMPANIES.map(companyPath),
  ];

  it('is in the public-page path list exactly once each', () => {
    for (const p of NEW_PATHS) {
      expect(PUBLIC_PAGE_PATHS.filter((x) => x === p).length, p).toBe(1);
    }
  });

  it('gives every new page a unique title and description within SERP limits', () => {
    const titles = new Map<string, string>();
    const descriptions = new Map<string, string>();
    for (const p of NEW_PATHS) {
      const { title, description } = seoForPath(p);
      expect(title.length, `${p} title (${title.length})`).toBeLessThanOrEqual(70);
      expect(title, `${p} must be brand-attributed`).toMatch(/FinatriX/);
      expect(description.length, `${p} description (${description.length})`).toBeLessThanOrEqual(165);
      expect(description.length, `${p} description too short`).toBeGreaterThan(50);
      expect(titles.has(title), `${p} duplicates the title of ${titles.get(title)}`).toBe(false);
      expect(
        descriptions.has(description),
        `${p} duplicates the description of ${descriptions.get(description)}`,
      ).toBe(false);
      titles.set(title, p);
      descriptions.set(description, p);
    }
  });

  it('emits a breadcrumb trail that mirrors the URL hierarchy', () => {
    for (const p of NEW_PATHS) {
      const graph = structuredDataForPath(p)!['@graph'] as Record<string, unknown>[];
      const crumbs = graph.find((n) => n['@type'] === 'BreadcrumbList')!
        .itemListElement as Array<Record<string, unknown>>;
      expect(crumbs[0].name, p).toBe('Home');
      // Depth: root pages are Home + self; child pages add their parent.
      const depth = p.split('/').filter(Boolean).length + 1;
      expect(crumbs.length, `${p} trail depth`).toBe(depth);
      // The final crumb is the page itself and carries no link.
      expect(crumbs.at(-1)!.item, `${p} last crumb must not self-link`).toBeUndefined();
    }
  });
});
