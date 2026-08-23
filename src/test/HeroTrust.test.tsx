import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import LandingHero from '../sections/LandingHero';
import { CURRENCY_COUNT } from '../tools/lib/format';
import { TOOL_COUNT_WORD_CAP } from '../shared/toolCount';

afterEach(cleanup);

describe('LandingHero — V4 trust strip', () => {
  it('shows the dynamic currency count and new trust indicators', () => {
    render(<MemoryRouter><LandingHero /></MemoryRouter>);
    expect(screen.getByText(`${CURRENCY_COUNT} currencies`)).toBeInTheDocument();
    expect(screen.getByText('Made in India 🇮🇳')).toBeInTheDocument();
    expect(screen.getByText('Privacy first')).toBeInTheDocument();
    expect(screen.getByText('Education first')).toBeInTheDocument();
    // Scoped, not bare: the same viewport sells a paid Careers subscription,
    // so an unqualified "Free forever" would read as covering it too.
    expect(screen.getByText('Money tools free forever')).toBeInTheDocument();
    expect(screen.queryByText('Free forever')).not.toBeInTheDocument();
    expect(screen.getByText('Real-time calculations')).toBeInTheDocument();
  });

  it('removes the retired "₹0 Forever" and "14 Indian cities" indicators', () => {
    render(<MemoryRouter><LandingHero /></MemoryRouter>);
    expect(screen.queryByText('₹0')).not.toBeInTheDocument();
    expect(screen.queryByText(/Indian cities/)).not.toBeInTheDocument();
    expect(screen.queryByText('14')).not.toBeInTheDocument();
  });
});

/**
 * The homepage h1.
 *
 * It was the single word "FinatriX": the strongest heading signal on the
 * highest-authority page of the site, saying nothing about money, India or
 * budgeting. It also carried `fx-in` with a 0.78s stagger delay and
 * `animation-fill-mode: backwards`, holding the almost-certain LCP element at
 * opacity 0 for the better part of a second and a half before it painted.
 */
describe('LandingHero — the h1 carries the proposition', () => {
  it('has exactly one h1', () => {
    render(<MemoryRouter><LandingHero /></MemoryRouter>);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('names what the site is, not only what it is called', () => {
    render(<MemoryRouter><LandingHero /></MemoryRouter>);
    const h1 = screen.getByRole('heading', { level: 1 });
    const text = h1.textContent ?? '';
    expect(text).toContain('FinatriX');
    expect(text).toMatch(/money tools/i);
    expect(text).toMatch(/India/i);
    expect(text).toContain(TOOL_COUNT_WORD_CAP);
    // A brand name alone is what this replaced.
    expect(text.trim()).not.toBe('FinatriX');
  });

  it('does not delay the headline behind an entrance animation', () => {
    render(<MemoryRouter><LandingHero /></MemoryRouter>);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.className).not.toContain('fx-in');
    expect(h1.getAttribute('style') ?? '').not.toContain('animation-delay');
  });
});

/**
 * Two hero subtitles described something other than the tool underneath them.
 */
describe('LandingHero — tile subtitles describe the tool', () => {
  it('does not describe ParkSmart as a parking app', () => {
    render(<MemoryRouter><LandingHero /></MemoryRouter>);
    expect(screen.queryByText(/Smart parking made simple/i)).not.toBeInTheDocument();
    expect(screen.getByText(/post-tax home for idle cash/i)).toBeInTheDocument();
  });
});
