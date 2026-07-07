import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import { TOOLS } from '../lib/tools';
import LandingNav from '../sections/LandingNav';
import LandingHero from '../sections/LandingHero';

function wrap(ui: React.ReactNode) {
  return (
    <MemoryRouter>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

describe('Landing nav', () => {
  it('renders a tab for every tool pointing at the right deep-link', () => {
    render(wrap(<LandingNav />));
    for (const t of TOOLS) {
      const links = screen.getAllByRole('link', { name: t.short });
      expect(links.length).toBeGreaterThan(0);
      expect(links[0]).toHaveAttribute('href', t.href);
    }
    expect(screen.getByRole('link', { name: /open tools/i })).toHaveAttribute(
      'href',
      '/tools'
    );
  });
});

describe('Landing hero', () => {
  it('shows the wordmark, every tool card, the Careers spotlight card, and the logo hub', () => {
    render(wrap(<LandingHero />));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('FinatriX');
    // Every tool has a card linking to its route (label is "Name — subtitle").
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    for (const t of TOOLS) {
      expect(hrefs).toContain(t.href);
    }
    // The eighth cell is the premium FinatriX Careers spotlight (AI Powered badge, links to /careers).
    expect(screen.getByText('FinatriX Careers')).toBeInTheDocument();
    expect(screen.getByText('AI Powered')).toBeInTheDocument();
    expect(hrefs).toContain('/careers');
    expect(screen.getByRole('link', { name: /open all tools/i })).toHaveAttribute('href', '/tools');
  });
});
