/**
 * Icon-set integrity.
 *
 * Favicons fail in a uniquely quiet way: a wrong path is a 404 nobody watches,
 * a wrong `sizes` attribute is believed by the browser rather than the file, and
 * a stale cache entry means the person who shipped the change is often the last
 * to see it. None of it breaks a build.
 *
 * Two real defects motivated these assertions. The manifest declared
 * `/images/finatrix-logo.png` as `512x512` when the file is 1520x1520, and
 * marked it `purpose: "any maskable"` although it has no safe-zone padding — so
 * Android both mis-scaled it and cropped the outer tiles off. And every icon
 * slot pointed at that same 1520px nine-tile logo, which the browser then
 * downscaled to an illegible smudge at 16x16.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const PUBLIC = join(ROOT, 'public');

/**
 * The subset of the Web App Manifest this file asserts against.
 *
 * `JSON.parse` returns `any`, and an `any[]` passed to `it.each` resolves
 * Vitest's *spread* overload — `(...args: any[] | [any])` — rather than the
 * single-case one, so a destructured callback stops type-checking. Naming the
 * shape here fixes the inference at the source instead of loosening the
 * callback, and gives the assertions real field types to check.
 */
interface ManifestIcon {
  src: string;
  sizes: string;
  type?: string;
  purpose?: string;
}
interface WebAppManifest {
  icons?: ManifestIcon[];
}

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const headers = readFileSync(join(PUBLIC, '_headers'), 'utf8');
const manifest = JSON.parse(
  readFileSync(join(PUBLIC, 'manifest.webmanifest'), 'utf8'),
) as WebAppManifest;
const manifestIcons: ManifestIcon[] = manifest.icons ?? [];

/**
 * The dark-theme surface colour, read from the no-flash boot script in
 * index.html — the one place that decides what the browser chrome is painted
 * before first paint.
 */
const DARK_SURFACE = /\?\s*'#F4F2EC'\s*:\s*'(#[0-9A-Fa-f]{6})'/.exec(html)?.[1] ?? '';

describe('theme colour', () => {
  // The manifest's theme_color paints the Android status bar and the PWA splash
  // screen. It said #0A0A0A while the app's actual dark surface is #060607, so
  // an installed app opened with a status bar and splash in a near-black that
  // matches nothing on screen, then visibly settled onto the real background.
  // Two hex values four points apart is precisely the kind of drift no reviewer
  // catches by eye and no build flags.
  it('is the same in the manifest as the app paints', () => {
    expect(DARK_SURFACE, 'could not read the dark surface from index.html').toMatch(/^#[0-9A-Fa-f]{6}$/);
    const manifestFull = JSON.parse(
      readFileSync(join(PUBLIC, 'manifest.webmanifest'), 'utf8'),
    ) as WebAppManifest & { theme_color?: string; background_color?: string };
    expect(manifestFull.theme_color?.toUpperCase()).toBe(DARK_SURFACE.toUpperCase());
    expect(manifestFull.background_color?.toUpperCase()).toBe(DARK_SURFACE.toUpperCase());
  });

  it('matches the static theme-color meta the browser reads first', () => {
    const meta = /<meta name="theme-color" content="(#[0-9A-Fa-f]{6})"/.exec(html)?.[1];
    expect(meta?.toUpperCase()).toBe(DARK_SURFACE.toUpperCase());
  });
});

/** `/favicon.ico?v=2` → `/favicon.ico` */
const stripVersion = (href: string) => href.split('?')[0];
/** `/favicon.ico?v=2` → `2`, or '' when unversioned. */
const versionOf = (href: string) => /[?&]v=([^&]+)/.exec(href)?.[1] ?? '';

/** Icon hrefs declared by <link rel="...icon..."> / mask-icon in index.html. */
const htmlIconHrefs = [...html.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon|mask-icon)"[^>]*>/g)]
  .map((m) => /href="([^"]+)"/.exec(m[0])?.[1] ?? '')
  .filter(Boolean);

const manifestIconSrcs: string[] = manifestIcons.map((i) => i.src);

/** Width/height from a PNG's IHDR chunk — no image library needed. */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(join(PUBLIC, file));
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** The sizes embedded in an .ico directory. `0` in the header means 256. */
function icoSizes(file: string): number[] {
  const buf = readFileSync(join(PUBLIC, file));
  const count = buf.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => buf.readUInt8(6 + i * 16) || 256).sort((a, b) => a - b);
}

