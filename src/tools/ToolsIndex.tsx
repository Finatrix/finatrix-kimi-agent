import { Navigate, useLocation } from 'react-router';
import { TOOLS } from '../lib/tools';
import { store } from './lib/storage';

/**
 * /tools index → redirect to a concrete tool route.
 *   - honours legacy hash deep-links (e.g. /tools#/budget → /tools/budget),
 *   - otherwise opens the last-used tool (fx_last_tool), falling back to budget.
 */
export default function ToolsIndex() {
  const { hash } = useLocation();

  const ids = TOOLS.map((t) => t.id);
  const fromHash = /^#\/([a-z]+)$/i.exec(hash)?.[1]?.toLowerCase();
  let target = fromHash && ids.includes(fromHash) ? fromHash : '';

  if (!target) {
    let last = '';
    try {
      last = store.get('fx_last_tool', '') || '';
    } catch {
      /* ignore */
    }
    target = ids.includes(last) ? last : 'budget';
  }

  return <Navigate to={`/tools/${target}`} replace />;
}
