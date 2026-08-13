/**
 * PDF report primitives — the visual language every FinatriX export shares.
 *
 * jsPDF gives you a blank page and a text cursor; everything that makes a
 * document read like a financial report (a masthead, stat cards, charts, ruled
 * tables, page numbers) has to be composed. Keeping that composition here means
 * the Budget report and the Expense report are the same document with different
 * content, and a typography or spacing fix lands in both at once.
 *
 * Charts are drawn with primitives rather than rasterised from Chart.js: a
 * vector bar or pie stays crisp at any zoom, adds no bytes to the bundle, and
 * needs no canvas — so exporting works identically in every browser.
 *
 * No financial calculation happens here. Callers pass numbers that were already
 * computed by the tools' own engines.
 */
import type { jsPDF } from 'jspdf';
import { FINATRIX_LOGO_SRC } from '../../components/BrandLogo';

export type Doc = jsPDF;
export type RGB = [number, number, number];

/* ── Layout ─────────────────────────────────────────────────────────────── */
export const MARGIN = 40;
/** Space kept clear at the foot of every page for the footer rule + page number. */
export const FOOTER_SPACE = 46;

export function pageW(doc: Doc): number {
  return doc.internal.pageSize.getWidth();
}
export function pageH(doc: Doc): number {
  return doc.internal.pageSize.getHeight();
}
export function contentW(doc: Doc): number {
  return pageW(doc) - MARGIN * 2;
}

/* ── Palette (print-tuned: slightly deeper than the screen tokens) ───────── */
export const INK: RGB = [26, 26, 26];
export const INK_2: RGB = [88, 88, 92];
export const MUTED: RGB = [138, 138, 142];
export const HAIR: RGB = [226, 224, 218];
export const GOLD: RGB = [176, 138, 54];
export const PAPER: RGB = [250, 249, 246];

export const TONE_RGB: Record<string, RGB> = {
  none: [138, 138, 142],
  safe: [29, 125, 70],
  warn: [194, 65, 12],
  complete: [0, 113, 227],
  over: [200, 30, 30],
};

/** Categorical palette for pie slices and series — distinct at print contrast. */
export const SLICE_COLORS: RGB[] = [
  [0, 113, 227], [194, 65, 12], [29, 125, 70], [124, 92, 255], [176, 138, 54],
  [12, 128, 121], [179, 56, 122], [37, 99, 235], [146, 64, 14], [110, 59, 212],
];

/* ── Money ──────────────────────────────────────────────────────────────── */

/**
 * Currency for print. Reports use the ISO code rather than the symbol on
 * purpose: jsPDF's built-in fonts are WinAnsi-encoded, so ₹, ₩, ฿ and friends
 * render as mojibake — and in a document that may be forwarded to a bank or an
 * accountant, "INR 20,000" is less ambiguous than a glyph anyway. Grouping
 * follows the currency (lakh/crore for INR).
 */
export function money(n: number, code: string): string {
  const v = Math.round(Number(n) || 0);
  const neg = v < 0;
  const abs = Math.abs(v);
  const grouped = abs.toLocaleString(code === 'INR' ? 'en-IN' : 'en-US');
  return `${neg ? '-' : ''}${code} ${grouped}`;
}

export function pct(n: number): string {
  return `${Math.round(Number(n) || 0)}%`;
}

/* ── Brand mark ─────────────────────────────────────────────────────────── */

let logoCache: string | null | undefined;

/**
 * The logo as a data URL, fetched once per session. Returns null when it can't
 * be loaded (offline, blocked, or a non-browser test environment) so callers
 * fall back to the drawn mark instead of failing the export.
 */
export async function loadLogo(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const res = await fetch(FINATRIX_LOGO_SRC);
    if (!res.ok) throw new Error('logo unavailable');
    const blob = await res.blob();
    logoCache = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    logoCache = null;
  }
  return logoCache;
}

/** Vector fallback mark — a gold tile with the FinatriX "F". */
function drawMark(doc: Doc, x: number, y: number, size: number) {
  doc.setFillColor(...GOLD);
  doc.roundedRect(x, y, size, size, size * 0.24, size * 0.24, 'F');
  doc.setTextColor(26, 20, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size * 0.62);
  doc.text('F', x + size / 2, y + size * 0.72, { align: 'center' });
}