describe('favicon set: every declared icon exists', () => {
  it('index.html declares the full modern set', () => {
    expect(htmlIconHrefs.length).toBeGreaterThanOrEqual(5);
  });

  it.each([...new Set([...htmlIconHrefs, ...manifestIconSrcs])])('%s exists in public/', (href) => {
    expect(existsSync(join(PUBLIC, stripVersion(href)))).toBe(true);
  });

  it('favicon.ico embeds 16, 32 and 48', () => {
    // Legacy surfaces request /favicon.ico by path without reading the HTML, so
    // it must exist and must carry the small sizes rather than one large frame.
    expect(icoSizes('favicon.ico')).toEqual([16, 32, 48]);
  });
});

describe('favicon set: declared dimensions match the actual files', () => {
  const sized: ManifestIcon[] = manifestIcons.filter((i) => i.sizes !== 'any');

  it('the manifest declares at least one 192 and one 512 icon', () => {
    const all = sized.map((i) => i.sizes);
    expect(all).toContain('192x192');
    expect(all).toContain('512x512');
  });

  // Param types are inferred from ManifestIcon — annotating them here would
  // re-trigger the overload ambiguity this file's interface exists to avoid.
  it.each(sized)('$src really is $sizes', ({ src, sizes }) => {
    const [w, h] = sizes.split('x').map(Number);
    expect(pngSize(stripVersion(src))).toEqual({ width: w, height: h });
  });

  it.each([
    ['favicon-16x16.png', 16],
    ['favicon-32x32.png', 32],
    ['apple-touch-icon.png', 180],
  ])('%s is %ipx square', (file, px) => {
    expect(pngSize(file)).toEqual({ width: px, height: px });
  });
});

describe('favicon set: maskable safety', () => {
  it('ships a dedicated maskable icon rather than reusing an unpadded one', () => {
    // Android crops maskable icons to an arbitrary shape. Declaring an
    // unpadded icon "maskable" is what sliced the outer tiles off the logo.
    const maskable = manifestIcons
      .filter((i) => i.purpose?.split(/\s+/).includes('maskable'));
    expect(maskable).toHaveLength(1);
    expect(maskable[0].src).toContain('maskable');
    expect(maskable[0].purpose).toBe('maskable');
  });
});

describe('favicon set: no stale references', () => {
  it('no icon slot points at the full-resolution logo', () => {
    // The source artwork stays in public/images for use elsewhere on the site;
    // it is simply never an icon, because 1520px cannot downscale to 16px.
    for (const href of [...htmlIconHrefs, ...manifestIconSrcs]) {
      expect(href).not.toContain('/images/finatrix-logo.png');
    }
  });

  it('index.html references no icon file that is absent from public/', () => {
    const missing = htmlIconHrefs.filter((h) => !existsSync(join(PUBLIC, stripVersion(h))));
    expect(missing).toEqual([]);
  });
});

describe('favicon set: cache correctness', () => {
  it('every versioned reference uses the same token', () => {
    const tokens = new Set(
      [...htmlIconHrefs, ...manifestIconSrcs].map(versionOf).filter(Boolean),
    );
    // A split token means half the browsers get the new icon and half do not.
    expect(tokens.size).toBe(1);
  });

  it('every icon carries a cache-busting token', () => {
    for (const href of [...htmlIconHrefs, ...manifestIconSrcs]) {
      expect(versionOf(href), `${href} has no ?v= token`).not.toBe('');
    }
  });

  it.each([...new Set([...htmlIconHrefs, ...manifestIconSrcs].map(stripVersion))])(
    '%s has an explicit Cache-Control rule in _headers',
    (path) => {
      // Without a rule these inherit the document default and are re-fetched on
      // every navigation; with `immutable` they would never update at all.
      expect(headers).toContain(`\n${path}\n`);
    },
  );

  it('icons are cacheable but revalidated, never immutable', () => {
    // Parse _headers into path → directives. Splitting on blank lines would
    // fold the surrounding comments into a rule and match words inside prose.
    const rules = new Map<string, string[]>();
    let current = '';
    for (const raw of headers.split('\n')) {
      if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
      if (raw.startsWith('/')) { current = raw.trim(); rules.set(current, []); continue; }
      if (current) rules.get(current)!.push(raw.trim());
    }

    const iconPaths = [...rules.keys()]
      .filter((p) => /^\/(favicon|apple-touch|android-chrome|mask-icon)/.test(p));
    expect(iconPaths.length).toBeGreaterThan(0);

    for (const path of iconPaths) {
      const cacheControl = rules.get(path)!.find((h) => /^Cache-Control:/i.test(h)) ?? '';
      expect(cacheControl, `${path} has no Cache-Control`).not.toBe('');
      expect(cacheControl, `${path} must revalidate`).toContain('must-revalidate');
      // `immutable` on a fixed filename strands a stale icon until a hard refresh.
      expect(cacheControl, `${path} must not be immutable`).not.toContain('immutable');
    }
  });
});

