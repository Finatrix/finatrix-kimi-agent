"""
Generate the FinatriX iOS app icon and launch/splash art from the brand artwork.

WHY GENERATED, NOT EXPORTED BY HAND
-----------------------------------
The same reasoning as scripts/generate-android-assets.py, which this deliberately
mirrors: one brand source, every derived file regenerated from it, so a brand
change is one re-run instead of a hunt for the file somebody re-cropped. Both
scripts read public/images/finatrix-logo.png and both measure the artwork's tile
cluster from the pixels rather than assuming a crop, so the mark lands at the same
optical size on an iPhone home screen as on an Android one.

WHAT IT WRITES
--------------
    ios/App/App/Assets.xcassets/AppIcon.appiconset/
        AppIcon-1024.png          Any Appearance. Opaque, square, no alpha —
                                  Apple rejects an icon with an alpha channel,
                                  and masks the corners itself, so pre-rounding
                                  it would show a halo.
        AppIcon-Dark-1024.png     iOS 18 dark variant: the mark on transparency,
                                  which the system composites on its own dark
                                  material.
        AppIcon-Tinted-1024.png   iOS 18 tinted variant: greyscale + alpha. The
                                  system applies the user's chosen hue, so any
                                  colour here would fight it.

    ios/App/App/Assets.xcassets/Splash.imageset/
        splash-2732.png (@1x/@2x/@3x reference the same file)

WHY THE SPLASH IS ONE BIG SQUARE
--------------------------------
Both the static launch screen (Base.lproj/LaunchScreen.storyboard) and
@capacitor/splash-screen draw this image with `scaleAspectFill`. A square canvas
of flat brand charcoal with the mark centred means aspect-fill only ever crops
BACKGROUND — the mark is never stretched, cropped or letterboxed, on any iPhone
aspect ratio from the SE to the Pro Max. That is also why the two use the same
image: the hand-off from the OS launch screen to the app's own splash is then
invisible rather than a jump.

DEPENDENCIES
------------
Dev-only, like the Android script — outputs are committed:

    pip install pillow numpy

USAGE
-----
    python3 scripts/generate-ios-assets.py
"""

from pathlib import Path
import json
import sys

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit("Missing dependencies. Run:  pip install pillow numpy")

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public/images/finatrix-logo.png"
ASSETS = ROOT / "ios/App/App/Assets.xcassets"

ICON_PX = 1024
# The cluster's share of the icon canvas. Apple masks the icon to a squircle that
# keeps far more of the square than Android's circular mask does, so the mark can
# sit larger here than in the 108dp adaptive layer without its corner tiles being
# clipped — 0.62 puts them just inside the squircle's tightest radius.
ICON_CLUSTER = 0.62

SPLASH_PX = 2732
# Chosen so aspect-fill renders the mark at roughly the 160dp the Android splash
# uses, across the iPhone screen heights this app supports (see the module note).
SPLASH_CLUSTER = 0.19
# The app's dark surface, from src/styles/tokens.css — NOT the artwork's own
# slightly lighter charcoal, which the icon keeps. It has to be this value because
# it is what `SplashScreen.backgroundColor` in capacitor.config.ts and the launch
# screen's own background are set to; a different shade here would show as a seam
# at the moment the OS launch screen hands over to the app's splash.
#
# Fixed rather than appearance-aware on purpose. Android's OS launch screen
# follows the system light/dark setting while the Capacitor splash that replaces
# it does not, so a light-mode Android launch goes cream then charcoal. Pinning
# both iOS surfaces to the dark brand charcoal — which is also the app's default
# theme — trades theme-matching for a launch with no visible seam in it.
SPLASH_BG = (0x06, 0x06, 0x07)


def load_source():
    """The artwork, its background colour, and the cluster's bounding box.

    Identical measurement to the Android script: the background is sampled from a
    corner pixel and anything meaningfully different from it is artwork, so the
    crop follows the art rather than a hard-coded rectangle.
    """
    img = Image.open(SOURCE).convert("RGB")
    arr = np.asarray(img).astype(int)
    bg = tuple(int(c) for c in arr[5, 5])
    mask = np.abs(arr - np.array(bg)).sum(axis=2) > 30
    ys, xs = np.where(mask)
    return img, bg, (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)