export interface HeaderOptions {
  /** e.g. "Expense Report". */
  title: string;
  /** e.g. "July 2026". */
  period: string;
  currency: string;
  /** Data URL from loadLogo(), or null for the vector fallback. */
  logo: string | null;
}

/** Report masthead. Returns the y cursor below it. */
export function drawHeader(doc: Doc, o: HeaderOptions): number {
  const W = pageW(doc);
  const size = 34;

  if (o.logo) {
    try {
      doc.addImage(o.logo, 'PNG', MARGIN, 36, size, size);
    } catch {
      drawMark(doc, MARGIN, 36, size);
    }
  } else {
    drawMark(doc, MARGIN, 36, size);
  }

  const textX = MARGIN + size + 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...INK);
  doc.text('FinatriX', textX, 52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Personal finance, made clear', textX, 65);

  // Right-hand meta block.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(o.title, W - MARGIN, 50, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...INK_2);
  doc.text(o.period, W - MARGIN, 64, { align: 'right' });

  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`Currency ${o.currency}  ·  Generated ${stamp()}`, W - MARGIN, 76, { align: 'right' });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, 88, W - MARGIN, 88);
  return 108;
}

export function stamp(): string {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/* ── Cover page ─────────────────────────────────────────────────────────── */

export interface CoverOptions {
  title: string;
  /** e.g. "July 2026". */
  period: string;
  currency: string;
  logo: string | null;
  /** The one number the report is about, pre-formatted. */
  headline: string;
  headlineLabel: string;
  /** Two or three supporting figures, shown beneath the headline. */
  facts: Array<{ label: string; value: string }>;
  /** Optional one-line summary in the reader's own terms. */
  summary?: string;
}

/**
 * A cover page.
 *
 * Reports get printed, emailed to an accountant and filed. Opening straight
 * onto a dense stat grid gives the reader nothing to orient on and nothing to
 * file it under — the cover exists so the first thing seen is *what this is,
 * whose it is, and which month*, at a size that survives being printed and
 * skimmed.
 *
 * Always followed by `doc.addPage()` from the caller: this function owns the
 * whole first page and leaves the cursor nowhere.
 */
export function drawCover(doc: Doc, o: CoverOptions): void {
  const W = pageW(doc);
  const H = pageH(doc);

  // A full-bleed tint. Kept very light: this page is routinely printed on a
  // mono laser, where a heavy fill becomes a grey smear across the sheet.
  doc.setFillColor(...PAPER);
  doc.rect(0, 0, W, H, 'F');

  doc.setFillColor(...GOLD);
  doc.rect(0, 0, W, 6, 'F');

  const size = 46;
  if (o.logo) {
    try { doc.addImage(o.logo, 'PNG', MARGIN, 92, size, size); } catch { drawMark(doc, MARGIN, 92, size); }
  } else {
    drawMark(doc, MARGIN, 92, size);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text('FinatriX', MARGIN + size + 14, 116);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text('Personal finance, made clear', MARGIN + size + 14, 131);

  // Title block.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(34);
  doc.setTextColor(...INK);
  doc.text(o.title, MARGIN, 232);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.setTextColor(...INK_2);
  doc.text(o.period, MARGIN, 258);

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(2);
  doc.line(MARGIN, 278, MARGIN + 64, 278);

  // The headline figure.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(o.headlineLabel.toUpperCase(), MARGIN, 320);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(40);
  doc.setTextColor(...INK);
  doc.text(o.headline, MARGIN, 356);

  // Supporting facts, evenly spaced across the page.
  const factY = 410;
  const colW = contentW(doc) / Math.max(1, o.facts.length);
  o.facts.forEach((f, i) => {
    const x = MARGIN + i * colW;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(f.label.toUpperCase(), x, factY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...INK);
    doc.text(f.value, x, factY + 20);
  });

  if (o.summary) {
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, factY + 44, W - MARGIN, factY + 44);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...INK_2);
    doc.text(doc.splitTextToSize(o.summary, contentW(doc)) as string[], MARGIN, factY + 68);
  }

  // Footer block.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`Currency ${o.currency}`, MARGIN, H - 64);
  doc.text(`Generated ${stamp()}`, MARGIN, H - 52);
  doc.text('Educational tool, not financial advice.', MARGIN, H - 40);
  doc.text('finatrix.co', W - MARGIN, H - 40, { align: 'right' });
}

