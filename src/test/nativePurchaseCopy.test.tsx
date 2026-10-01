import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

/**
 * The no-purchase notice is shared by both apps, so it must not name either
 * platform. App Review Guideline 2.3.10 rejects an iOS app that mentions
 * another mobile platform; "can't be purchased in the Android app" read on an
 * iPhone was exactly that.
 */

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'test@finatrix.invalid', user_metadata: {} } }),
}));
vi.mock('../tools/ui/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }));

import CareersProPaywall from '../careers/pages/CareersProPaywall';

type CapWindow = Window & {
  Capacitor?: { isNativePlatform: () => boolean; getPlatform: () => string };
};

afterEach(() => {
  cleanup();
  delete (window as CapWindow).Capacitor;
});

describe.each(['ios', 'android'] as const)('Careers Pro paywall in the %s app', (platform) => {
  it('offers no purchase and names no platform', () => {
    (window as CapWindow).Capacitor = { isNativePlatform: () => true, getPlatform: () => platform };
    render(
      <MemoryRouter>
        <CareersProPaywall />
      </MemoryRouter>,
    );
    expect(screen.getByText("Careers Pro can't be purchased in the app.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Android|iPhone|\biOS\b|Google Play|App Store/);
    expect(screen.queryByRole('button', { name: /subscribe|buy|upgrade|start careers pro/i })).toBeNull();
  });
});
