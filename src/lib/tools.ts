export interface Tool {
  id: string;
  /** Full name (used for aria-labels and the hero tile hover label). */
  name: string;
  /** Short label used in the top tab bar. */
  short: string;
  /** One-line description (hover / accessibility). */
  blurb: string;
  /** Deep-link into the tools app. */
  href: string;
  /** Brand-matched accent colour for the tile. */
  color: string;
  icon: IconName;
}

export type IconName =
  | 'budget'
  | 'expenses'
  | 'invest'
  | 'park'
  | 'compare'
  | 'goals'
  | 'lifemap'
  | 'grid';

export const TOOLS: Tool[] = [
  { id: 'budget', name: 'Budget Builder', short: 'Budget', blurb: 'Split income the 50/30/20 way.', href: '/tools#/budget', color: '#16A36A', icon: 'budget' },
  { id: 'expenses', name: 'Expense Tracker', short: 'Expenses', blurb: 'Log spending, spot patterns.', href: '/tools#/expenses', color: '#1FAE5A', icon: 'expenses' },
  { id: 'investmatch', name: 'InvestMatch', short: 'Invest', blurb: 'A portfolio matched to your risk.', href: '/tools#/investmatch', color: '#0A84FF', icon: 'invest' },
  { id: 'parksmart', name: 'ParkSmart', short: 'Park', blurb: 'Best post-tax home for idle cash.', href: '/tools#/parksmart', color: '#FF6B5E', icon: 'park' },
  { id: 'peercompare', name: 'PeerCompare', short: 'Compare', blurb: 'See how you stack up against peers.', href: '/tools#/peercompare', color: '#7C5CFF', icon: 'compare' },
  { id: 'goals', name: 'Reverse Goal Planner', short: 'Goals', blurb: 'Work back to your monthly SIP.', href: '/tools#/goals', color: '#14B8A6', icon: 'goals' },
  { id: 'lifemap', name: 'LifeMap', short: 'LifeMap', blurb: 'Simulate your whole financial life.', href: '/tools#/lifemap', color: '#D4AF37', icon: 'lifemap' },
];
