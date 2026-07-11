/**
 * Design-system primitive contracts. These pin the behaviours that let call
 * sites migrate safely: variant → canonical class, verbatim className passthrough,
 * an explicit default button type, and forwarded a11y/handler props.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Button from '../components/Button';
import Badge from '../components/Badge';

describe('Button', () => {
  it('renders a real <button> with an explicit type="button" by default', () => {
    render(<Button>Go</Button>);
    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('maps variants to their canonical class and appends className verbatim', () => {
    const { rerender } = render(<Button variant="gold" className="w-full py-3.5">A</Button>);
    expect(screen.getByRole('button').className).toBe('fx-btn-gold w-full py-3.5');
    rerender(<Button variant="ghost" className="w-full">B</Button>);
    expect(screen.getByRole('button').className).toBe('fx-btn-ghost w-full');
    rerender(<Button variant="plain" className="text-[#8A8A8A]">C</Button>);
    expect(screen.getByRole('button').className).toBe('text-[#8A8A8A]');
  });

  it('forwards handlers and a11y props, and honours an explicit type', () => {
    const onClick = vi.fn();
    render(<Button type="submit" aria-label="Save" onClick={onClick}>x</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toHaveAttribute('type', 'submit');
    btn.click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('Badge', () => {
  it('renders a span with tone-driven colour tokens and appends className', () => {
    render(<Badge tone="gold" className="ml-2">New</Badge>);
    const el = screen.getByText('New');
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toContain('ml-2');
    expect(el.getAttribute('style')).toContain('var(--accent)');
  });

  it('passes through role for live-status badges', () => {
    render(<Badge role="status">Saved</Badge>);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });
});
