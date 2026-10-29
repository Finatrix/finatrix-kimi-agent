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

/**
 * The phone's one navigation system: a five-tab bar where every tab is a real
 * page. It replaced a hamburger drawer plus a "More" tab that opened the same
 * drawer (Apple HIG, tab-bars.md: avoid overflow tabs).
 */
describe('Mobile bottom navigation', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('has five destinations, all links, and no overflow tab', async () => {
    renderAt('/tools/expenses');
    const bar = await screen.findByRole('navigation', { name: 'Primary' });
    const tabs = within(bar).getAllByRole('link');
    expect(tabs.map((t) => t.textContent)).toEqual(['Home', 'Budget', 'Expenses', 'Goals', 'Tools']);
    // Every tab navigates; none opens a menu.
    expect(within(bar).queryAllByRole('button')).toHaveLength(0);
    expect(within(bar).queryByText('More')).toBeNull();
    expect(within(bar).getByRole('link', { name: 'Tools' })).toHaveAttribute('href', '/tools/all');
  });

  it('marks the active tab with aria-current', async () => {
    renderAt('/tools/expenses');
    const bar = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(bar).getByRole('link', { name: 'Expenses' })).toHaveAttribute('aria-current', 'page');
    expect(within(bar).getByRole('link', { name: 'Tools' })).not.toHaveAttribute('aria-current');
  });

  it('counts the pages listed under All tools as the Tools tab', async () => {
    renderAt('/tools/settings');
    const bar = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(bar).getByRole('link', { name: 'Tools' })).toHaveAttribute('aria-current', 'page');
  });

  it('leaves no hamburger menu in the app bar', async () => {
    renderAt('/tools/expenses');
    await screen.findByRole('navigation', { name: 'Primary' });
    expect(screen.queryByRole('button', { name: /open menu/i })).toBeNull();
    expect(screen.getByRole('button', { name: /search tools, guides and actions/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'FinatriX home' })).toBeInTheDocument();
  });
});
