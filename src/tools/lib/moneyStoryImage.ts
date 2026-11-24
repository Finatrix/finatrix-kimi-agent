/**
 * Draws one story card to a canvas, so it can be shared as a picture.
 *
 * Canvas cannot read CSS `var()`: `ctx.fillStyle = 'var(--bg)'` is silently
 * ignored and paints the previous colour. Every colour is therefore resolved to
 * a literal first (`resolveStoryPalette`), against the element the user is
 * looking at — the tools tokens live on `.fx-tools`, not on <html>, and the
 * resolved value follows the active light or dark theme.
 */
import { downloadBlob } from '../../lib/download';
import type { StoryCard } from './moneyStory';

export const IMAGE_W = 1080;
export const IMAGE_H = 1350;

export interface StoryPalette {
  bg: string;
  panel: string;
  ink: string;
  ink2: string;
  accent: string;
  good: string;
  hair: string;
  font: string;
}

/** Dark-theme literals, for when no stylesheet can be read (jsdom). */
const FALLBACK: StoryPalette = {
  bg: '#0b0b0d',
  panel: '#151518',
  ink: '#f5f5f7',
  ink2: '#b4b4bb',
  accent: '#e0a526',
  good: '#34d27a',
  hair: '#2c2c31',
  font: 'system-ui, sans-serif',
};

const TOKENS: Record<Exclude<keyof StoryPalette, 'font'>, string> = {
  bg: '--bg',
  panel: '--card-solid',
  ink: '--ink',
  ink2: '--ink2',
  accent: '--gold',
  good: '--green',
  hair: '--hair',
};

/**
 * Resolve a token to the literal colour the browser computes for it. A probe
 * element carries `color: var(--token)`, so chained tokens, hsl() wrappers and
 * the active theme all collapse to a plain `rgb(…)` string.
 */
function resolveToken(scope: Element, token: string, fallback: string): string {
  if (typeof getComputedStyle !== 'function') return fallback;
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  probe.style.display = 'none';
  scope.appendChild(probe);
  try {
    const value = getComputedStyle(probe).color.trim();
    // An unresolved var() computes to '' (or the inherited ink); an empty or
    // transparent result means the token was not found.
    return value && value !== 'rgba(0, 0, 0, 0)' ? value : fallback;
  } finally {
    probe.remove();
  }
}

export function resolveStoryPalette(scope: Element | null): StoryPalette {
  if (!scope || typeof getComputedStyle !== 'function') return FALLBACK;
  const palette = { ...FALLBACK };
  (Object.keys(TOKENS) as Array<keyof typeof TOKENS>).forEach((k) => {
    palette[k] = resolveToken(scope, TOKENS[k], FALLBACK[k]);
  });
  const family = getComputedStyle(scope).fontFamily;
  if (family) palette.font = family;
  return palette;
}

/** Break `text` into lines no wider than `maxWidth` using the context's current font. */
export function wrapText(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
): number {
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

export function drawStoryCard(
  ctx: CanvasRenderingContext2D,
  card: StoryCard,
  p: StoryPalette,
  index: number,
  total: number,
): void {
  const pad = 96;
  const textW = IMAGE_W - pad * 2;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, IMAGE_W, IMAGE_H);

  // Accent bar and progress dots
  const accent = card.tone === 'good' ? p.good : p.accent;
  ctx.fillStyle = accent;
  ctx.fillRect(pad, 120, 96, 8);
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i === index ? accent : p.hair;
    ctx.beginPath();
    ctx.arc(IMAGE_W - pad - (total - 1 - i) * 36, 124, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Kicker
  ctx.fillStyle = p.ink2;
  ctx.font = `600 40px ${p.font}`;
  ctx.fillText(card.kicker.toUpperCase(), pad, 240);

  // Headline: shrink until it fits in at most four lines.
  let size = 112;
  let lines: string[] = [];
  for (; size >= 64; size -= 8) {
    ctx.font = `700 ${size}px ${p.font}`;
    lines = wrapText(ctx, card.headline, textW);
    if (lines.length <= 4) break;
  }
  ctx.fillStyle = p.ink;
  const afterHead = drawLines(ctx, lines, pad, 420, Math.round(size * 1.14));

  // Detail
  ctx.fillStyle = p.ink2;
  ctx.font = `500 48px ${p.font}`;
  drawLines(ctx, wrapText(ctx, card.detail, textW), pad, afterHead + 40, 68);

  // Footer
  ctx.fillStyle = p.hair;
  ctx.fillRect(pad, IMAGE_H - 200, textW, 2);
  ctx.fillStyle = p.accent;
  ctx.font = `700 44px ${p.font}`;
  ctx.fillText('FinatriX', pad, IMAGE_H - 120);
  ctx.fillStyle = p.ink2;
  ctx.font = `500 36px ${p.font}`;
  ctx.textAlign = 'right';
  ctx.fillText('finatrix.co', IMAGE_W - pad, IMAGE_H - 120);
  ctx.textAlign = 'left';
}

/** Render the card as a PNG, or null where canvas is unavailable. */
export async function renderStoryCard(
  card: StoryCard,
  palette: StoryPalette,
  index: number,
  total: number,
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = IMAGE_W;
  canvas.height = IMAGE_H;
  let ctx: CanvasRenderingContext2D | null = null;
  try { ctx = canvas.getContext('2d'); } catch { ctx = null; }
  if (!ctx) return null;
  drawStoryCard(ctx, card, palette, index, total);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export type StoryShareOutcome = 'shared' | 'saved' | 'cancelled' | 'failed';

/**
 * Hand the picture to the system share sheet when the browser can share files,
 * otherwise save it (the native app has its own save path in `downloadBlob`).
 */
export async function shareStoryImage(blob: Blob, filename: string, title: string): Promise<StoryShareOutcome> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title });
      return 'shared';
    }
  } catch (e) {
    const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
    if (/abort|cancel/i.test(msg)) return 'cancelled';
    // Anything else falls through to saving the file.
  }
  try {
    return (await downloadBlob(filename, blob)) ? 'saved' : 'failed';
  } catch {
    return 'failed';
  }
}
