#!/usr/bin/env python3
"""
Regenerate the FinatriX Open Graph / Twitter share cards.

WHY PER-PAGE CARDS
------------------
Every route was served ONE image — a 1200x630 canvas with the old wordmark JPEG
pasted in the middle, its original grey backdrop still visible as a box. So a
shared link to the Reverse Goal Planner unfurled in WhatsApp, Slack, X or
LinkedIn as an anonymous logo card that said nothing about what had been shared,
and the single most-seen brand surface off-site was a rescaled asset with a seam
down the middle of it.

These cards are drawn from the brand's own primitives instead: the real Geist
variable font the site ships, the design tokens in src/styles/tokens.css, and a
vector rebuild of the nine-tile mark from public/favicon.svg. Every card is the
same composition with different copy, so a row of them reads as one brand.

The copy is NOT duplicated here — titles and descriptions are read out of
src/lib/seo.ts at generation time, so a card can never disagree with the meta
description of the page it represents. Change the copy there and re-run.

DEPENDENCIES
------------
Dev-only, deliberately not in package.json — this runs when the brand or the
copy changes, not on every build, and the outputs are committed:

    pip install pillow fonttools brotli

USAGE
-----
    python3 scripts/generate-og-images.py

Outputs land in public/images/. Bump OG_VERSION in src/lib/seo.ts after any
visual change: unfurl caches (Facebook, X, WhatsApp) key on the URL and will
otherwise keep serving the previous card for months.
"""

from pathlib import Path
import io
import re
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
    from fontTools.ttLib import TTFont
except ImportError:
    sys.exit("Missing dependencies. Run:  pip install pillow fonttools brotli")

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "images"
IMAGES = ROOT / "public" / "images"
OG_DIR = IMAGES / "og"
GEIST = ROOT / "public" / "fonts" / "Geist-Variable.woff2"
SEO_TS = ROOT / "src" / "lib" / "seo.ts"
CONTENT_TS = ROOT / "src" / "shared" / "content.ts"

W, H = 1200, 630
SS = 2  # supersampling factor — everything is drawn at 2x and downsampled

# ── Brand tokens (src/styles/tokens.css, dark theme) ────────────────────────
BG = "#060607"          # --surface-base
INK = "#F5F5F0"         # --ink
INK_2 = "#9C9C96"       # --ink-2
INK_3 = "#6B6B70"       # muted
GOLD = "#D4AF37"        # --accent
GOLD_SOFT = "#F0D779"   # --accent-soft
HAIRLINE = "#1E1E20"

# The nine-tile mark, measured from public/favicon.svg on its 32-unit grid.
# (x, y, w, h, fill) — keep in step with that file and mask-icon.svg.
TILES = [
    (4.5, 4.5, 6, 6, "#00B894"), (21.5, 4.5, 6, 6, "#0984E3"),
    (4.5, 21.5, 6, 6, "#FA9C86"), (21.5, 21.5, 6, 6, "#B2BEC3"),
    (13.25, 3, 5.5, 7, "#0CEC90"), (13.25, 22, 5.5, 7, "#958DF8"),
    (2, 13.25, 7, 5.5, "#74DBBE"), (23, 13.25, 7, 5.5, "#59A7F6"),
]
CORE = [
    (11.5, 11.5, "#F1C40F"), (16, 11.5, "#F6CE76"),
    (11.5, 16, "#F4BA2D"), (16, 16, "#CD9A31"),
]


def geist(size: int, weight: str = "Regular") -> ImageFont.FreeTypeFont:
    """Load the shipped Geist variable font at a named weight.

    Geist ships as woff2 (what the browser wants) and FreeType cannot read woff2,
    so it is decompressed to an in-memory TTF. Using the site's real typeface
    rather than a system substitute is the whole point: a share card set in
    Helvetica is recognisably not the product it links to.
    """
    raw = TTFont(GEIST)
    raw.flavor = None
    buf = io.BytesIO()
    raw.save(buf)
    buf.seek(0)
    font = ImageFont.truetype(buf, size * SS)
    font.set_variation_by_name(weight)
    return font


