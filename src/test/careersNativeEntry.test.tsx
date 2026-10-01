import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { CAREERS_AVAILABLE } from '../shared/careersAvailability';
import { showCareersEntry } from '../lib/careersEntry';
import { buildCommands, type CommandContext } from '../tools/lib/commands';
import { NavPills } from '../components/NavPills';
import LandingFooter from '../sections/LandingFooter';
import CareersAvailability from '../pages/careers/CareersAvailability';

// The website's launch page renders inside PageShell, which reads the account.
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: null, session: null, loading: false, configured: false, signOut: vi.fn() }),
}));

/**
 * Careers is unlaunched ("coming in 2027"). The website says so on purpose; the
 * store binaries must not — an entry point to a placeholder is an unfinished
 * feature to App Review (2.1) and Play. These tests pin every surface an app
 * user could reach Careers from, and that the website keeps its announcement.
 */

function enterApp(platform: 'android' | 'ios') {
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => platform,
  };
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
});

const CTX: CommandContext = { signedIn: false, currency: 'INR', theme: 'dark', surface: 'careers' };

describe.skipIf(CAREERS_AVAILABLE)('Careers entry points before launch', () => {
  describe.each(['android', 'ios'] as const)('in the %s app', (platform) => {
    it('offers no way in from the gate itself', () => {
      enterApp(platform);
      expect(showCareersEntry()).toBe(false);
    });

    it('has no Careers pill in either navigation row', () => {
      enterApp(platform);
      render(<MemoryRouter><NavPills variant="app" /><NavPills variant="marketing" /></MemoryRouter>);
      expect(screen.queryByText(/careers/i)).toBeNull();
    });

    it('has no Careers command in the palette, even in the Careers surface', () => {
      enterApp(platform);
      expect(buildCommands(CTX).some((c) => c.group === 'Careers')).toBe(false);
    });

    it('has no Careers or pricing link in the footer, but keeps the rest', () => {
      enterApp(platform);
      render(<MemoryRouter><LandingFooter /></MemoryRouter>);
      expect(screen.queryByText(/coming in/i)).toBeNull();
      expect(screen.queryByRole('link', { name: /^pricing$/i })).toBeNull();
      expect(screen.queryByRole('link', { name: /^features$/i })).toBeNull();
      expect(screen.getByRole('link', { name: /^privacy$/i })).toBeInTheDocument();
    });

    it('sends a stray Careers link to the dashboard instead of a "coming soon" page', () => {
      enterApp(platform);
      render(
        <MemoryRouter initialEntries={['/careers/jobs']}>
          <Routes>
            <Route element={<CareersAvailability />}>
              <Route path="/careers/jobs" element={<p>jobs</p>} />
            </Route>
            <Route path="/tools/dashboard" element={<p>dashboard</p>} />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getByText('dashboard')).toBeInTheDocument();
      expect(screen.queryByText(/coming in/i)).toBeNull();
    });
  });

  describe('on the website', () => {
    it('still announces Careers in the navigation, palette and footer', () => {
      expect(showCareersEntry()).toBe(true);
      render(<MemoryRouter><NavPills variant="marketing" /><LandingFooter /></MemoryRouter>);
      expect(screen.getAllByText(/careers/i).length).toBeGreaterThan(0);
      expect(buildCommands(CTX).some((c) => c.id === 'careers:coming-soon')).toBe(true);
    });

    it('still shows the launch page for a Careers URL', () => {
      render(
        <MemoryRouter initialEntries={['/careers/jobs']}>
          <Routes>
            <Route element={<CareersAvailability />}>
              <Route path="/careers/jobs" element={<p>jobs</p>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getAllByText(/coming in/i).length).toBeGreaterThan(0);
    });
  });
});
