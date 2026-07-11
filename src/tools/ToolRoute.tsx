import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { Navigate, useParams } from 'react-router';
import { store } from './lib/storage';
import { track } from '../lib/analytics';

/**
 * Registry mapping each tool id to its native React page. All seven tools are
 * first-class React routes — there is no iframe and no tools-app.html in the
 * running application.
 */
const TOOL_PAGES: Record<string, ComponentType> = {
  budget: lazy(() => import('./pages/BudgetPage')),
  expenses: lazy(() => import('./pages/ExpensePage')),
  investmatch: lazy(() => import('./pages/InvestMatchPage')),
  parksmart: lazy(() => import('./pages/ParkSmartPage')),
  peercompare: lazy(() => import('./pages/PeerComparePage')),
  goals: lazy(() => import('./pages/GoalPlannerPage')),
  lifemap: lazy(() => import('./pages/LifeMapPage')),
  reports: lazy(() => import('./pages/ReportsPage')),
  calendar: lazy(() => import('./pages/CalendarPage')),
  settings: lazy(() => import('./pages/SettingsPage')),
};

const TITLES: Record<string, string> = {
  budget: 'Budget Builder',
  expenses: 'Expense Tracker',
  investmatch: 'InvestMatch',
  parksmart: 'ParkSmart',
  peercompare: 'PeerCompare',
  goals: 'Reverse Goal Planner',
  lifemap: 'LifeMap',
  reports: 'Reports',
  calendar: 'Calendar',
  settings: 'Settings',
};

export default function ToolRoute() {
  const { toolId = '' } = useParams();
  const id = toolId.toLowerCase();
  const Page = TOOL_PAGES[id];

  useEffect(() => {
    if (Page) {
      document.title = `${TITLES[id]} — FinatriX`;
      track('tool_view', { tool: id });
      try {
        store.set('fx_last_tool', id);
      } catch {
        /* ignore */
      }
    }
  }, [id, Page]);

  // Unknown tool → send back to the tools index (which picks a valid tool).
  if (!Page) return <Navigate to="/tools" replace />;

  return (
    <Suspense fallback={<div style={{ minHeight: '50vh' }} aria-hidden="true" />}>
      <Page />
    </Suspense>
  );
}
