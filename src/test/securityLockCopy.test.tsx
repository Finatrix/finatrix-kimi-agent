/**
 * The Security page's sentence about a lock on the device is shown only where
 * it is true. A browser has no lock, and neither does an app build from before
 * the lock existed (it carries its own copy of this page). An app build that
 * has the lock says what the lock is not.
 */
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const { platform } = vi.hoisted(() => ({ platform: { native: false } }));

vi.mock('../native/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../native/platform')>()),
  isNativeApp: () => platform.native,
}));
// The page shell (navigation, footer, metadata) is not what this is about.
vi.mock('../marketing/MarketingPage', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import Security from '../pages/marketing/Security';

function pageText(): string {
  const { container } = render(
    <MemoryRouter>
      <Security />
    </MemoryRouter>,
  );
  return container.textContent ?? '';
}

describe('Security page: the device lock sentence', () => {
  it('tells a browser that FinatriX adds no lock there, and claims none', () => {
    platform.native = false;
    const text = pageText();
    expect(text).toContain('No separate lock in your browser.');
    expect(text).toContain('On the web, FinatriX adds no passcode or biometric lock.');
    expect(text).not.toContain('The app lock is not encryption.');
  });

  it('tells the app that its lock is not encryption, and does not deny having one', () => {
    platform.native = true;
    const text = pageText();
    expect(text).toContain('The app lock is not encryption.');
    expect(text).toContain('It does not encrypt anything');
    expect(text).not.toContain('adds no passcode or biometric lock');
  });
});
