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
  it('offers a dashboard and the tool index, with honestly labelled sample data', () => {
    render(wrap(<LandingHero />));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('See where your money goes.');
    expect(screen.getByRole('link', { name: /Open your dashboard/i })).toHaveAttribute('href', '/tools/dashboard');
    // The secondary CTA is the guest-accessible tool index, not the onboarding
    // flow: someone who has not decided yet wants to see what is on offer, and
    // guided setup is one click further in, from the dashboard's empty state.
    expect(screen.getByRole('link', { name: /Explore the tools/i })).toHaveAttribute('href', '/tools');
    expect(screen.getByText(/Example figures/)).toBeInTheDocument();
    expect(screen.getByText(/Careers is a separate paid workspace/)).toBeInTheDocument();
  });

  it('names the four markets in the lede the market examples deliver on', () => {
    render(wrap(<LandingHero />));
    expect(screen.getByText(/India, the US, the UK and the UAE/)).toBeInTheDocument();
  });
});