def draw_mark(draw: ImageDraw.ImageDraw, x: float, y: float, size: float) -> None:
    """Draw the nine-tile FinatriX mark with its top-left corner at (x, y)."""
    u = size / 32.0  # one SVG unit in pixels

    def px(*vals):
        return [x + vals[0] * u, y + vals[1] * u, x + vals[2] * u, y + vals[3] * u]

    # Connectors first, so the tiles and core sit on top of them.
    for x1, y1, x2, y2 in [(16, 10, 16, 11.5), (16, 20.5, 16, 22), (9, 16, 11.5, 16), (20.5, 16, 23, 16)]:
        draw.line(px(x1, y1, x2, y2), fill="#7D7D7D", width=max(1, int(u)))

    for tx, ty, tw, th, fill in TILES:
        draw.rounded_rectangle(px(tx, ty, tx + tw, ty + th), radius=1.2 * u, fill=fill)

    for cx, cy, fill in CORE:
        draw.rectangle(px(cx, cy, cx + 4.5, cy + 4.5), fill=fill)
    draw.ellipse(px(14.3, 14.3, 17.7, 17.7), fill="#FFFFFF")


def wrap(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    """Greedy word wrap against measured pixel width."""
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=font) <= max_width * SS or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def card(eyebrow: str, title: str, subtitle: str) -> Image.Image:
    """One share card. Same composition for every page — only the copy changes."""
    img = Image.new("RGB", (W * SS, H * SS), BG)
    d = ImageDraw.Draw(img)

    # Gold rule across the top: the app's accent, and the one element that makes
    # a row of these cards read as a set at thumbnail size.
    d.rectangle([0, 0, W * SS, 6 * SS], fill=GOLD)

    margin = 80 * SS

    # ── Brand lockup: mark + wordmark, top-left ──
    draw_mark(d, margin, 74 * SS, 56 * SS)
    wordmark = geist(30, "SemiBold")
    wx = margin + 74 * SS
    d.text((wx, 88 * SS), "Finatri", font=wordmark, fill=INK)
    d.text((wx + d.textlength("Finatri", font=wordmark), 88 * SS), "X", font=wordmark, fill=GOLD)

    # ── Eyebrow: which surface of the product this page is ──
    eb = geist(19, "Medium")
    d.text((margin, 200 * SS), eyebrow.upper(), font=eb, fill=GOLD_SOFT)

    # ── Title ──
    title_font = geist(66, "Bold")
    lines = wrap(d, title, title_font, W - 160)
    if len(lines) > 2:  # long names get a smaller size rather than a third line
        title_font = geist(52, "Bold")
        lines = wrap(d, title, title_font, W - 160)[:2]
    y = 238 * SS
    for line in lines:
        d.text((margin, y), line, font=title_font, fill=INK)
        y += int(title_font.size * 1.16)

    # ── Subtitle ──
    sub_font = geist(27, "Regular")
    y += 14 * SS
    for line in wrap(d, subtitle, sub_font, W - 190)[:3]:
        d.text((margin, y), line, font=sub_font, fill=INK_2)
        y += int(sub_font.size * 1.42)

    # ── Footer: domain + the disclaimer that has to travel with the brand ──
    d.line([margin, H * SS - 92 * SS, W * SS - margin, H * SS - 92 * SS], fill=HAIRLINE, width=SS)
    foot = geist(21, "Medium")
    d.text((margin, H * SS - 68 * SS), "finatrix.co", font=foot, fill=GOLD)
    note = "Educational tools, not financial advice."
    note_font = geist(19, "Regular")
    d.text(
        (W * SS - margin - d.textlength(note, font=note_font), H * SS - 66 * SS),
        note, font=note_font, fill=INK_3,
    )

    return img.resize((W, H), Image.LANCZOS)


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # 4:4:4 chroma (subsampling=0): the default 4:2:0 smears gold text and the
    # coloured tiles against the near-black field into visible fringing.
    img.save(path, "JPEG", quality=90, optimize=True, subsampling=0, progressive=True)
    print(f"  {path.relative_to(ROOT)}  ({path.stat().st_size // 1024} KB)")


