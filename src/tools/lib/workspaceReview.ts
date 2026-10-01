import { TOOLS } from '../../lib/tools';
import { currentMonth } from './month';
import { store } from './storage';

export interface WorkspaceRecord { id: string; name: string; href: string; status: 'empty' | 'saved' | 'review'; detail: string }
const KEYS: Record<string, string> = { budget: 'fx_bb_data', expenses: 'fx_expenses', investmatch: 'fx_investmatch', parksmart: 'fx_parksmart', peercompare: 'fx_peercompare', goals: 'fx_goals', lifemap: 'fx_lifemap', networth: 'fx_networth' };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Readiness is about saved records, not a claim of completeness or financial health. */
export function workspaceReview(read: (key: string) => string | null = key => store.raw(key), month = currentMonth()): WorkspaceRecord[] {
  return TOOLS.map(tool => {
    const base = { id: tool.id, name: tool.name, href: tool.href };
    const raw = read(KEYS[tool.id]);
    if (!raw) return { ...base, status: 'empty', detail: 'No saved records. Start here when you are ready.' };
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return { ...base, status: 'review', detail: 'Saved data could not be read. Export a backup before making changes.' }; }
    const isList = tool.id === 'expenses' || tool.id === 'networth';
    if ((isList && !Array.isArray(value)) || (!isList && !object(value))) return { ...base, status: 'review', detail: 'Unexpected saved format. Keep a backup and review this tool.' };
    if (Object.keys(value as object).length === 0) return { ...base, status: 'empty', detail: 'No saved records. Start here when you are ready.' };
    if (tool.id === 'budget' && object(value) && !object(value[month])) return { ...base, status: 'review', detail: `No budget recorded for ${month}. Earlier plans are still saved.` };
    if (tool.id === 'expenses' && Array.isArray(value)) {
      if (value.some(row => !object(row) || typeof row.date !== 'string' || typeof row.amount !== 'number' || !Number.isFinite(row.amount))) return { ...base, status: 'review', detail: 'Some saved entries have missing or invalid fields. Review the ledger.' };
      if (!value.some(row => object(row) && typeof row.date === 'string' && row.date.startsWith(`${month}-`))) return { ...base, status: 'review', detail: `No entries for ${month}. This may be a quiet month or an incomplete log.` };
    }
    if (tool.id === 'networth' && Array.isArray(value)) {
      const missing = value.filter(account => !object(account) || !object(account.balances) || typeof account.balances[month] !== 'number' || !Number.isFinite(account.balances[month])).length;
      if (missing) return { ...base, status: 'review', detail: `${missing} account${missing === 1 ? '' : 's'} without a balance entered for ${month}. Review carried-forward values.` };
    }
    return { ...base, status: 'saved', detail: 'Saved inputs available. Open the tool to check completeness and assumptions.' };
  });
}