/**
 * The in-app logo, which is a different problem from the icon set above.
 *
 * `BrandLogo` renders on the landing nav and hero, the tools and careers
 * shells, and onboarding — the critical path of effectively every page. It
 * pointed straight at `/images/finatrix-logo.png`: 1520x1520 and ~182 kB,
 * painted at 22-52 CSS px. That is a bigger transfer than the React chunk and
 * roughly a third of the entire landing critical path, spent on one nav icon,
 * plus 2.3 megapixels of decode to fill a 26px square.
 *
 * The failure mode is silent — it looks perfect and merely costs every visitor
 * — so these assertions pin the fix rather than trusting it to survive the next
 * brand refresh.
 */
describe('in-app brand logo stays off the critical path', () => {
  // Comments are stripped before matching: the file's own docstring explains
  // why it must not reference the full-size source, and quotes the path to do
  // so. Matching prose about the rule as a breach of it is how a guard like
  // this ends up being deleted rather than fixed.
  const source = readFileSync(join(ROOT, 'src/components/BrandLogo.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');

  it('never points at the full-resolution source', () => {
    // The generator's input and the JSON-LD Organization logo, not a browser asset.
    expect(source).not.toMatch(/["'`]\/images\/finatrix-logo\.png/);
  });

  it('ships every width it advertises in srcset', () => {
    const widths = [...source.matchAll(/finatrix-logo-(\d+)\.png/g)].map((m) => Number(m[1]));
    expect(widths.length, 'BrandLogo should reference pre-scaled variants').toBeGreaterThan(0);

    for (const w of [...new Set(widths)]) {
      const file = join(PUBLIC, 'images', `finatrix-logo-${w}.png`);
      expect(existsSync(file), `missing /images/finatrix-logo-${w}.png`).toBe(true);
      // The declared width must be the real one, or the browser's srcset
      // arithmetic picks the wrong file for the wrong density.
      expect(pngSize(join('images', `finatrix-logo-${w}.png`))).toEqual({ width: w, height: w });
    }
  });

  it('keeps each variant small enough to be free on first paint', () => {
    const widths = [...new Set(
      [...source.matchAll(/finatrix-logo-(\d+)\.png/g)].map((m) => Number(m[1])),
    )];
    for (const w of widths) {
      const kb = readFileSync(join(PUBLIC, 'images', `finatrix-logo-${w}.png`)).length / 1024;
      // Generous headroom over the current 5 kB / 16 kB; this is a guard against
      // a full-size asset being dropped back in, not a byte-level budget.
      expect(kb, `finatrix-logo-${w}.png is ${kb.toFixed(1)} kB`).toBeLessThan(40);
    }
  });
});

/**
 * App shortcuts — the long-press menu on an installed FinatriX icon.
 *
 * Two ways for these to rot silently: a URL that no longer routes (Android
 * shows the entry, the tap lands on a 404) and an icon slot pointing at a file
 * that was never shipped. Both are invisible until someone installs the app.
 */
describe('manifest shortcuts', () => {
  interface Shortcut { name?: string; short_name?: string; url?: string; icons?: ManifestIcon[] }
  const shortcuts = ((manifest as unknown as { shortcuts?: Shortcut[] }).shortcuts) ?? [];

  it('declares the actions worth a long-press, and no more', () => {
    expect(shortcuts.length).toBeGreaterThan(0);
    // Android surfaces at most four; more is silently truncated, which makes
    // the order — and the cap — a real product decision rather than an accident.
    expect(shortcuts.length).toBeLessThanOrEqual(4);
  });

  it('points every shortcut at a route the app really serves', async () => {
    const { isKnownRoute } = await import('../shared/routes');
    for (const s of shortcuts) {
      expect(s.url, 'a shortcut must declare a url').toBeTruthy();
      const path = (s.url as string).split('?')[0];
      expect(isKnownRoute(path), `shortcut "${s.name}" points at ${path}`).toBe(true);
    }
  });

  it('names every shortcut, within the length a launcher will show', () => {
    for (const s of shortcuts) {
      expect(s.name?.trim()).toBeTruthy();
      // short_name is what a launcher actually renders; long ones get elided.
      expect((s.short_name ?? s.name ?? '').length).toBeLessThanOrEqual(12);
    }
  });

  it('ships every icon a shortcut declares, at the size it claims', () => {
    for (const s of shortcuts) {
      for (const icon of s.icons ?? []) {
        const rel = icon.src.split('?')[0].replace(/^\//, '');
        expect(existsSync(join(PUBLIC, rel)), `missing ${icon.src}`).toBe(true);
        const [w, h] = (icon.sizes ?? '').split('x').map(Number);
        expect(pngSize(rel)).toEqual({ width: w, height: h });
      }
    }
  });
});
