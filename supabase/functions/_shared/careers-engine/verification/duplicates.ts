/**
 * "Have I (or has anyone) already got this role?" Advisory candidate search over any list of
 * rows: the user's own applications, or the shared posting table. Derived from career-ops
 * precheck-duplicate.mjs (MIT, see NOTICE).
 */
import { companyRelation } from '../util/text.ts';
import { titleIdentityKey } from './reposts.ts';
import { roleFuzzyMatch } from './roleMatcher.ts';
import { normalizeUrl } from './urlKey.ts';

export type DuplicateReason = 'url' | 'req' | 'same-title' | 'parent-org' | 'similar-title';

export interface DuplicateRow {
  id: string;
  company: string;
  title: string;
  url?: string;
  requisitionId?: string;
  status?: string;
  date?: string;
}

export interface DuplicateQuery {
  company?: string;
  title?: string;
  requisitionId?: string;
  url?: string;
}

export interface DuplicateCandidate<R extends DuplicateRow = DuplicateRow> {
  row: R;
  reason: DuplicateReason;
  detail: string;
  /** 1 = near-certain (URL / requisition), 2 = same company + title, 3 = fuzzier. */
  tier: 1 | 2 | 3;
  /** True when the earlier row ended badly (e.g. rejected): applying again deserves a conscious decision. */
  warning: boolean;
}

const TIER: Record<DuplicateReason, 1 | 2 | 3> = { url: 1, req: 1, 'same-title': 2, 'parent-org': 3, 'similar-title': 3 };

function normReq(v: unknown): string {
  return String(v ?? '').trim().replace(/^REQ[-\s:#_]+/i, '').toUpperCase();
}

export function findDuplicateCandidates<R extends DuplicateRow>(
  rows: R[],
  query: DuplicateQuery,
  opts: { warnStatuses?: string[] } = {},
): Array<DuplicateCandidate<R>> {
  const warn = new Set((opts.warnStatuses ?? ['rejected']).map((s) => s.toLowerCase()));
  const company = query.company ?? '';
  const title = query.title ?? '';
  const wantUrl = query.url ? normalizeUrl(query.url) : '';
  const wantReq = normReq(query.requisitionId);
  const wantTitleKey = title ? titleIdentityKey(title) : '';
  const out: Array<DuplicateCandidate<R>> = [];

  for (const row of rows) {
    const rel = company ? companyRelation(company, row.company) : null;
    let reason: DuplicateReason | null = null;
    if (wantUrl && row.url && normalizeUrl(row.url) === wantUrl) reason = 'url';
    else if (wantReq && rel && normReq(row.requisitionId) === wantReq) reason = 'req';
    else if (rel === 'same' && wantTitleKey && titleIdentityKey(row.title) === wantTitleKey) reason = 'same-title';
    else if (rel === 'parent' && title && roleFuzzyMatch(title, row.title)) reason = 'parent-org';
    else if (rel === 'same' && title && roleFuzzyMatch(title, row.title)) reason = 'similar-title';
    if (!reason) continue;

    const detail = {
      url: 'same posting URL',
      req: `same requisition ${wantReq}`,
      'same-title': 'same company, same title',
      'parent-org': 'same parent organisation, similar title',
      'similar-title': 'same company, similar title',
    }[reason];
    out.push({ row, reason, detail, tier: TIER[reason], warning: warn.has(String(row.status ?? '').toLowerCase()) });
  }
  return out.sort((x, y) => x.tier - y.tier || String(y.row.date ?? '').localeCompare(String(x.row.date ?? '')));
}
