import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { CurrencyProvider } from '../tools/CurrencyContext';
import CommandPalette from '../tools/ui/CommandPalette';

/** Reports the live URL so a command's navigation can be asserted on. */
function Here() {
  const { pathname, search } = useLocation();
  return <span data-testid="here">{pathname + search}</span>;
}

function renderPalette(onClose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/tools/budget']}>
      <AuthProvider>
        <ThemeProvider>
          <CurrencyProvider>
            <Routes>
              <Route path="*" element={<Here />} />
            </Routes>
            <CommandPalette onClose={onClose} />
          </CurrencyProvider>
        </ThemeProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
  return { onClose, input: screen.getByRole('combobox') };
}

const activeOption = () => {
  const id = screen.getByRole('combobox').getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
};

const here = () => screen.getByTestId('here').textContent;

describe('CommandPalette', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('opens as a labelled modal dialog with a combobox wired to its listbox', () => {
    const { input } = renderPalette();
    const dialog = screen.getByRole('dialog', { name: 'Command palette' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', input.getAttribute('aria-controls'));
    const list = document.getElementById(input.getAttribute('aria-controls')!);
    expect(list).toHaveAttribute('role', 'listbox');
    expect(within(list!).getAllByRole('option').length).toBeGreaterThan(0);
  });

  /**
   * The palette portals to <body>, so it leaves the `.fx-tools` element that
   * declares --card-solid, --hair, --ink3 and --gold-bg. Without the scope
   * classes the panel's background resolved to `transparent`: hidden by the
   * scrim on dark, and on light the page read straight through it.
   */
  it('renders its portal inside the tools token scope', () => {
    renderPalette();
    const overlay = screen.getByRole('dialog', { name: 'Command palette' }).parentElement!;
    expect(overlay).toHaveClass('fx-tools');
    expect(overlay).toHaveClass('fx-scope');
    expect(overlay.parentElement).toBe(document.body);
  });

  it('offers a useful resting list before anything is typed', () => {
    renderPalette();
    expect(screen.getByRole('option', { name: /Log a spend/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Budget Builder/ })).toBeInTheDocument();
    // The thirty-nine currency switches stay out of the way until asked for.
    expect(screen.queryByRole('option', { name: /Display in USD/ })).not.toBeInTheDocument();
  });

  it('moves the active option with the arrow keys, and wraps at both ends', () => {
    const { input } = renderPalette();
    const first = activeOption()?.textContent;
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const second = activeOption()?.textContent;
    expect(second).not.toBe(first);
    expect(activeOption()).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(activeOption()?.textContent).toBe(first);
    // Up from the top wraps to the last result rather than dead-ending.
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const options = screen.getAllByRole('option');
    expect(activeOption()).toBe(options[options.length - 1]);
    fireEvent.keyDown(input, { key: 'Home' });
    expect(activeOption()).toBe(options[0]);
  });

  it('exposes exactly one selected option at a time', () => {
    const { input } = renderPalette();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const selected = screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
  });

  it('filters to what was typed, and says so when nothing matches', () => {
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: 'lifemap' } });
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('LifeMap');

    fireEvent.change(input, { target: { value: 'zzzqqq' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });

  it('navigates on Enter and closes itself', () => {
    const onClose = vi.fn();
    const { input } = renderPalette(onClose);
    fireEvent.change(input, { target: { value: 'parksmart' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(here()).toBe('/tools/parksmart');
    expect(onClose).toHaveBeenCalled();
  });

  it('navigates on click, for everyone not using a keyboard', () => {
    const onClose = vi.fn();
    renderPalette(onClose);
    fireEvent.click(screen.getByRole('option', { name: /Dashboard/ }));
    expect(here()).toBe('/tools/dashboard');
    expect(onClose).toHaveBeenCalled();
  });

  it('hands a typed spend to the Expense Tracker rather than logging it itself', () => {
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: '340 lunch yesterday upi' } });
    const first = screen.getAllByRole('option')[0];
    expect(first).toHaveTextContent('Log spend: 340 lunch yesterday upi');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(here()).toBe(`/tools/expenses?add=${encodeURIComponent('340 lunch yesterday upi')}`);
  });

  it('does not offer to log a line that is not a spend', () => {
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: 'lifemap' } });
    expect(screen.queryByText(/^Log spend:/)).not.toBeInTheDocument();
  });

  it('switches the display currency in place, without leaving the page', () => {
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: 'usd' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(localStorage.getItem('fx_currency')).toBe('USD');
    expect(here()).toBe('/tools/budget');
  });

  it('switches the theme in place', () => {
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: 'theme' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(['light', 'dark']).toContain(localStorage.getItem('fx_theme'));
    expect(document.documentElement.getAttribute('data-theme')).toBe(localStorage.getItem('fx_theme'));
  });

  it('closes on Escape and on a click outside the panel', () => {
    const onClose = vi.fn();
    const { input } = renderPalette(onClose);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    const overlay = screen.getByRole('dialog').parentElement!;
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('stays open when the click lands inside the panel', () => {
    const onClose = vi.fn();
    renderPalette(onClose);
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps Tab inside the dialog', () => {
    const { input } = renderPalette();
    input.focus();
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Esc' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(input);
  });

  it('announces the number of results to assistive tech', () => {
    const { input } = renderPalette();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/\d+ results?/);
    fireEvent.change(input, { target: { value: 'zzzqqq' } });
    expect(status).toHaveTextContent('No results');
  });

  it('remembers what was run and offers it first next time', () => {
    const onClose = vi.fn();
    const { input } = renderPalette(onClose);
    fireEvent.change(input, { target: { value: 'peercompare' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    cleanup();

    renderPalette();
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('PeerCompare');
  });
});

/**
 * The shortcut and its visible trigger, in the shell that owns them. The panel
 * is a lazy chunk, so every assertion here waits for it to resolve.
 */
describe('CommandPalette in the tools shell', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  async function renderShell() {
    const ToolsLayout = (await import('../tools/ToolsLayout')).default;
    render(
      <MemoryRouter initialEntries={['/tools/budget']}>
        <AuthProvider>
          <ThemeProvider>
            <Routes>
              <Route path="/tools" element={<ToolsLayout />}>
                <Route path=":toolId" element={<Here />} />
              </Route>
            </Routes>
          </ThemeProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it('opens on ⌘K and closes on a second press', async () => {
    await renderShell();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('opens on Ctrl+K for everyone not on a Mac', async () => {
    await renderShell();
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true });
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });

  it('ignores a bare k, so typing never hijacks the page', async () => {
    await renderShell();
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('has a visible trigger that names its own shortcut', async () => {
    await renderShell();
    const trigger = screen.getByRole('button', { name: 'Search tools, guides and actions' });
    expect(trigger).toHaveAttribute('aria-keyshortcuts');
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });

  it('returns focus to the trigger when the palette is dismissed', async () => {
    await renderShell();
    const trigger = screen.getByRole('button', { name: 'Search tools, guides and actions' });
    // fireEvent.click does not focus its target the way a real pointer does;
    // focusing first is what makes this the case the code actually handles.
    trigger.focus();
    fireEvent.click(trigger);
    // The shell's own currency <select> is a combobox too, so this one is
    // addressed by its accessible name.
    const input = await screen.findByRole('combobox', { name: 'Search tools, guides and actions' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });
});

/**
 * The Careers workspace has no CurrencyProvider — a palette that threw there
 * would be a shell-level control that works on half the product.
 */
describe('CommandPalette on the Careers surface', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  function renderCareersPalette(onClose = vi.fn()) {
    render(
      <MemoryRouter initialEntries={['/careers/dashboard']}>
        <AuthProvider>
          <ThemeProvider>
            <Routes>
              <Route path="*" element={<Here />} />
            </Routes>
            <CommandPalette onClose={onClose} surface="careers" />
          </ThemeProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    return { onClose, input: screen.getByRole('combobox') };
  }

  it('renders without a currency provider, and offers no currency switch', () => {
    const { input } = renderCareersPalette();
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'rupee' } });
    expect(screen.queryByRole('option', { name: /Display in/ })).not.toBeInTheDocument();
  });

  it('opens on the Careers sections rather than the calculators', () => {
    renderCareersPalette();
    expect(screen.getByRole('option', { name: /Job Search/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Budget Builder/ })).not.toBeInTheDocument();
  });

  it('still reaches the calculators when asked for one', () => {
    const { input } = renderCareersPalette();
    fireEvent.change(input, { target: { value: 'budget' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(here()).toBe('/tools/budget');
  });

  it('reaches a section that the Careers tab bar does not show', () => {
    const { input } = renderCareersPalette();
    fireEvent.change(input, { target: { value: 'offers' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(here()).toBe('/careers/offers');
  });
});
