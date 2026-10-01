import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import App from '../App';
import { CAREERS_ROUTES } from '../careers/constants';
import { PlanCard } from '../marketing/PlanCards';
import { CAREERS_PLANS } from '../shared/plans';
import { CAREERS_AVAILABLE } from '../shared/careersAvailability';
import { seoForPath, structuredDataForPath } from '../lib/seo';

afterEach(cleanup);

describe('Careers launch lock', () => {
  it('is explicitly locked, independent of the date on the device', () => {
    expect(CAREERS_AVAILABLE).toBe(false);
  });
  it.each([...new Set(['/careers', '/careers/features', '/careers/compare/linkedin', ...Object.values(CAREERS_ROUTES)])])(
    'locks direct access to %s before mounting the workspace', async (path) => {
      render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('coming in 2027');
      expect(screen.queryByText(/Sign in to use Careers/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /checkout|purchase/i })).not.toBeInTheDocument();
    },
  );
  it('does not expose paid purchase actions', () => {
    const onSelect = vi.fn();
    render(<MemoryRouter><ul><PlanCard plan={CAREERS_PLANS[0]} period="monthly" cta={{ kind: 'action', onSelect }} /></ul></MemoryRouter>);
    expect(screen.getByText(/coming in 2027/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('does not advertise Careers features from the money dashboard while locked', async () => {
    render(<MemoryRouter initialEntries={['/tools/dashboard']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
    // The dashboard itself, not a loading shell — so the absence below means something.
    expect(await screen.findByRole('heading', { name: /your money, this month/i })).toBeInTheDocument();
    expect(await screen.findByText(/Computed privately on your device/)).toBeInTheDocument();
    expect(screen.queryByText(/Track your resume, ATS score/)).not.toBeInTheDocument();
  });
  it('hides premature pricing and deep-page search listings', async () => {
    render(<MemoryRouter initialEntries={['/pricing']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: /coming in 2027/ })).toBeInTheDocument();
    expect(screen.queryByText('₹199')).not.toBeInTheDocument();
    expect(seoForPath('/careers/jobs').robots).toBe('noindex, nofollow');
    expect(structuredDataForPath('/careers/features')).toBeNull();
  });
});