/* ── Period comparison ──────────────────────────────────────────────────── */

export interface CompareRow {
  label: string;
  current: number;
  previous: number;
}

/**
 * This period against the one before it, as paired bars.
 *
 * A single month in isolation cannot tell anyone whether they are improving —
 * that is the question a monthly report is actually asked. Rows are drawn on a
 * shared scale so the two bars are directly comparable, and the delta is
 * printed as well as drawn: the direction must survive being photocopied in
 * black and white, where the two fills become the same grey.
 */
export function drawComparison(
  doc: Doc,
  y: number,
  rows: CompareRow[],
  code: string,
  labels: { current: string; previous: string },
): number {
  if (rows.length === 0) return y;

  const W = contentW(doc);
  const labelW = 130;
  const deltaW = 88;
  const barsW = W - labelW - deltaW - 16;
  const rowH = 30;
  let cursor = ensureSpace(doc, y, 40);

  // Legend.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setFillColor(...GOLD);
  doc.rect(MARGIN + labelW, cursor - 2, 8, 8, 'F');
  doc.setTextColor(...INK_2);
  doc.text(labels.current, MARGIN + labelW + 12, cursor + 5);
  doc.setFillColor(...HAIR);
  doc.rect(MARGIN + labelW + 12 + doc.getTextWidth(labels.current) + 14, cursor - 2, 8, 8, 'F');
  doc.setTextColor(...MUTED);
  doc.text(
    labels.previous,
    MARGIN + labelW + 12 + doc.getTextWidth(labels.current) + 28,
    cursor + 5,
  );
  cursor += 18;

  const max = Math.max(...rows.map((r) => Math.max(r.current, r.previous)), 1);

  for (const r of rows) {
    cursor = ensureSpace(doc, cursor, rowH + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(fit(doc, r.label, labelW - 8), MARGIN, cursor + 12);

    const barX = MARGIN + labelW;
    // Current on top, previous beneath, both from the same origin.
    doc.setFillColor(...GOLD);
    doc.rect(barX, cursor + 2, Math.max(1, (r.current / max) * barsW), 8, 'F');
    doc.setFillColor(...HAIR);
    doc.rect(barX, cursor + 13, Math.max(1, (r.previous / max) * barsW), 8, 'F');

    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(money(r.current, code), barX + Math.max(1, (r.current / max) * barsW) + 5, cursor + 9);

    // The delta, in words as well as position.
    const diff = r.current - r.previous;
    const pctChange = r.previous > 0 ? (diff / r.previous) * 100 : null;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    // Keys must come from the BudgetTone set — `TONE_RGB` is a loose
    // `Record<string, RGB>`, so a typo yields `undefined` and the spread below
    // throws "is not iterable" at export time rather than at compile time.
    doc.setTextColor(...(diff > 0 ? TONE_RGB.over : diff < 0 ? TONE_RGB.safe : MUTED));
    const text = pctChange == null
      ? (r.previous === 0 ? 'New' : '—')
      : `${diff >= 0 ? '+' : ''}${Math.round(pctChange)}%`;
    doc.text(text, MARGIN + W, cursor + 12, { align: 'right' });

    cursor += rowH;
  }

  return cursor + 6;
}

/* ── Flow helpers ───────────────────────────────────────────────────────── */

/** Start a new page when `needed` points wouldn't fit. Returns the y to use. */
export function ensureSpace(doc: Doc, y: number, needed: number): number {
  if (y + needed <= pageH(doc) - FOOTER_SPACE) return y;
  doc.addPage();
  return MARGIN + 12;
}

/** Section heading with a hairline rule. Returns the y cursor below it. */
export function sectionTitle(doc: Doc, y: number, text: string, sub?: string): number {
  const top = ensureSpace(doc, y, sub ? 44 : 34);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...INK);
  doc.text(text, MARGIN, top + 10);
  if (sub) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(sub, MARGIN, top + 22);
  }
  doc.setDrawColor(...HAIR);
  doc.setLineWidth(0.6);
  const ruleY = top + (sub ? 30 : 18);
  doc.line(MARGIN, ruleY, pageW(doc) - MARGIN, ruleY);
  return ruleY + 14;
}

