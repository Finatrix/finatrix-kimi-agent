import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ParkSmartPage from '../tools/pages/ParkSmartPage';
import PeerComparePage from '../tools/pages/PeerComparePage';
import { MARKETS, detectMarket, isMarketId } from '../tools/lib/markets';
import { lifeMapDecisionsForMarket } from '../tools/lib/markets/lifeMapPresentation';
import { buildDecisions, buildProfile } from '../tools/lib/lifemap';
import { PEER_SUMMARIES } from '../reference/peerSummaries';
import { sourceById } from '../reference/sources';
import { guideForMarket, faqForMarket } from '../tools/lib/markets/guides';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

let active: 'AU' | 'SG' | 'CN' = 'AU';
const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../tools/MarketContext', () => ({ useMarket: () => ({ market: MARKETS[active] }) }));
vi.mock('../tools/CurrencyContext', () => ({ useCurrency: () => ({ code: MARKETS[active].currency, sym: MARKETS[active].currency, cfmt: (n: number) => `${MARKETS[active].currency} ${n}` }) }));
vi.mock('../tools/ui/Toast', () => ({ useToast: () => ({ notify }) }));
vi.mock('../lib/analytics', () => ({ track: vi.fn() }));

beforeEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); active = 'AU'; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function wrap(page: React.ReactNode) { return render(<MemoryRouter>{page}</MemoryRouter>); }

for (const id of ['AU', 'SG', 'CN'] as const) describe(`${id} tool flows`, () => {
  beforeEach(() => { active = id; });
  it('requires rates instead of silently using zero or another market', () => {
    wrap(<ParkSmartPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare the options' }));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Enter both annual net rates'), 'error');
    expect(screen.queryByText('Highest modeled earnings from your inputs')).toBeNull();
  });
  it('uses the unchanged earnings engine without taxing a net rate twice', () => {
    wrap(<ParkSmartPage />);
    fireEvent.change(screen.getByLabelText(/Amount to park/), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Parking duration'), { target: { value: '6-12' } });
    fireEvent.change(screen.getByLabelText('Annual net rate for option 1 (%)'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Annual net rate for option 2 (%)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare the options' }));
    expect(screen.getByText('Highest modeled earnings from your inputs')).toBeInTheDocument();
    expect(screen.getAllByText(`${MARKETS[id].currency} 22.5`).length).toBeGreaterThan(0);
    expect(screen.getByText('Entered net 0%')).toBeInTheDocument();
  });
  it('prevents an empty ranking when both options are inaccessible for under a month', () => {
    wrap(<ParkSmartPage />);
    for (const i of [1, 2]) {
      fireEvent.change(screen.getByLabelText(`Annual net rate for option ${i} (%)`), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText(`Access for option ${i}`), { target: { value: 'false' } });
    }
    fireEvent.change(screen.getByLabelText('Parking duration'), { target: { value: '0-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare the options' }));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('include an option'), 'error');
  });
  it('requires comparable definitions and displays a summary without a fabricated rank', () => {
    wrap(<PeerComparePage />);
    const row = PEER_SUMMARIES.find((r) => r.market === id)!;
    fireEvent.change(screen.getByLabelText(/Your matching figure/), { target: { value: String(row.value) } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare matching figures' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Compare matching figures' }));
    expect(screen.getByRole('status')).toHaveTextContent('equal to this dated median');
    expect(screen.queryByText(/^percentile$/)).toBeNull();
    expect(screen.queryByLabelText('Your age')).toBeNull();
    fireEvent.change(screen.getByLabelText(/Your matching figure/), { target: { value: '-10' } });
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Compare matching figures' }));
    expect(screen.getByRole('status')).toHaveTextContent('below this dated median');
  });
  it('has consistent local methodology on both disclosure surfaces', () => {
    const guide = guideForMarket('parksmart', MARKETS[id]);
    expect(JSON.stringify(guide)).not.toMatch(/80TTA|arbitrage|₹/);
    expect(JSON.stringify(faqForMarket('parksmart', MARKETS[id]))).not.toMatch(/80TTA|slab/);
    expect(guideForMarket('peercompare', MARKETS[id]).method.join(' ')).toContain('No percentile');
  });
});

it('resets reference input and confirmation when the population measure changes', () => {
  wrap(<PeerComparePage />);
  fireEvent.change(screen.getByLabelText(/Your matching figure/), { target: { value: '1000' } });
  screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
  fireEvent.change(screen.getByLabelText('Published reference'), { target: { value: 'AU-SIH-2019-20-WEALTH-MEDIAN' } });
  expect(screen.getByLabelText(/Your matching figure/)).toHaveValue(null);
  screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).not.toBeChecked());
});

it('has source identities matching the exact release URLs and market', () => {
  expect(PEER_SUMMARIES).toHaveLength(4);
  for (const row of PEER_SUMMARIES) {
    const source = sourceById(row.sourceId);
    expect(source?.url).toBe(row.sourceUrl);
    expect(source?.market).toBe(row.market);
    expect(row.locator).not.toBe('');
    expect(row.licenceUrl).toMatch(/^https:\/\//);
  }
});

it('preserves the archived evidence bytes used for the summaries', () => {
  const base = 'docs/evidence/seven-markets-2026-09-12/';
  const manifest = JSON.parse(readFileSync(base + 'manifest.json', 'utf8'));
  for (const file of manifest.files) {
    const bytes = readFileSync(base + file.file);
    expect(bytes.length).toBe(file.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
  }
});

it.each([['en-AU', 'AU'], ['en-SG', 'SG'], ['zh-Hans-CN', 'CN'], ['zh-Hant-HK', null], ['zh-Hant-TW', null], ['zh-MO', null]])('detects %s without folding non-mainland regions into CN', (locale, expected) => {
  vi.stubGlobal('navigator', { languages: [locale], language: locale });
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'UTC' } as Intl.ResolvedDateTimeFormatOptions);
  expect(detectMarket()).toBe(expected);
  for (const unsupported of ['HK', 'MO', 'TW']) expect(isMarketId(unsupported)).toBe(false);
});

it('localizes eligible LifeMap cards without rewriting any numeric effect', () => {
  const profile = buildProfile({ age: 30, name: '', income: 6000, expenses: 3000, savings: 10000, invest: 5000, emergency: 3000, sipYn: false, sip: 0, debtYn: false, debtTotal: 0, debtEmi: 0, career: 'tech', goals: ['home'] });
  const original = buildDecisions(profile, String);
  expect(lifeMapDecisionsForMarket(original, MARKETS.IN)).toBe(original);
  for (const id of ['AU', 'SG', 'CN'] as const) {
    const localized = lifeMapDecisionsForMarket(original, MARKETS[id]);
    expect(localized.length).toBeGreaterThan(0);
    expect(JSON.stringify(localized)).not.toMatch(/NPS|PPF|ELSS|Nifty|SEBI|₹/);
    for (const d of localized) {
      const old = original.find((o) => o.id === d.id)!;
      for (const field of ['smart', 'bad', 'ca', 'minAge', 'custom'] as const) expect(d[field]).toEqual(old[field]);
    }
  }
});
