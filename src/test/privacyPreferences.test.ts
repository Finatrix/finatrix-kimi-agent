import { beforeEach, afterEach, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(() => vi.unstubAllEnvs());

it('stops optional analytics immediately and discards unsent events', async () => {
  vi.stubEnv('VITE_ANALYTICS_URL', 'https://example.invalid/analytics');
  Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
  const beacon = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
  const analytics = await import('../lib/analytics');
  const privacy = await import('../lib/privacyPreferences');
  analytics.initAnalytics();
  analytics.track('page_view');
  expect(analytics.__analyticsInternals.getQueue()).toHaveLength(1);
  privacy.setAnalyticsOptOut(true);
  expect(analytics.analyticsEnabled()).toBe(false);
  expect(analytics.__analyticsInternals.getQueue()).toHaveLength(0);
  analytics.track('tool_view');
  analytics.flush();
  expect(beacon).not.toHaveBeenCalled();
  privacy.setAnalyticsOptOut(false);
  expect(analytics.analyticsEnabled()).toBe(true);
  expect(analytics.__analyticsInternals.getQueue()).toHaveLength(0);
});

it('respects a preference changed by another tab', async () => {
  const privacy = await import('../lib/privacyPreferences');
  privacy.setAnalyticsOptOut(true);
  localStorage.setItem('fx_analytics_opt_out', '0');
  expect(privacy.analyticsOptedOut()).toBe(false);
});