/* ── Stat cards ─────────────────────────────────────────────────────────── */

export interface StatCard {
  label: string;
  value: string;
  /** Optional supporting line under the value. */
  note?: string;
  /** Accent stripe colour; defaults to gold. */
  accent?: RGB;
}

/** A responsive grid of summary cards. Returns the y cursor below the grid. */
export function drawStatCards(doc: Doc, y: number, cards: StatCard[], perRow = 3): number {
  const gap = 11;
  const w = (contentW(doc) - gap * (perRow - 1)) / perRow;
  const h = 58;
  const rows = Math.ceil(cards.length / perRow);
  const top = ensureSpace(doc, y, rows * (h + gap));

  cards.forEach((c, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = MARGIN + col * (w + gap);
    const cy = top + row * (h + gap);

    doc.setFillColor(...PAPER);
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, cy, w, h, 6, 6, 'FD');

    doc.setFillColor(...(c.accent ?? GOLD));
    doc.rect(x, cy + 6, 2.6, h - 12, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(c.label.toUpperCase(), x + 12, cy + 17);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text(fit(doc, c.value, w - 22), x + 12, cy + 35);

    if (c.note) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...INK_2);
      doc.text(fit(doc, c.note, w - 22), x + 12, cy + 48);
    }
  });

  return top + rows * (h + gap) + 6;
}

/** Truncate to fit a column, with an ellipsis — never let text run over a rule. */
export function fit(doc: Doc, text: string, maxW: number): string {
  const s = String(text ?? '');
  if (doc.getTextWidth(s) <= maxW) return s;
  let out = s;
  while (out.length > 1 && doc.getTextWidth(out + '…') > maxW) out = out.slice(0, -1);
  return out + '…';
}

/* ── Grouped bar chart ──────────────────────────────────────────────────── */

export interface BarRow {
  label: string;
  budget: number;
  spent: number;
}

/**
 * Budget vs expense, one pair of bars per category. Ordered by the caller;
 * the y axis is scaled to the largest single value so both series are
 * comparable at a glance.
 */
export function drawGroupedBars(doc: Doc, y: number, rows: BarRow[], code: string): number {
  if (rows.length === 0) return y;
  const chartH = 148;
  const top = ensureSpace(doc, y, chartH + 52);
  const W = contentW(doc);
  const baseY = top + chartH;
  const max = Math.max(...rows.flatMap((r) => [r.budget, r.spent]), 1);

  // Grid lines + y labels (4 bands).
  doc.setFontSize(7);
  for (let i = 0; i <= 4; i++) {
    const gy = baseY - (chartH * i) / 4;
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, gy, MARGIN + W, gy);
    doc.setTextColor(...MUTED);
    doc.text(money((max * i) / 4, code), MARGIN - 4, gy + 2.5, { align: 'right' });
  }

  const slot = W / rows.length;
  const barW = Math.min(16, (slot - 10) / 2);
  rows.forEach((r, i) => {
    const cx = MARGIN + slot * i + slot / 2;
    const bh = (r.budget / max) * chartH;
    const sh = (r.spent / max) * chartH;

    doc.setFillColor(160, 190, 230);
    doc.rect(cx - barW - 1.5, baseY - bh, barW, bh, 'F');
    doc.setFillColor(...(r.spent > r.budget && r.budget > 0 ? TONE_RGB.over : TONE_RGB.warn));
    doc.rect(cx + 1.5, baseY - sh, barW, sh, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(...INK_2);
    doc.text(fit(doc, r.label, slot - 4), cx, baseY + 11, { align: 'center' });
  });

  // Legend.
  const legY = baseY + 26;
  doc.setFillColor(160, 190, 230);
  doc.rect(MARGIN, legY - 6, 9, 7, 'F');
  doc.setFontSize(8);
  doc.setTextColor(...INK_2);
  doc.text('Budget', MARGIN + 14, legY);
  doc.setFillColor(...TONE_RGB.warn);
  doc.rect(MARGIN + 60, legY - 6, 9, 7, 'F');
  doc.text('Expense', MARGIN + 74, legY);

  return legY + 16;
}

