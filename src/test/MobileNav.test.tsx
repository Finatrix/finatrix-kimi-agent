import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import App from '../App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Mobile bottom navigation', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('exposes thumb-reachable quick access to the hub and core money tools', async () => {
    renderAt('/tools/expenses');
    const bar = await screen.findByRole('navigation', { name: 'Primary' });
    // Dashboard is always reachable, plus the three core money tools + More.
    for (const label of ['Dashboard', 'Budget', 'Expenses', 'Goals', 'More']) {
      expect(within(bar).getByText(label)).toBeInTheDocument();
    }
  });

  it('marks the active tool with aria-current and never hides functionality', async () => {
    renderAt('/tools/expenses');
    const bar = await screen.findByRole('navigation', { name: 'Primary' });
    // The Expenses quick-link is the current page.
    const current = within(bar).getByText('Expenses').closest('a');
    expect(current).toHaveAttribute('aria-current', 'page');
    // "More" is a real control that opens the full drawer (nothing hidden).
    const more = within(bar).getByRole('button', { name: /More tools and menu/i });
    expect(more).toHaveAttribute('aria-haspopup', 'dialog');
  });
});
