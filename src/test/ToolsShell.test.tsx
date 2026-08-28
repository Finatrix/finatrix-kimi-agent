import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import ToolsLayout from '../tools/ToolsLayout';
import { TOOLS } from '../lib/tools';

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

  it('mounts the unified shell: brand, every tool tab, currency selector', async () => {
    renderShell('/tools/budget');
    // Brand appears in the app bar.
    expect(screen.getAllByText('FinatriX').length).toBeGreaterThan(0);
    // Every tool is present in the nav, under the SHORT label the landing page
    // uses — the bar carries twelve destinations and the full names put it on a
    // second line at every realistic desktop width.
    const nav = document.querySelector('#mainNav') as HTMLElement;
    for (const t of TOOLS) {
      expect(within(nav).getByText(t.short)).toBeInTheDocument();
    }
    // …plus the screens that only exist behind sign-in.
    for (const label of ['Dashboard', 'Reports', 'Calendar', 'Careers']) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
    // Currency selector defaults to INR. There are TWO in the DOM by design —
    // one in the header for a real screen and one in the drawer for a phone,
    // because the two live in different subtrees and CSS shows exactly one.
    const currency = screen.getAllByLabelText('Display currency');
    expect(currency).toHaveLength(2);
    for (const sel of currency) expect(sel).toHaveValue('INR');
    // The routed tool content renders once the sync gate opens.
    expect(await screen.findByText('tool-outlet-content')).toBeInTheDocument();
  });

  it('marks the active tool tab', async () => {
    renderShell('/tools/lifemap');
    await screen.findByText('tool-outlet-content');
    const active = document.querySelector('.fx-navpills a.on');
    expect(active?.textContent).toBe('LifeMap');
  });
});
