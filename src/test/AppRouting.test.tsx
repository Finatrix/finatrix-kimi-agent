import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import App from '../App';

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
}

// Lazy route chunks can take well over the 1s default async-query timeout when
// the full suite runs in parallel workers; a generous timeout keeps these
// deterministic without slowing the passing case.
const LAZY = { timeout: 8000 };

describe('tools routing (through the real App)', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('renders the native React Budget page at /tools/budget', async () => {
    renderApp('/tools/budget');
    expect(await screen.findByText('The 50/30/20 rule, made effortless.', undefined, LAZY)).toBeInTheDocument();
  }, 15000);

  it('renders the native React LifeMap page (all tools migrated)', async () => {
    renderApp('/tools/lifemap');
    expect(await screen.findByText('Simulate your entire financial life.', undefined, LAZY)).toBeInTheDocument();
  }, 15000);

  it('redirects /tools to the dashboard hub by default', async () => {
    renderApp('/tools');
    // New visitors (no last-used tool) land on the unified dashboard hub.
    expect(await screen.findByText('Your financial journey', undefined, LAZY)).toBeInTheDocument();
  }, 15000);
});
