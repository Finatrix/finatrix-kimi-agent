/**
 * Official FinatriX logo mark.
 *
 * Used in the landing nav and hero, the tools and careers shells, and
 * onboarding — i.e. on the critical path of effectively every page.
 *
 * That is why it does NOT point at `/images/finatrix-logo.png`. The source is
 * 1520x1520 and ~182 kB, and this component renders it between 22 and 52 CSS
 * pixels, so every first visit was transferring more bytes for one nav icon
 * than for the entire React runtime, then decoding 2.3 megapixels to paint a
 * 26px square. The two pre-scaled variants below are generated from that same
 * source by `scripts/generate-favicons.py` (both at or above the 64px threshold
 * where the nine-tile artwork stops resolving, so neither is simplified).
 *
 * `srcset` + `sizes` hands the choice to the browser: at the common 22-26px
 * uses it fetches the 5 kB variant on 1x and 2x screens and only reaches for
 * the 16 kB one at 3x, or for the 52px hero. The full-resolution original stays
 * in the repo as the generator's input and as the Organization `logo` in the
 * index.html JSON-LD, where crawlers — not browsers — consume it.
 */

/** Widths emitted by scripts/generate-favicons.py. Keep in sync with DISPLAY_LOGO_SIZES there. */
export const BRAND_LOGO_SIZES = [64, 192] as const;

/** Fallback for browsers that ignore srcset; the larger variant, so it is never upscaled. */
export const FINATRIX_LOGO_SRC = '/images/finatrix-logo-192.png';

const SRCSET = BRAND_LOGO_SIZES.map((w) => `/images/finatrix-logo-${w}.png ${w}w`).join(', ');

export function BrandLogo({ size = 26, className = '', style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <img
      src={FINATRIX_LOGO_SRC}
      srcSet={SRCSET}
      // Tells the browser the real layout width so it can pick the smallest
      // variant that still covers this display density. Without it, srcset
      // defaults to assuming full viewport width and always picks the largest.
      sizes={`${size}px`}
      width={size}
      height={size}
      alt="FinatriX logo"
      loading="eager"
      decoding="async"
      className={className}
      style={{ borderRadius: Math.round(size * 0.24), display: 'block', objectFit: 'contain', ...style }}
    />
  );
}
