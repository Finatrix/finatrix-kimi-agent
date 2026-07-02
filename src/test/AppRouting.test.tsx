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

describe('tools routing (through the real App)', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('renders the native React Budget page at /tools/budget', async () => {
    renderApp('/tools/budget');
    expect(await screen.findByText('The 50/30/20 rule, made effortless.')).toBeInTheDocument();
  });

  it('renders the native React LifeMap page (all tools migrated)', async () => {
    renderApp('/tools/lifemap');
    expect(await screen.findByText('Simulate your entire financial life.')).toBeInTheDocument();
  });

  it('redirects /tools to a concrete tool route', async () => {
    renderApp('/tools');
    // Index redirects to the last-used tool (budget by default).
    expect(await screen.findByText('The 50/30/20 rule, made effortless.')).toBeInTheDocument();
  });
});
