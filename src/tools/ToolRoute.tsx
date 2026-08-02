import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { Navigate, useParams } from 'react-router';
import { store } from './lib/storage';
import { track } from '../lib/analytics';
import { TOOL_IDS, type ToolId } from '../shared/routes';

/**
 * The educational footer (methodology, FAQ, related tools) shown under the seven
 * PUBLIC calculators. Lazy for the same reason the tools themselves are: it is
 * below the fold on a route that has not rendered yet, and none of its content
 * belongs on the landing path.
 */
const ToolEducation = lazy(() => import('./ui/ToolEducation'));

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

export default function ToolRoute() {
  const { toolId = '' } = useParams();
  const id = toolId.toLowerCase();
  const Page = TOOL_PAGES[id];

  useEffect(() => {
    if (Page) {
      // The document title is NOT set here. `applySeo` owns the whole head for
      // every route, from one map in src/lib/seo.ts — a second copy here meant
      // two effects racing to write the same node, and the SEO title for the
      // seven public calculators lost that race on a client-side navigation.
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

  // Only the seven indexable calculators get the educational footer. `/tools/
  // reports`, `/tools/calendar` and `/tools/settings` are signed-in workspace
  // screens: they are `noindex`, have no organic role, and have no methodology
  // to explain — a "how this is calculated" block under Settings would be noise.
  const isPublicTool = (TOOL_IDS as readonly string[]).includes(id);

  return (
    <Suspense fallback={<div style={{ minHeight: '50vh' }} aria-hidden="true" />}>
      <Page />
      {isPublicTool && <ToolEducation toolId={id as ToolId} />}
    </Suspense>
  );
}
