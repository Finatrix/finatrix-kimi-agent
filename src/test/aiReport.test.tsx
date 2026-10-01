/**
 * Reporting an AI answer (Google Play AI-generated content policy).
 *
 * The contract: the report carries a reason code only — never the answer text;
 * it is delivered even when usage analytics is switched off; "reported" is said
 * only once the server has it; and keyboard / screen-reader focus follows each
 * step instead of falling to <body>.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ sendUserReport: vi.fn(async () => true) }));
vi.mock('../lib/analytics', async (orig) => ({
  ...(await orig<typeof import('../lib/analytics')>()),
  sendUserReport: h.sendUserReport,
}));

import { ReportAnswer } from '../tools/ui/AiPanel';

const ANSWER = 'Your rent is 23% of income.';

function openReasons() {
  render(<ReportAnswer text={ANSWER} />);
  fireEvent.click(screen.getByRole('button', { name: 'Report this answer' }));
}

beforeEach(() => {
  h.sendUserReport.mockReset();
  h.sendUserReport.mockResolvedValue(true);
});

describe('ReportAnswer', () => {
  it('reports a reason without sending the answer, then offers an optional email', async () => {
    openReasons();
    fireEvent.click(screen.getByRole('button', { name: 'Offensive or harmful' }));
    expect(h.sendUserReport).toHaveBeenCalledWith('ai_answer_reported', { kind: 'harmful' });
    expect(JSON.stringify(h.sendUserReport.mock.calls)).not.toContain('rent');
    expect(await screen.findByRole('status')).toHaveTextContent('Thanks — reported.');
    const mail = screen.getByRole('link', { name: 'Add details by email' });
    expect(mail.getAttribute('href')).toMatch(/^mailto:.*Your%20rent%20is%2023%25/);
  });

  it('never says "reported" when the report did not arrive, and offers email instead', async () => {
    h.sendUserReport.mockResolvedValue(false);
    openReasons();
    fireEvent.click(screen.getByRole('button', { name: 'Wrong or misleading' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be sent/i);
    expect(screen.queryByText(/thanks — reported/i)).toBeNull();
    expect(screen.getByRole('link', { name: 'Report it by email instead' }).getAttribute('href')).toMatch(/^mailto:/);
  });

  it('cannot be double-sent while the first report is in flight', async () => {
    let settle: (ok: boolean) => void = () => {};
    h.sendUserReport.mockImplementation(() => new Promise<boolean>((r) => { settle = r; }));
    openReasons();
    fireEvent.click(screen.getByRole('button', { name: 'Something else' }));
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Offensive or harmful' }));
    expect(h.sendUserReport).toHaveBeenCalledTimes(1);
    settle(true);
    await screen.findByRole('status');
  });

  it('can be cancelled without reporting, returning focus to Report', () => {
    openReasons();
    expect(screen.getByRole('button', { name: 'Offensive or harmful' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.sendUserReport).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Report this answer' })).toHaveFocus();
  });

  it('moves focus to the outcome so a screen reader hears it', async () => {
    openReasons();
    fireEvent.click(screen.getByRole('button', { name: 'Offensive or harmful' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveFocus());
  });
});

describe('sendUserReport', () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));

  beforeEach(() => {
    vi.stubEnv('VITE_ANALYTICS_URL', 'https://example.supabase.co/functions/v1/analytics-collect');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    localStorage.clear();
    // Permission to send to the AI provider is its own concern (aiConsent.test.tsx).
    localStorage.setItem('fx_ai_consent', '1');
  });

  async function load() {
    vi.resetModules();
    vi.doUnmock('../lib/analytics');
    return await import('../lib/analytics');
  }

  it('delivers even when usage analytics is opted out, carrying only the reason', async () => {
    const analytics = await load();
    const { setAnalyticsOptOut } = await import('../lib/privacyPreferences');
    setAnalyticsOptOut(true);
    expect(analytics.analyticsEnabled()).toBe(false);

    expect(await analytics.sendUserReport('ai_answer_reported', { kind: 'harmful', text: ANSWER } as never)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/analytics-collect$/);
    expect(init.credentials).toBe('omit');
    const body = JSON.parse(String(init.body));
    expect(body.events).toEqual([{ e: 'ai_answer_reported', p: { kind: 'harmful' }, t: 0 }]);
    expect(String(init.body)).not.toContain('rent');
  });

  it('uses a one-off id, never the analytics session id', async () => {
    const analytics = await load();
    await analytics.sendUserReport('ai_answer_reported', { kind: 'wrong' });
    await analytics.sendUserReport('ai_answer_reported', { kind: 'wrong' });
    const ids = fetchMock.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)).sid);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids).not.toContain(analytics.__analyticsInternals.sessionId);
  });

  it('reports failure on a network error or a non-2xx answer', async () => {
    const analytics = await load();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await analytics.sendUserReport('ai_answer_reported', { kind: 'other' })).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect(await analytics.sendUserReport('ai_answer_reported', { kind: 'other' })).toBe(false);
  });
});
