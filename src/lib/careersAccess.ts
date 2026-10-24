import type { User } from '@supabase/supabase-js';
import { useAuth } from '../context/AuthContext';
import { CAREERS_AVAILABLE } from '../shared/careersAvailability';
import { showCareersEntry } from './careersEntry';

/**
 * Who may open Careers before launch.
 *
 * `CAREERS_AVAILABLE` opens it to everyone. Until then it is open only to accounts the server has marked as beta
 * testers (`app_metadata.careers_beta`), and only on the website: the installed apps keep their pre-launch
 * behaviour (`showCareersEntry`). Only the service role can write `app_metadata`, so nobody can mark themselves,
 * and no tester's address ships in the bundle.
 *
 * Like the launch switch it extends, this is the UX gate. Data access is still RLS and the paywall's job.
 */
export function isCareersBetaTester(user: Pick<User, 'app_metadata'> | null | undefined): boolean {
  return user?.app_metadata?.careers_beta === true;
}

export interface CareersAccess {
  /** Careers routes, links and commands are open to this visitor. */
  open: boolean;
  /** Open only because this account is a beta tester: label it Beta. */
  beta: boolean;
  /** A stored session is still being restored, so whether this is a tester is not known yet. */
  pending: boolean;
}

export function careersAccessFor(user: Pick<User, 'app_metadata'> | null | undefined, authLoading: boolean): CareersAccess {
  if (CAREERS_AVAILABLE) return { open: true, beta: false, pending: false };
  const beta = showCareersEntry() && isCareersBetaTester(user);
  return { open: beta, beta, pending: authLoading && !user && showCareersEntry() };
}

export function useCareersAccess(): CareersAccess {
  const { user, loading } = useAuth();
  return careersAccessFor(user, loading);
}
