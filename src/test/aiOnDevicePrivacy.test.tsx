import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

/** Settings → Privacy offers the on-device choice only on a phone that has a model. */

const h = vi.hoisted(() => ({
  native: false,
  status: { state: 'available', engine: 'gemini-nano', contextTokens: 4000 } as Record<string, unknown>,
}));

vi.mock('../native/platform', async (orig) => ({ ...(await orig<object>()), isNativeApp: () => h.native }));
vi.mock('@capacitor/core', async (orig) => ({
  ...(await orig<object>()),
  registerPlugin: () => ({ status: async () => h.status, generate: async () => ({}) }),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

import PrivacyControls from '../tools/ui/PrivacyControls';

const LABEL = 'Use the AI built into this phone when it can';

function renderIt() {
  return render(<MemoryRouter><PrivacyControls /></MemoryRouter>);
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  h.native = false;
  h.status = { state: 'available', engine: 'gemini-nano', contextTokens: 4000 };
});

describe('on-device AI in Settings → Privacy', () => {
  it('is not offered on the web', () => {
    renderIt();
    expect(screen.queryByLabelText(LABEL)).toBeNull();
  });

  it('is not offered on a phone without a model', async () => {
    h.native = true;
    h.status = { state: 'unsupported', engine: 'apple', contextTokens: 0 };
    renderIt();
    await screen.findByText('Privacy control centre');
    await Promise.resolve();
    expect(screen.queryByLabelText(LABEL)).toBeNull();
  });

  it('is on by default where the phone has a model, and can be turned off', async () => {
    h.native = true;
    renderIt();
    const box = (await screen.findByLabelText(LABEL)) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(box.checked).toBe(false);
    expect(localStorage.getItem('fx_ai_on_device')).toBe('0');
    expect(screen.getByRole('status').textContent).toMatch(/cloud AI provider only/);
  });

  it('says when the model is not ready yet', async () => {
    h.native = true;
    h.status = { state: 'preparing', engine: 'apple', contextTokens: 0 };
    renderIt();
    await screen.findByLabelText(LABEL);
    expect(screen.getByText(/not ready yet/)).toBeTruthy();
  });
});
