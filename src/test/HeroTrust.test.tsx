import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import LandingHero from '../sections/LandingHero';
import { CURRENCY_COUNT } from '../tools/lib/format';

afterEach(cleanup);

describe('LandingHero — V4 trust strip', () => {
  it('shows the dynamic currency count and new trust indicators', () => {
    render(<MemoryRouter><LandingHero /></MemoryRouter>);
    expect(screen.getByText(`${CURRENCY_COUNT} currencies`)).toBeInTheDocument();
    expect(screen.getByText('Made in India 🇮🇳')).toBeInTheDocument();
    expect(screen.getByText('Privacy first')).toBeInTheDocument();
    expect(screen.getByText('Education first')).toBeInTheDocument();
    expect(screen.getByText('Free forever')).toBeInTheDocument();
    expect(screen.getByText('Real-time calculations')).toBeInTheDocument();
  });

  it('removes the retired "₹0 Forever" and "14 Indian cities" indicators', () => {
    render(<MemoryRouter><LandingHero /></MemoryRouter>);
    expect(screen.queryByText('₹0')).not.toBeInTheDocument();
    expect(screen.queryByText(/Indian cities/)).not.toBeInTheDocument();
    expect(screen.queryByText('14')).not.toBeInTheDocument();
  });
});