/* ── Donut chart ────────────────────────────────────────────────────────── */

export interface Slice {
  label: string;
  amount: number;
}

/**
 * Category breakdown as a donut with a legend. jsPDF has no arc primitive, so
 * each slice is a fan of thin triangles — visually identical to a true arc at
 * print resolution and free of any dependency.
 */
export function drawDonut(doc: Doc, y: number, slices: Slice[], code: string): number {
  const usable = slices.filter((s) => s.amount > 0);
  if (usable.length === 0) return y;

  const r = 74;
  const blockH = r * 2 + 16;
  const rowsNeeded = Math.max(blockH, usable.length * 14 + 10);
  const top = ensureSpace(doc, y, rowsNeeded + 10);

  const cx = MARGIN + r + 6;
  const cy = top + r;
  const total = usable.reduce((s, x) => s + x.amount, 0) || 1;

  let angle = -Math.PI / 2; // start at 12 o'clock
  usable.forEach((s, i) => {
    const sweep = (s.amount / total) * Math.PI * 2;
    const color = SLICE_COLORS[i % SLICE_COLORS.length];
    doc.setFillColor(...color);
    const steps = Math.max(2, Math.ceil(sweep / 0.05));
    for (let k = 0; k < steps; k++) {
      const a0 = angle + (sweep * k) / steps;
      const a1 = angle + (sweep * (k + 1)) / steps;
      doc.triangle(
        cx, cy,
        cx + Math.cos(a0) * r, cy + Math.sin(a0) * r,
        cx + Math.cos(a1) * r, cy + Math.sin(a1) * r,
        'F',
      );
    }
    angle += sweep;
  });

  // Donut hole + centre total.
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, r * 0.56, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(fit(doc, money(total, code), r * 1.0), cx, cy + 1, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text('total', cx, cy + 11, { align: 'center' });

  // Legend column.
  const legX = cx + r + 26;
  const legW = pageW(doc) - MARGIN - legX;
  usable.slice(0, 12).forEach((s, i) => {
    const ly = top + 12 + i * 14;
    doc.setFillColor(...SLICE_COLORS[i % SLICE_COLORS.length]);
    doc.roundedRect(legX, ly - 7, 8, 8, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...INK_2);
    doc.text(fit(doc, s.label, legW - 110), legX + 13, ly);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(
      `${money(s.amount, code)}  ${pct((s.amount / total) * 100)}`,
      pageW(doc) - MARGIN, ly, { align: 'right' },
    );
  });

  return top + Math.max(blockH, Math.min(usable.length, 12) * 14 + 14) + 8;
}

/* ── Footer ─────────────────────────────────────────────────────────────── */

/**
 * Stamp every page with the brand line and "Page n of m". Run this last, once
 * the document knows how many pages it has.
 */
export function stampFooters(doc: Doc, note: string): void {
  const total = doc.getNumberOfPages();
  const W = pageW(doc);
  const H = pageH(doc);
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, H - 34, W - MARGIN, H - 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(note, MARGIN, H - 21);
    doc.text(`Page ${i} of ${total}`, W - MARGIN, H - 21, { align: 'right' });
  }
}

/** Shared table styling so every report's tables look like one document. */
export const TABLE_STYLES = {
  headStyles: { fillColor: INK, textColor: 255, fontSize: 8.5, fontStyle: 'bold' as const, cellPadding: 5 },
  bodyStyles: { fontSize: 8.5, textColor: INK_2, cellPadding: 4.5 },
  alternateRowStyles: { fillColor: [248, 247, 244] as RGB },
  styles: { lineColor: HAIR, lineWidth: 0.4, font: 'helvetica' },
  margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_SPACE },
};
