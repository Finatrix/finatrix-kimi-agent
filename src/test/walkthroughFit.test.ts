import { beforeAll, describe, it, expect } from 'vitest';
import { fitSvgText } from '../walkthrough/fit';

const NS = 'http://www.w3.org/2000/svg';

/** jsdom has no text layout, so give each label a width of 6 units a character. */
function label(text: string, attrs: Record<string, string>): SVGTextElement {
  const el = document.createElementNS(NS, 'text') as SVGTextElement;
  el.textContent = text;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  (el as unknown as { getComputedTextLength: () => number }).getComputedTextLength = () => (el.textContent ?? '').length * 6;
  return el;
}

describe('fitSvgText', () => {
  beforeAll(() => {
    const style = document.createElement('style');
    style.textContent = 'text { font-size: 12px; }';
    document.head.append(style);
  });

  it('leaves a label that already fits alone', () => {
    const svg = document.createElementNS(NS, 'svg');
    const t = label('Fits', { 'data-fit': '100' });
    svg.append(t);
    document.body.append(svg);
    fitSvgText(svg);
    expect(t.style.fontSize).toBe('');
    svg.remove();
  });

  it('scales an overflowing label down to its box', () => {
    const svg = document.createElementNS(NS, 'svg');
    const t = label('This label is far too long', { 'data-fit': '78' }); // 26 chars = 156 units
    svg.append(t);
    document.body.append(svg);
    fitSvgText(svg);
    const px = parseFloat(t.style.fontSize);
    expect(px).toBeLessThan(12);
    expect(px).toBeGreaterThanOrEqual(12 * 0.62);
    svg.remove();
  });

  it('measures the final string of a count-up, then restores what was showing', () => {
    const svg = document.createElementNS(NS, 'svg');
    const t = label('0', { 'data-fit': '60', 'data-sample': 'AED 1,000,000' }); // 13 chars = 78 units
    svg.append(t);
    document.body.append(svg);
    fitSvgText(svg);
    expect(t.textContent).toBe('0');
    expect(parseFloat(t.style.fontSize)).toBeLessThan(12);
    svg.remove();
  });
});
