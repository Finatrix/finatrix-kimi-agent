import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Disclosure } from '../tools/ui/Disclosure';

/**
 * The show/hide primitive used for secondary information on every tool page.
 * These are the properties that make it a disclosure rather than a div that
 * happens to toggle: the state is exposed to assistive technology, the
 * collapsed content takes no space, and a link into it still lands.
 */
function renderDisclosure(path = '/tools/budget', onToggle?: (open: boolean) => void) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Disclosure showLabel="Show calculation & details" hideLabel="Hide calculation & details" onToggle={onToggle}>
        <h3 id="methodology">How this is calculated</h3>
        <p>Needs, wants and savings as shares of take-home pay.</p>
      </Disclosure>
    </MemoryRouter>,
  );
}

describe('Disclosure', () => {
  beforeEach(() => {
    cleanup();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('is collapsed by default, with the state on the button and the content hidden', () => {
    renderDisclosure();
    const button = screen.getByRole('button', { name: 'Show calculation & details' });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    const region = document.getElementById(button.getAttribute('aria-controls') ?? '');
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute('hidden');
    // Hidden content is out of the accessibility tree, not merely clipped.
    expect(screen.queryByRole('heading', { name: 'How this is calculated' })).not.toBeInTheDocument();
  });

  it('opens and closes, changing its label and its expanded state together', () => {
    const onToggle = vi.fn();
    renderDisclosure('/tools/budget', onToggle);

    fireEvent.click(screen.getByRole('button', { name: 'Show calculation & details' }));
    const open = screen.getByRole('button', { name: 'Hide calculation & details' });
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'How this is calculated' })).toBeVisible();
    expect(onToggle).toHaveBeenLastCalledWith(true);

    fireEvent.click(open);
    expect(screen.getByRole('button', { name: 'Show calculation & details' })).toHaveAttribute('aria-expanded', 'false');
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('is a native button, so Enter and Space work without custom key handling', () => {
    renderDisclosure();
    const button = screen.getByRole('button', { name: 'Show calculation & details' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('keeps focus on the button after toggling', () => {
    renderDisclosure();
    const button = screen.getByRole('button', { name: 'Show calculation & details' });
    button.focus();
    fireEvent.click(button);
    expect(document.activeElement).toBe(button);
  });

  it('opens itself when the URL fragment points inside it, and scrolls there', () => {
    renderDisclosure('/tools/budget#methodology');
    expect(screen.getByRole('button', { name: 'Hide calculation & details' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'How this is calculated' })).toBeVisible();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('ignores a fragment that points somewhere else', () => {
    renderDisclosure('/tools/budget#elsewhere');
    expect(screen.getByRole('button', { name: 'Show calculation & details' })).toHaveAttribute('aria-expanded', 'false');
  });
});
