/**
 * The screens "open …" may go to. A fixed list: the picker chooses an id from
 * it, and anything else is not a screen.
 */
import { TOOLS } from '../../../lib/tools';

export interface Screen {
  id: string;
  label: string;
  href: string;
}

const EXTRA: readonly Screen[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/tools/dashboard' },
  { id: 'reports', label: 'Reports', href: '/tools/reports' },
  { id: 'calendar', label: 'Calendar', href: '/tools/calendar' },
  { id: 'moneycalendar', label: 'Money calendar', href: '/tools/moneycalendar' },
  { id: 'subscriptions', label: 'Subscriptions', href: '/tools/subscriptions' },
  { id: 'settings', label: 'Settings', href: '/tools/settings' },
];

export const SCREENS: readonly Screen[] = [
  EXTRA[0]!,
  ...TOOLS.map((t) => ({ id: t.id, label: t.name, href: t.href })),
  ...EXTRA.slice(1),
];

export function screenById(id: string): Screen | undefined {
  return SCREENS.find((s) => s.id === id);
}