def parse_seo() -> tuple[dict[str, dict[str, str]], str, str]:
    """Read the tool copy and homepage defaults straight out of src/lib/seo.ts.

    Re-typing the copy here would create a second source of truth for the same
    sentences, and the failure mode is silent: a card that confidently describes
    a page differently from the page's own description tag.
    """
    src = SEO_TS.read_text()

    tools: dict[str, dict[str, str]] = {}
    block = re.search(r"const TOOL_SEO[^{]*\{(.*?)\n\};", src, re.S)
    if not block:
        sys.exit("could not locate TOOL_SEO in src/lib/seo.ts")
    for entry in re.finditer(
        r"(\w+):\s*\{\s*name:\s*'([^']*)',.*?description:\s*\n?\s*'(.*?)',\s*\n\s*category:\s*'([^']*)'",
        block.group(1), re.S,
    ):
        tools[entry.group(1)] = {
            "name": entry.group(2),
            "description": entry.group(3),
            "category": entry.group(4),
        }

    home_desc = re.search(r"DEFAULT_SOCIAL_DESCRIPTION =\s*\n?\s*'(.*?)';", src, re.S)
    legal = dict(re.findall(r"'/(privacy|terms)':\s*\{\s*title:\s*'([^']*)'", src))
    return tools, (home_desc.group(1) if home_desc else ""), legal


def parse_topics() -> list[dict[str, str]]:
    """Read the knowledge-layer topics out of src/shared/content.ts.

    Same reasoning as parse_seo: the card must not be able to describe a topic
    differently from the topic's own meta description, so the copy is read
    rather than re-typed. One card per TOPIC rather than per article — an
    article inherits its topic's card, which is accurate (the card names the
    topic and its description) and keeps sixty-odd near-identical JPEGs out of
    the repository.
    """
    src = CONTENT_TS.read_text()
    block = re.search(r"export const TOPICS: readonly Topic\[\] = \[(.*?)\n\];", src, re.S)
    if not block:
        sys.exit("could not locate TOPICS in src/shared/content.ts")

    topics: list[dict[str, str]] = []
    for entry in re.finditer(
        r"slug: '([^']+)',\s*\n\s*cluster: '([^']+)',\s*\n\s*name: '([^']*)',"
        r".*?description:\s*\n?\s*'(.*?)',\s*\n\s*heading:",
        block.group(1), re.S,
    ):
        topics.append({
            "slug": entry.group(1),
            "cluster": entry.group(2),
            "name": entry.group(3),
            "description": entry.group(4),
        })
    return topics


def main() -> None:
    tools, home_desc, legal = parse_seo()
    if not tools:
        sys.exit("parsed no tools out of seo.ts — refusing to write empty cards")
    topics = parse_topics()
    if not topics:
        sys.exit("parsed no topics out of content.ts — refusing to write empty cards")

    print("Generating share cards…")

    # The homepage / default card keeps its established filename so links shared
    # before this change still resolve.
    save(card("Smart money tools for India", "FinatriX", home_desc), IMAGES / "og-cover.jpg")

    for tool_id, meta in sorted(tools.items()):
        save(card(meta["category"], meta["name"], meta["description"]), OG_DIR / f"{tool_id}.jpg")

    for path, title in legal.items():
        name = title.split("|")[0].strip()
        save(card("Legal", name, "How FinatriX works, in plain language."), OG_DIR / f"{path}.jpg")

    # The knowledge layer: one card for the hub, one per topic. Articles inherit
    # their topic's card — see parse_topics.
    save(
        card(
            "Learn",
            "Money and career guides",
            "Every formula printed, every assumption stated, so you can check the numbers yourself.",
        ),
        OG_DIR / "learn.jpg",
    )
    for topic in topics:
        eyebrow = "Money" if topic["cluster"] == "money" else "Careers"
        save(
            card(eyebrow, topic["name"], topic["description"]),
            OG_DIR / f"learn-{topic['slug']}.jpg",
        )

    # The two comparison and intelligence hubs. Their child pages inherit these,
    # which is accurate — the card names the surface, not the individual page.
    save(
        card(
            "Compare",
            "FinatriX vs the alternatives",
            "How the free calculators compare with budgeting apps and spreadsheets — on price, privacy and purpose.",
        ),
        OG_DIR / "compare.jpg",
    )
    save(
        card(
            "Companies",
            "Company guides",
            "How major banks and professional-services firms are organised, and what shape their hiring takes.",
        ),
        OG_DIR / "companies.jpg",
    )

    total = 2 + len(tools) + len(legal) + 1 + len(topics) + 2
    print(f"\nDone — {total} cards. Bump OG_VERSION in src/lib/seo.ts.")


if __name__ == "__main__":
    main()
