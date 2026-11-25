/**
 * Pressing Import when the importer's chunk cannot be fetched.
 *
 * This is the defect that was reported as "the Import button is not working":
 * on a tab opened before a deploy (or with no connection) the chunk 404s, and
 * the rejected import used to be thrown at the app's only error boundary,
 * replacing the whole app with the error screen.
 *
 * Kept in its own file, in this order, on purpose. The mock below throws to
 * make the dynamic import reject; a module that has loaded successfully once is
 * cached for the rest of the file, so every failing case runs before the one
 * case that lets it succeed.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CurrencyProvider } from '../tools/CurrencyContext';
import { ToastProvider } from '../tools/ui/Toast';

const h = vi.hoisted(() => ({
  failImport: true,
  reloadIfBuildIsStale: vi.fn(async () => false),
}));

vi.mock('../tools/ui/StatementImport', () => {
  if (h.failImport) throw new TypeError('Failed to fetch dynamically imported module');
  return { default: () => <div role="dialog" aria-label="Import a statement">sheet</div> };
});

vi.mock('../lib/chunkRecovery', () => ({ reloadIfBuildIsStale: h.reloadIfBuildIsStale }));

import ExpensePage from '../tools/pages/ExpensePage';

function renderPage() {
  return render(
    <MemoryRouter>
      <CurrencyProvider>
        <ToastProvider>
          <ExpensePage />
        </ToastProvider>
      </CurrencyProvider>
    </MemoryRouter>,
  );
}

const importButton = () => screen.getByRole('button', { name: 'Import' });
const toastText = () => screen.queryAllByRole('status').map((el) => el.textContent ?? '').join(' | ');

beforeEach(() => {
  localStorage.clear();
  h.failImport = true;
  h.reloadIfBuildIsStale.mockReset().mockResolvedValue(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('pressing Import when the importer cannot be loaded', () => {
  it('keeps the page alive and says why', async () => {
    renderPage();
    fireEvent.click(importButton());

    await waitFor(() => expect(toastText()).toMatch(/Import could not be loaded/));
    // The app is still here: this used to be the whole-app error screen.
    expect(screen.getByText('Your money, tracked and understood.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(importButton()).not.toHaveAttribute('aria-busy');
  });

  it('names the connection when there is none', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderPage();
    fireEvent.click(importButton());

    await waitFor(() => expect(toastText()).toMatch(/needs a connection the first time/));
  });

  it('stays quiet when the page is already reloading onto the current build', async () => {
    h.reloadIfBuildIsStale.mockResolvedValue(true);
    renderPage();
    fireEvent.click(importButton());

    await waitFor(() => expect(h.reloadIfBuildIsStale).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(importButton()).not.toHaveAttribute('aria-busy'));
    expect(toastText()).not.toMatch(/could not be loaded|needs a connection/);
  });

  it('shows it is working while the chunk is on its way, and ignores a second press', async () => {
    renderPage();
    fireEvent.click(importButton());
    expect(importButton()).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(importButton());

    await waitFor(() => expect(importButton()).not.toHaveAttribute('aria-busy'));
    // One attempt, one message.
    expect(screen.queryAllByRole('status').filter((el) => /could not be loaded/.test(el.textContent ?? ''))).toHaveLength(1);
  });

  // Last: once the chunk has loaded it stays loaded for the rest of this file.
  it('can be pressed again once the chunk is reachable', async () => {
    renderPage();
    fireEvent.click(importButton());
    await waitFor(() => expect(toastText()).toMatch(/could not be loaded/));

    // A failed load must not be remembered. Handing the rejection to `lazy`
    // would have cached it until the page was reloaded.
    h.failImport = false;
    fireEvent.click(importButton());
    expect(await screen.findByRole('dialog', { name: 'Import a statement' })).toBeInTheDocument();
  });
});
