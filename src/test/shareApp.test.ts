import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { shareApp, shareUrl, rateUrl, rateApp } from '../lib/shareApp';
import { APP_STORE_REVIEW_URL, PLAY_STORE_URL } from '../shared/brand';

const share = vi.fn();
vi.mock('@capacitor/share', () => ({ Share: { share: (o: unknown) => share(o) } }));

function setPlatform(p: 'android' | 'ios' | null) {
  (window as unknown as { Capacitor?: unknown }).Capacitor = p
    ? { isNativePlatform: () => true, getPlatform: () => p }
    : undefined;
}

describe('share and rate', () => {
  beforeEach(() => {
    share.mockReset();
    setPlatform(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  it('shares the website in a browser and offers nothing to rate', () => {
    expect(shareUrl()).toBe('https://finatrix.co');
    expect(rateUrl()).toBeNull();
  });

  it('points each app at its own store', () => {
    setPlatform('android');
    expect(shareUrl()).toBe(PLAY_STORE_URL);
    expect(rateUrl()).toBe(PLAY_STORE_URL);
    setPlatform('ios');
    expect(rateUrl()).toBe(APP_STORE_REVIEW_URL);
  });

  it('uses the native sheet inside an app', async () => {
    setPlatform('android');
    share.mockResolvedValue(undefined);
    expect(await shareApp()).toBe('shared');
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: PLAY_STORE_URL }));
  });

  it('treats a dismissed sheet as cancelled, not as an error', async () => {
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(new DOMException('Share canceled', 'AbortError')),
      configurable: true,
    });
    expect(await shareApp()).toBe('cancelled');
  });

  it('copies the link when the browser cannot share', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await shareApp()).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('https://finatrix.co'));
  });

  it('opens the store page outside the WebView when rating', () => {
    setPlatform('android');
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    rateApp();
    expect(open).toHaveBeenCalledWith(PLAY_STORE_URL, '_system');
  });
});
