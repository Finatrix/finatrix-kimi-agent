import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import LandingHero from '../sections/LandingHero';

afterEach(cleanup);

describe('LandingHero — product positioning', () => {
  it('explains market coverage, data choices and paid product scope', () => {
    render(<MemoryRouter><LandingHero /></MemoryRouter>);
    // The market count leads: it is the claim that distinguishes the product,
    // and it is now backed by real per-market instruments and benchmarks.
    expect(screen.getByText('Seven market settings, including Australia, Singapore and Mainland China.')).toBeInTheDocument();
    expect(screen.getByText('Local guest records, optional account sync.')).toBeInTheDocument();
    expect(screen.getByText(/Careers is a separate paid workspace/)).toBeInTheDocument();
  });

  it('removes the retired "₹0 Forever" and "14 Indian cities" indicators', () => {
    render(<MemoryRouter><LandingHero /></MemoryRouter>);
    expect(screen.queryByText('₹0')).not.toBeInTheDocument();
    expect(screen.queryByText(/Indian cities/)).not.toBeInTheDocument();
    expect(screen.queryByText('14')).not.toBeInTheDocument();
  });
});
