// Mirrors src/lib/tools.ts (names + accent colours) and src/shared/toolCount.ts (eight tools).
export const TOOLS = [
  { id: 'budget', name: 'Budget Builder', color: '#16A36A', icon: 'percent' },
  { id: 'expenses', name: 'Expense Tracker', color: '#1FAE5A', icon: 'receipt' },
  { id: 'investmatch', name: 'InvestMatch', color: '#0A84FF', icon: 'chart' },
  { id: 'parksmart', name: 'ParkSmart', color: '#FF6B5E', icon: 'park' },
  { id: 'peercompare', name: 'PeerCompare', color: '#7C5CFF', icon: 'users' },
  { id: 'goals', name: 'Reverse Goal Planner', color: '#14B8A6', icon: 'flag' },
  { id: 'lifemap', name: 'LifeMap', color: '#D4AF37', icon: 'pin' },
  { id: 'networth', name: 'Net Worth', color: '#0EA5A5', icon: 'scale' },
];
export const tool = (id) => TOOLS.find((t) => t.id === id);
