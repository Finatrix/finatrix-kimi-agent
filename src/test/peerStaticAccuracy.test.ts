import { describe, expect, it } from 'vitest';
import { crawlableBodyFor } from '../lib/crawlable';
import { TOOL_GUIDES } from '../shared/toolGuides';
import { TOOL_FAQ } from '../shared/toolFaq';
import { faqForMarket, guideForMarket } from '../tools/lib/markets/guides';
import { MARKETS } from '../tools/lib/markets';

describe('PeerCompare static explanation accuracy', () => {
  it.each(['IN', 'US', 'GB', 'AE'] as const)('keeps the static guide and FAQ consistent with the %s rendered model explanation', (id) => {
    expect(TOOL_GUIDES.peercompare).toEqual(guideForMarket('peercompare', MARKETS[id]));
    expect(TOOL_FAQ.peercompare).toEqual(faqForMarket('peercompare', MARKETS[id]));
  });

  it('serves age-band model methodology and a non-statistical worked example to crawlers', () => {
    const html = crawlableBodyFor('/tools/peercompare', null);
    expect(html).not.toBeNull();
    const content = new DOMParser().parseFromString(html!, 'text/html').body.textContent!;
    expect(content).toContain('Age selects an age band in the benchmark grid');
    expect(content).toContain('not a measured population percentile');
    expect(content).toContain('What a model score of 50 means');
    expect(content).toContain('This does not mean that half of people earn more or less');
    expect(content).toContain('The displayed references are model estimates selected by age band and location');
    expect(content).not.toMatch(/income bracket|Income places you in a bracket|calibrated model|\d+(?:st|nd|rd|th) percentile|A sits near its benchmark/);
  });
});
