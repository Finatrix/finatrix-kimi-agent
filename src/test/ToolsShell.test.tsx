import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import ToolsLayout from '../tools/ToolsLayout';

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/tools" element={<ToolsLayout />}>
            <Route path=":toolId" element={<div>tool-outlet-content</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('ToolsLayout shell', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('mounts the unified shell: brand, all seven tool tabs, currency selector', async () => {
    renderShell('/tools/budget');
    // Brand appears in the app bar.
    expect(screen.getAllByText('FinatriX').length).toBeGreaterThan(0);
    // All seven tools are present in the nav.
    for (const name of ['Budget Builder', 'Expense Tracker', 'InvestMatch', 'ParkSmart', 'PeerCompare', 'Reverse Goal Planner', 'LifeMap']) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    // Currency selector defaults to INR.
    expect(screen.getByLabelText('Display currency')).toHaveValue('INR');
    // The routed tool content renders once the sync gate opens.
    expect(await screen.findByText('tool-outlet-content')).toBeInTheDocument();
  });

  it('marks the active tool tab', async () => {
    renderShell('/tools/lifemap');
    await screen.findByText('tool-outlet-content');
    const active = document.querySelector('.nav a.on');
    expect(active?.textContent).toBe('LifeMap');
  });
});