def cluster(img, bg, box, size_px, share, transparent=False, canvas_bg=None):
    """The artwork's cluster centred on a `size_px` square canvas.

    `bg` is the artwork's own background — what gets keyed out for a transparent
    layer. `canvas_bg` overrides what the canvas is FILLED with, which the splash
    needs (see SPLASH_BG) and the icon does not.
    """
    crop = img.crop(box)
    target = round(size_px * share)
    scale = target / max(crop.size)
    crop = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS)
    fill = canvas_bg or bg
    canvas = Image.new("RGBA", (size_px, size_px), (*fill, 0 if transparent else 255))
    if transparent or canvas_bg:
        # Key the charcoal out, keeping anti-aliased edges as partial alpha, so
        # the mark composites cleanly on whatever the system puts behind it.
        a = np.asarray(crop.convert("RGB")).astype(float)
        dist = np.abs(a - np.array(bg)).sum(axis=2)
        alpha = np.clip(dist / 60.0, 0, 1) * 255
        crop = Image.fromarray(np.dstack([a, alpha]).astype(np.uint8), "RGBA")
    canvas.alpha_composite(
        crop.convert("RGBA"), ((size_px - crop.width) // 2, (size_px - crop.height) // 2)
    )
    return canvas


def greyscale_alpha(rgba):
    """Luminance as alpha, white as colour — the shape only.

    A tinted icon is recoloured by the system from the user's chosen hue, so it
    must carry brightness and nothing else. Using luminance as the alpha keeps the
    mark's interior detail instead of flattening it to a silhouette.
    """
    arr = np.asarray(rgba).astype(float)
    lum = arr[..., 0] * 0.2126 + arr[..., 1] * 0.7152 + arr[..., 2] * 0.0722
    alpha = np.clip(lum / 255.0, 0, 1) * (arr[..., 3] / 255.0) * 255
    white = np.full(arr.shape[:2] + (3,), 255.0)
    return Image.fromarray(np.dstack([white, alpha]).astype(np.uint8), "RGBA")


def write(path: Path, image: Image.Image, opaque=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Apple rejects an app icon that has an alpha channel at all, even a fully
    # opaque one — flatten rather than trusting the mode.
    image.convert("RGB" if opaque else "RGBA").save(path, "PNG", optimize=True)
    print(f"  {path.relative_to(ROOT)}  ({image.width}x{image.height})")


def stale(directory: Path, keep: set):
    """Delete art the regenerated Contents.json no longer references.

    Capacitor's template ships its own placeholder icon and splash. Leaving them
    behind would put files in the catalog that nothing points at — dead weight in
    the app bundle and a warning in Xcode.
    """
    for f in sorted(directory.glob("*.png")):
        if f.name not in keep:
            f.unlink()
            print(f"  removed {f.relative_to(ROOT)}")


def main():
    if not SOURCE.exists():
        sys.exit(f"Brand artwork not found: {SOURCE}")
    img, bg, box = load_source()
    print(f"Source {SOURCE.name}: background #{'%02X%02X%02X' % bg}, cluster {box}")

    icons = ASSETS / "AppIcon.appiconset"
    print("App icon:")
    write(icons / "AppIcon-1024.png", cluster(img, bg, box, ICON_PX, ICON_CLUSTER), opaque=True)
    dark = cluster(img, bg, box, ICON_PX, ICON_CLUSTER, transparent=True)
    write(icons / "AppIcon-Dark-1024.png", dark)
    write(icons / "AppIcon-Tinted-1024.png", greyscale_alpha(dark))

    entry = lambda extra: {"idiom": "universal", "platform": "ios", "size": "1024x1024", **extra}
    (icons / "Contents.json").write_text(json.dumps({
        "images": [
            entry({"filename": "AppIcon-1024.png"}),
            entry({"filename": "AppIcon-Dark-1024.png",
                   "appearances": [{"appearance": "luminosity", "value": "dark"}]}),
            entry({"filename": "AppIcon-Tinted-1024.png",
                   "appearances": [{"appearance": "luminosity", "value": "tinted"}]}),
        ],
        "info": {"author": "xcode", "version": 1},
    }, indent=2) + "\n")
    print(f"  {(icons / 'Contents.json').relative_to(ROOT)}")
    stale(icons, {"AppIcon-1024.png", "AppIcon-Dark-1024.png", "AppIcon-Tinted-1024.png"})

    splash = ASSETS / "Splash.imageset"
    print("Splash:")
    name = f"splash-{SPLASH_PX}.png"
    write(
        splash / name,
        cluster(img, bg, box, SPLASH_PX, SPLASH_CLUSTER, canvas_bg=SPLASH_BG),
        opaque=True,
    )
    # One file for all three scales: the image is far larger than any screen, so a
    # separate @2x/@3x would be the same pixels resampled twice.
    (splash / "Contents.json").write_text(json.dumps({
        "images": [{"idiom": "universal", "filename": name, "scale": f"{s}x"} for s in (1, 2, 3)],
        "info": {"author": "xcode", "version": 1},
    }, indent=2) + "\n")
    print(f"  {(splash / 'Contents.json').relative_to(ROOT)}")
    stale(splash, {name})


if __name__ == "__main__":
    main()
