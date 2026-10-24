/**
 * The Careers market layer (US, UK, India, Australia, New Zealand), shared with the edge functions so the app
 * and the scanner read locations, salaries and work rights the same way.
 */
import { CAREERS_MARKETS } from '../../supabase/functions/_shared/careers-engine/markets/index.ts';

export * from '../../supabase/functions/_shared/careers-engine/markets/index.ts';

/**
 * Countries the job search offers: the five engine markets first, then the ones aggregators still cover
 * without direct-employer postings or market rules.
 */
export const SEARCH_COUNTRIES: ReadonlyArray<{ value: string; label: string }> = [
  ...CAREERS_MARKETS.map((m) => ({ value: m.id, label: m.name })),
  { value: 'sg', label: 'Singapore' },
  { value: 'ae', label: 'UAE' },
];
