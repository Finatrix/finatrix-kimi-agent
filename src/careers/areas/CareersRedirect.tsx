/**
 * Sends an old Careers address to where that content lives now, keeping any
 * query the old link carried (a Stripe `?checkout=` return, a company `?id=`,
 * a job search `?q=`). The destination's own `?tab=` wins over a stale one.
 */
import { Navigate, useLocation } from 'react-router';

export function CareersRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  const [path, query = ''] = to.split('?');
  const merged = new URLSearchParams(search);
  for (const [k, v] of new URLSearchParams(query)) merged.set(k, v);
  const qs = merged.toString();
  return <Navigate to={`${path}${qs ? `?${qs}` : ''}${hash}`} replace />;
}
