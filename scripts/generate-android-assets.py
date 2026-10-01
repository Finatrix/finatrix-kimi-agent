"""
Generate the FinatriX Android launcher icons, splash icon and Play Store
graphics from the brand artwork.

WHY GENERATED, NOT EXPORTED BY HAND
-----------------------------------
Android wants the same mark in ~25 files: an adaptive icon (separate
foreground, background and Android 13 "themed" monochrome layers) at five
densities, legacy square and round icons for Android 7, a splash icon, and the
512px Play Store icon and 1024x500 feature graphic. Hand-exported sets drift —
one density gets re-cropped, the round icon keeps an old colour — and nothing
catches it. This regenerates every file from the two brand sources the web
icons already use, so a brand change is one re-run.

GEOMETRY
--------
An adaptive icon is a 108dp square, but launchers mask it to as little as a
66dp circle (the "safe zone") and animate the layers in parallax. The source
artwork's tile cluster spans ~84% of its canvas, which in a 108dp layer would
have its corner tiles clipped on every circular launcher. The cluster is
therefore measured from the pixels, not assumed, and scaled so its bounding box
fills CLUSTER_DP of the 108dp canvas — inside the safe circle, with the corner
tiles' rounded corners grazing it. The background layer is the artwork's own
charcoal, sampled from the source, so the two layers are seamless.

DEPENDENCIES
------------
Dev-only, like scripts/generate-favicons.py — outputs are committed:

    pip install pillow numpy fonttools brotli

USAGE
-----
    python3 scripts/generate-android-assets.py
"""

from pathlib import Path
import io
import sys

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit("Missing dependencies. Run:  pip install pillow numpy fonttools brotli")

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public/images/finatrix-logo.png"
FONT = ROOT / "public/fonts/Geist-Variable.woff2"
RES = ROOT / "android/app/src/main/res"
STORE = ROOT / "android/store"

# Dp → px multipliers for the densities Android ships.
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

ADAPTIVE_DP = 108
# The tile cluster's bounding box inside the 108dp layer. 58dp puts the corner
# tiles' outer edges on the 66dp safe circle's diagonal less their rounding.
CLUSTER_DP = 58
LEGACY_DP = 48

GOLD = (212, 175, 55)
APP_BG_DARK = (6, 6, 7)


def load_source():
    img = Image.open(SOURCE).convert("RGB")
    arr = np.asarray(img).astype(int)
    bg = tuple(int(c) for c in arr[5, 5])
    # Anything meaningfully different from the charcoal is artwork.
    mask = np.abs(arr - np.array(bg)).sum(axis=2) > 30
    ys, xs = np.where(mask)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return img, bg, box


def cluster_layer(img, bg, box, size_px, cluster_px, transparent=False):
    """The artwork's cluster, centred on a `size_px` square."""
    crop = img.crop(box)
    scale = cluster_px / max(crop.size)
    crop = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (size_px, size_px), (*bg, 0 if transparent else 255))
    if transparent:
        # Key the charcoal out, keeping anti-aliased edges as partial alpha.
        a = np.asarray(crop.convert("RGB")).astype(float)
        dist = np.abs(a - np.array(bg)).sum(axis=2)
        alpha = np.clip(dist / 60.0, 0, 1) * 255
        rgba = np.dstack([a, alpha]).astype(np.uint8)
        crop = Image.fromarray(rgba, "RGBA")
    canvas.alpha_composite(crop.convert("RGBA"), ((size_px - crop.width) // 2, (size_px - crop.height) // 2))
    return canvas


def monochrome_layer(fg):
    """Android 13 themed icon: the cluster's silhouette in a single colour.
    The launcher tints it; only alpha matters."""
    alpha = fg.getchannel("A")
    out = Image.new("RGBA", fg.size, (255, 255, 255, 0))
    out.putalpha(alpha)
    return out


def rounded_mask(size, radius_ratio):
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * radius_ratio), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def circle_mask(size):
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def write_png(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)


def geist(size_px, weight=600):
    """Geist is self-hosted as a variable woff2; Pillow needs a static TTF."""
    font = TTFont(FONT)
    font.flavor = None
    buf = io.BytesIO()
    font.save(buf)
    buf.seek(0)
    f = ImageFont.truetype(buf, size_px)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def main():
    img, bg, box = load_source()

    for density, mult in DENSITIES.items():
        size = round(ADAPTIVE_DP * mult)
        cluster = round(CLUSTER_DP * mult)
        fg = cluster_layer(img, bg, box, size, cluster, transparent=True)
        write_png(fg, RES / f"mipmap-{density}/ic_launcher_foreground.png")
        write_png(monochrome_layer(fg), RES / f"mipmap-{density}/ic_launcher_monochrome.png")

        # Legacy (API < 26): a finished icon, not layers.
        legacy = round(LEGACY_DP * mult)
        full = cluster_layer(img, bg, box, legacy * 4, round(legacy * 4 * 0.74))
        full = full.resize((legacy, legacy), Image.LANCZOS)
        square = Image.new("RGBA", (legacy, legacy), (0, 0, 0, 0))
        square.paste(full, (0, 0), rounded_mask(legacy, 0.22))
        write_png(square, RES / f"mipmap-{density}/ic_launcher.png")
        round_icon = Image.new("RGBA", (legacy, legacy), (0, 0, 0, 0))
        round_icon.paste(full, (0, 0), circle_mask(legacy))
        write_png(round_icon, RES / f"mipmap-{density}/ic_launcher_round.png")

    # Adaptive background colour, shared by the splash icon's backdrop.
    (RES / "values").mkdir(parents=True, exist_ok=True)
    (RES / "values/ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">#{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}</color>\n'
        "</resources>\n"
    )

    # Play Store icon: 512x512, full square (Play applies its own mask).
    # Play's hi-res icon spec is a 32-bit PNG: RGBA, fully opaque (Play applies its own mask).
    write_png(cluster_layer(img, bg, box, 512, round(512 * 0.74)).convert("RGB").convert("RGBA"), STORE / "icon-512.png")

    # Feature graphic: 1024x500, shown above the listing. Mark left, wordmark
    # and one line of positioning right, on the app's own near-black with the
    # gold ambient glow the web hero uses.
    W, H = 1024, 500
    fgx = Image.new("RGB", (W, H), APP_BG_DARK)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((-120, -260, 700, 560), fill=(*GOLD, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    fgx = Image.alpha_composite(fgx.convert("RGBA"), glow)
    tile = cluster_layer(img, bg, box, 300, 222)
    tile_mask = rounded_mask(300, 0.22)
    fgx.paste(tile, (86, 100), tile_mask)
    d = ImageDraw.Draw(fgx)
    d.text((440, 150), "FinatriX", font=geist(92, 650), fill=(245, 245, 240))
    d.text((444, 270), "Budget, track and plan", font=geist(38, 450), fill=(200, 200, 192))
    d.text((444, 318), "your money in one place.", font=geist(38, 450), fill=(200, 200, 192))
    d.rounded_rectangle((444, 392, 444 + 64, 396), radius=2, fill=GOLD)
    write_png(fgx.convert("RGB"), STORE / "feature-graphic-1024x500.png")

    print(f"Android assets written (background #{bg[0]:02X}{bg[1]:02X}{bg[2]:02X}).")


if __name__ == "__main__":
    main()
