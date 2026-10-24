import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { User } from '@supabase/supabase-js';

type TestUser = Pick<User, 'id' | 'app_metadata' | 'user_metadata'>;

const auth = vi.hoisted(() => ({ user: null as TestUser | null, loading: false }));
const native = vi.hoisted(() => ({ app: false }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../native/platform', async (importOriginal) => ({ ...(await importOriginal<object>()), isNativeApp: () => native.app }));

import { careersAccessFor, isCareersBetaTester } from '../lib/careersAccess';
import CareersAvailability from '../pages/careers/CareersAvailability';
import { NavPills } from '../components/NavPills';
import { buildCommands } from '../tools/lib/commands';

const tester: TestUser = { id: 't', app_metadata: { provider: 'email', careers_beta: true }, user_metadata: {} };
const member: TestUser = { id: 'm', app_metadata: { provider: 'email' }, user_metadata: { careers_beta: true } };

beforeEach(() => {
  auth.user = null;
  auth.loading = false;
  native.app = false;
});
afterEach(cleanup);

describe('Careers beta access', () => {
  it('opens only for accounts the server marked, never on a user-writable flag', () => {
    expect(isCareersBetaTester(tester)).toBe(true);
    expect(isCareersBetaTester(member)).toBe(false);
    expect(isCareersBetaTester(null)).toBe(false);
    expect(careersAccessFor(tester, false)).toEqual({ open: true, beta: true, pending: false });
    expect(careersAccessFor(member, false)).toEqual({ open: false, beta: false, pending: false });
    expect(careersAccessFor(null, true)).toEqual({ open: false, beta: false, pending: true });
  });

  it('stays closed in the installed apps, which keep their pre-launch behaviour', () => {
    native.app = true;
    expect(careersAccessFor(tester, false)).toEqual({ open: false, beta: false, pending: false });
  });

  const gate = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<CareersAvailability />}>
            <Route path="/careers/dashboard" element={<h1>Careers workspace</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

  it('lets a beta tester into the workspace and keeps everyone else on the launch notice', () => {
    auth.user = tester;
    gate('/careers/dashboard');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Careers workspace');
    cleanup();

    auth.user = member;
    gate('/careers/dashboard');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('coming in 2027');
  });

  it('waits for a stored session instead of flashing the launch notice', () => {
    auth.loading = true;
    gate('/careers/dashboard');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('labels the nav link Beta and points it at the workspace for a tester', () => {
    auth.user = tester;
    render(<MemoryRouter><NavPills variant="app" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Careers · Beta' })).toHaveAttribute('href', '/careers/dashboard');
    cleanup();

    auth.user = member;
    render(<MemoryRouter><NavPills variant="app" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Careers · 2027' })).toHaveAttribute('href', '/careers');
  });

  it('offers Careers commands only when Careers is open to the account', () => {
    const ctx = { signedIn: true, currency: null, theme: 'light' as const, surface: 'careers' as const };
    const ids = (careersOpen?: boolean) => buildCommands({ ...ctx, careersOpen }).map((c) => c.id);
    expect(ids(true).some((id) => id.startsWith('careers:') && id !== 'careers:coming-soon')).toBe(true);
    expect(ids(true)).not.toContain('careers:coming-soon');
    expect(ids(undefined)).toContain('careers:coming-soon');
    expect(ids(undefined).filter((id) => id.startsWith('careers:'))).toEqual(['careers:coming-soon']);
  });
});
