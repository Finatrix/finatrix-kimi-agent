import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import ToolsLayout from '../tools/ToolsLayout';
import { WALKTHROUGH_SEEN_KEY, WALKTHROUGH_TEST_OPT_IN_KEY } from '../walkthrough/gating';
import { replayWalkthrough } from '../walkthrough/replay';

/**
 * The intro mounted the way users meet it: inside the real tools shell. Tests
 * opt in with WALKTHROUGH_TEST_OPT_IN_KEY — without it the intro never
 * appears under vitest, which is what keeps every other shell test unaffected.
 */

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/tools" element={<ToolsLayout />}>
            <Route path="dashboard" element={<div>dashboard-content</div>} />
            <Route path=":toolId" element={<div>tool-content</div>} />
          </Route>
          <Route path="/welcome" element={<div>welcome-setup</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const dialog = () => screen.findByRole('dialog', { name: 'Welcome to FinatriX' });
const settle = () => act(() => new Promise((r) => setTimeout(r, 60)));

describe('first-run walkthrough', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(WALKTHROUGH_TEST_OPT_IN_KEY, '1');
  });
  afterEach(() => cleanup());

  it('opens for a new user on the dashboard and is marked seen at once', async () => {
    renderShell('/tools/dashboard');
    const d = await dialog();
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(localStorage.getItem(WALKTHROUGH_SEEN_KEY)).toBe('1');
    expect(screen.getByRole('button', { name: 'Skip intro' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Your month, in one clear picture.' })).toBeInTheDocument();
    // Illustrations are decorative; the meaning is in the text.
    for (const svg of d.querySelectorAll('svg.wt-art')) expect(svg).toHaveAttribute('aria-hidden', 'true');
    // Focus lands inside, on the primary action.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /next/i })));
  });

  it('is not shown without the test opt-in (so it never leaks into other tests)', async () => {
    localStorage.removeItem(WALKTHROUGH_TEST_OPT_IN_KEY);
    renderShell('/tools/dashboard');
    expect(await screen.findByText('dashboard-content')).toBeInTheDocument();
    await settle();
    expect(screen.queryByRole('dialog', { name: 'Welcome to FinatriX' })).toBeNull();
  });

  it('is not shown on a deep link into a tool', async () => {
    renderShell('/tools/budget');
    expect(await screen.findByText('tool-content')).toBeInTheDocument();
    await settle();
    expect(screen.queryByRole('dialog', { name: 'Welcome to FinatriX' })).toBeNull();
    expect(localStorage.getItem(WALKTHROUGH_SEEN_KEY)).toBeNull();
  });

  it('is not shown to someone with saved data', async () => {
    localStorage.setItem('fx_goals', JSON.stringify({ 'gp-name': 'Car', 'gp-target': '500000' }));
    renderShell('/tools/dashboard');
    expect(await screen.findByText('dashboard-content')).toBeInTheDocument();
    await settle();
    expect(screen.queryByRole('dialog', { name: 'Welcome to FinatriX' })).toBeNull();
  });

  it('is not shown a second time', async () => {
    localStorage.setItem(WALKTHROUGH_SEEN_KEY, '1');
    renderShell('/tools/dashboard');
    expect(await screen.findByText('dashboard-content')).toBeInTheDocument();
    await settle();
    expect(screen.queryByRole('dialog', { name: 'Welcome to FinatriX' })).toBeNull();
  });

  it('steps with buttons and arrow keys, and announces each step', async () => {
    renderShell('/tools/dashboard');
    const d = await dialog();
    const live = d.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).toHaveTextContent('Step 1 of 4. Your month, in one clear picture.');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(live).toHaveTextContent('Step 2 of 4. Log a spend in one line.');
    expect(screen.getByRole('heading', { level: 2, name: 'Log a spend in one line.' })).toBeInTheDocument();

    fireEvent.keyDown(d, { key: 'ArrowRight' });
    expect(live).toHaveTextContent('Step 3 of 4.');
    fireEvent.keyDown(d, { key: 'ArrowLeft' });
    expect(live).toHaveTextContent('Step 2 of 4.');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(live).toHaveTextContent('Step 1 of 4.');
    // Back unmounted with focus on it; focus must not fall out of the dialog.
    await waitFor(() => expect(d.contains(document.activeElement)).toBe(true));
  });

  it('Escape on the first scene skips the intro and stays on the dashboard', async () => {
    renderShell('/tools/dashboard');
    const d = await dialog();
    fireEvent.keyDown(d, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Welcome to FinatriX' })).toBeNull());
    expect(screen.getByText('dashboard-content')).toBeInTheDocument();
    expect(localStorage.getItem(WALKTHROUGH_SEEN_KEY)).toBe('1');
  });

  it('the Android BACK button (a synthetic Escape) steps back before it closes', async () => {
    renderShell('/tools/dashboard');
    const d = await dialog();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    const live = d.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).toHaveTextContent('Step 2 of 4.');
    // native/bridge.ts dispatches an untrusted Escape — as fireEvent does.
    fireEvent.keyDown(d, { key: 'Escape' });
    expect(live).toHaveTextContent('Step 1 of 4.');
    fireEvent.keyDown(d, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Welcome to FinatriX' })).toBeNull());
  });

  it('Skip intro closes it from any scene', async () => {
    renderShell('/tools/dashboard');
    await dialog();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip intro' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Welcome to FinatriX' })).toBeNull());
  });

  it('hands off to the /welcome setup from the last scene', async () => {
    renderShell('/tools/dashboard');
    const d = await dialog();
    for (let i = 0; i < 3; i++) fireEvent.keyDown(d, { key: 'ArrowRight' });
    expect(screen.getByRole('heading', { level: 2, name: 'Your money stays yours.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore on my own' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set up my month' }));
    expect(await screen.findByText('welcome-setup')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Welcome to FinatriX' })).toBeNull();
  });

  it('replays on request, even after it was seen', async () => {
    localStorage.setItem(WALKTHROUGH_SEEN_KEY, '1');
    renderShell('/tools/settings');
    expect(await screen.findByText('tool-content')).toBeInTheDocument();
    act(() => replayWalkthrough());
    const d = await dialog();
    for (let i = 0; i < 3; i++) fireEvent.keyDown(d, { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Welcome to FinatriX' })).toBeNull());
    expect(screen.getByText('tool-content')).toBeInTheDocument();
  });

  it('shows illustrative figures in the user’s currency', async () => {
    localStorage.setItem('fx_currency', 'GBP');
    // A stored currency counts as saved data (hasAnyData), so a first run
    // cannot carry one — exercise the formatting through replay instead.
    localStorage.setItem(WALKTHROUGH_SEEN_KEY, '1');
    renderShell('/tools/dashboard');
    expect(await screen.findByText('dashboard-content')).toBeInTheDocument();
    act(() => replayWalkthrough());
    const d = await dialog();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(d).toHaveTextContent('“14 lunch card”');
    expect(d.textContent).not.toContain('₹');
  });
});
