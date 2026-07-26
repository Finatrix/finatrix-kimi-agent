#!/usr/bin/env python3
"""
Regenerate the FinatriX favicon set.

WHY A RESPONSIVE SET RATHER THAN ONE IMAGE
------------------------------------------
The FinatriX logo is nine glyph-bearing tiles around a gold core. That reads
beautifully as an app icon and rasterises badly as a favicon: at 16x16 each tile
is about three pixels across, so the glyphs inside them cannot resolve and a
straight downscale returns coloured mush.

The set is therefore split at 64px, the threshold below which the glyphs stop
resolving — but BOTH halves are the same mark:

  >= 64px  the full artwork, unchanged   apple-touch-icon, android-chrome-*
  <  64px  the vector reconstruction     favicon.ico, favicon-16, favicon-32

public/favicon.svg is a vector rebuild of the same composition — tile positions
and colours measured from the source PNG — with the per-tile glyphs omitted,
since they are unresolvable at tab sizes anyway. What survives is what makes the
mark recognisable at a glance: the 3x3 grid, the outward offset of the middle
tiles, the gold quadrant core and its white node. Rendering that as vector is
sharper at 16px than any downscale of the raster, and it is still the logo
rather than a substitute for it.

DEPENDENCIES
------------
Dev-only, deliberately not in package.json — this runs when the brand changes,
not on every build, and the outputs are committed:

    pip install pillow cairosvg

USAGE
-----
    python3 scripts/generate-favicons.py

Outputs land in public/. Re-run after editing public/favicon.svg or
public/images/finatrix-logo.png, then commit the results.
"""

from pathlib import Path
import io
import sys

try:
    from PIL import Image
    import cairosvg
except ImportError:
    sys.exit("Missing dependencies. Run:  pip install pillow cairosvg")

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
MARK_SVG = PUBLIC / "favicon.svg"
FULL_LOGO = PUBLIC / "images" / "finatrix-logo.png"

# Sampled from the logo; the maskable icon's padding is filled with it so the
# safe-zone inset is invisible rather than a black band.
BRAND_BG = (0x28, 0x28, 0x27, 0xFF)

# Below this, the nine-tile logo stops resolving and the simplified mark is used.
SIMPLIFY_BELOW_PX = 64

# Sizes emitted for the in-app <img> (components/BrandLogo.tsx), which selects
# between them with srcset. Both are >= SIMPLIFY_BELOW_PX, so both carry the
# full artwork. Keep in sync with BRAND_LOGO_SIZES there.
DISPLAY_LOGO_SIZES = (64, 192)


def render_mark(size: int) -> Image.Image:
    """Rasterise the vector mark (public/favicon.svg) at `size` px, square."""
    png = cairosvg.svg2png(
        url=str(MARK_SVG), output_width=size, output_height=size,
        background_color=None,
    )
    return Image.open(io.BytesIO(png)).convert("RGBA")


def render_logo(size: int) -> Image.Image:
    """Downscale the full logo to `size` px with high-quality resampling."""
    return Image.open(FULL_LOGO).convert("RGBA").resize((size, size), Image.LANCZOS)


def render_maskable(size: int) -> Image.Image:
    """
    Android maskable icon: the platform crops to an arbitrary shape (circle,
    squircle, teardrop), so the artwork must sit inside the inner 80% "safe
    zone" or its edges get sliced off. Scale the logo to 80% and pad with the
    brand background rather than transparency, which would show as a halo.
    """
    inner = round(size * 0.8)
    canvas = Image.new("RGBA", (size, size), BRAND_BG)
    art = Image.open(FULL_LOGO).convert("RGBA").resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(art, (offset, offset), art)
    return canvas


def main() -> None:
    for required in (MARK_SVG, FULL_LOGO):
        if not required.exists():
            sys.exit(f"Missing source: {required}")

    written = []

    # ── small sizes: the simplified mark ───────────────────────────────────
    for size in (16, 32):
        out = PUBLIC / f"favicon-{size}x{size}.png"
        render_mark(size).save(out, "PNG", optimize=True)
        written.append(out)

    # favicon.ico carries 16/32/48 in one file. Legacy surfaces reach for it
    # without asking (IE-era pinned tiles, RSS readers, some crawlers), and a
    # missing /favicon.ico is a 404 on nearly every page load.
    ico = PUBLIC / "favicon.ico"
    render_mark(48).save(
        ico, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)],
    )
    written.append(ico)

    # ── large sizes: the full logo, unchanged ──────────────────────────────
    for size, name in ((180, "apple-touch-icon.png"),
                       (192, "android-chrome-192x192.png"),
                       (512, "android-chrome-512x512.png")):
        assert size >= SIMPLIFY_BELOW_PX
        out = PUBLIC / name
        img = render_logo(size)
        # iOS ignores transparency and composites onto white, which would put a
        # white ring around the dark artwork. Flatten onto the brand field.
        if name == "apple-touch-icon.png":
            flat = Image.new("RGBA", img.size, BRAND_BG)
            flat.paste(img, (0, 0), img)
            img = flat.convert("RGB")
        img.save(out, "PNG", optimize=True)
        written.append(out)

    out = PUBLIC / "android-chrome-maskable-512x512.png"
    render_maskable(512).save(out, "PNG", optimize=True)
    written.append(out)

    # ── display logo: an in-app <img>, not an OS icon ──────────────────────
    # BrandLogo draws the mark at 22-52 CSS px in the landing nav and hero, the
    # tools and careers shells, and onboarding — the critical path of every page
    # in the app. It used to point straight at the 1520x1520 source, so every
    # first visit transferred ~182 kB and decoded 2.3 megapixels to paint a 26px
    # square. That single image was heavier than the React chunk and a third of
    # the entire landing critical path.
    #
    # Two sizes, picked by the browser through `srcset`: 64 serves the small
    # uses at 1x and 2x, 192 covers the 52px hero at 3x. Both are the full
    # artwork — well above the 64px threshold where the glyphs stop resolving,
    # so nothing is simplified.
    for size in DISPLAY_LOGO_SIZES:
        out = PUBLIC / "images" / f"finatrix-logo-{size}.png"
        render_logo(size).save(out, "PNG", optimize=True)
        written.append(out)

    for path in written:
        kb = path.stat().st_size / 1024
        with Image.open(path) as im:
            print(f"  {path.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}  {kb:.1f} kB")


if __name__ == "__main__":
    main()
