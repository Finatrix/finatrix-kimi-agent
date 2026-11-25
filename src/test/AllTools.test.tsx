import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import AppearanceMenu from '../components/AppearanceMenu';
import App from '../App';
import { TOOLS } from '../lib/tools';

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

/**
 * All tools is the fifth tab: the page that took over everything the drawer
 * held. Nothing the drawer offered may be lost — every tool, Reports,
 * Calendar, Settings, the legal pages, and the display settings.
 */
describe('All tools page', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('lists every tool and every page the old drawer offered', async () => {
    renderApp('/tools/all');
    const heading = await screen.findByRole('heading', { level: 1, name: 'All tools' });
    // Scoped to the page: the desktop tool bar is in the DOM too (hidden on a phone).
    const hub = within(heading.closest('.fx-hub') as HTMLElement);
    for (const t of TOOLS) {
      expect(hub.getByRole('link', { name: new RegExp(`^${t.name}`) })).toHaveAttribute('href', t.href);
    }
    for (const [name, href] of [['Reports', '/tools/reports'], ['Calendar', '/tools/calendar'], ['Settings', '/tools/settings'], ['Privacy', '/privacy'], ['Terms', '/terms']] as const) {
      expect(hub.getByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute('href', href);
    }
    expect(hub.getByRole('combobox', { name: 'Display currency' })).toBeInTheDocument();
  });

  it('offers Light, Dark and System, with System chosen until someone picks', async () => {
    renderApp('/tools/all');
    const group = await screen.findByRole('radiogroup', { name: 'Appearance' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['Light', 'Dark', 'System']);
    expect(within(group).getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(within(group).getByRole('radio', { name: 'Dark' }));
    expect(within(group).getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('fx_theme')).toBe('dark');

    // Arrow keys move the choice (WAI-APG radio group), with one tab stop.
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(within(group).getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
    expect(within(group).getByRole('radio', { name: 'System' })).toHaveFocus();
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    // System follows the device, which removes the stored choice.
    expect(localStorage.getItem('fx_theme')).toBeNull();
  });
});

describe('Appearance menu', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('is a menu button with three radio items, and Escape returns focus', async () => {
    render(<ThemeProvider><AppearanceMenu /></ThemeProvider>);
    const trigger = screen.getByRole('button', { name: 'Appearance: System' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Appearance' });
    expect(within(menu).getAllByRole('menuitemradio').map((i) => i.textContent)).toEqual(['Light', 'Dark', 'System']);
    expect(within(menu).getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');

    trigger.focus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('applies the choice and closes', async () => {
    render(<ThemeProvider><AppearanceMenu /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Appearance: System' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'Light' }));
    });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'Appearance: Light' })).toBeInTheDocument();
    expect(localStorage.getItem('fx_theme')).toBe('light');
  });
});
