/**
 * Feature-flag overrides, from the admin form to the row that is stored.
 *
 * Pins "a kill switch reaches everyone". A signed-in user can read only the
 * override rows that are not about one person, plus their own, so a kill
 * switch stored under `user:<someone>` would switch a flag for one account and
 * nobody else. See services/featureFlags2.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const h = vi.hoisted(() => ({
  /** What the table holds. */
  rows: [] as Record<string, unknown>[],
  /** Every row the form asked the database to save. */
  upserts: [] as Record<string, unknown>[],
  // One object for the whole run: the dashboard reloads whenever `user` changes identity.
  auth: { user: { id: 'admin-1' }, loading: false },
  notify: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => Promise.resolve({ data: table === 'feature_flag_overrides' ? [...h.rows] : [], error: null }),
      upsert: (row: Record<string, unknown>) => {
        h.upserts.push(row);
        h.rows.push({ id: `row-${h.rows.length + 1}`, updated_at: '', ...row });
        return Promise.resolve({ error: null });
      },
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('../careers/hooks/useRole', () => ({ useRole: () => ({ role: 'admin', isAdmin: true, loading: false }) }));
vi.mock('../tools/ui/Toast', () => ({ useToast: () => ({ notify: h.notify }) }));
// The rest of the dashboard's data is not what is being tested here.
vi.mock('../careers/services/aiUsage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../careers/services/aiUsage')>()),
  listAllUsage: async () => [],
}));
vi.mock('../careers/services/announcements', () => ({
  createAnnouncement: vi.fn(),
  listAllAnnouncements: async () => [],
  setAnnouncementActive: vi.fn(),
}));
vi.mock('../careers/services/audit', () => ({ listAuditLog: async () => [], logAudit: h.logAudit }));
vi.mock('../careers/services/organizations', () => ({ listAllOrganizations: async () => [] }));
vi.mock('../careers/services/providerOps', () => ({ loadProviderOps: async () => null }));
vi.mock('../careers/services/supportTickets', () => ({ listAllTickets: async () => [], setTicketStatus: vi.fn() }));

import AdminDashboard from '../careers/pages/AdminDashboard';

async function openFlagsTab() {
  render(<AdminDashboard />);
  fireEvent.click(screen.getByRole('tab', { name: 'Feature Flags' }));
  return {
    flag: await screen.findByLabelText('Flag name'),
    scope: screen.getByLabelText('Flag scope'),
    scopeId: screen.getByLabelText('Scope id'),
    killSwitch: screen.getByRole('checkbox', { name: /kill switch/i }),
    add: screen.getByRole('button', { name: 'Add override' }),
  };
}

const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

beforeEach(() => {
  h.rows.length = 0;
  h.upserts.length = 0;
  h.notify.mockClear();
  h.logAudit.mockClear();
});

afterEach(cleanup);

describe('adding an override from the admin dashboard', () => {
  it('saves a kill switch for everyone, not under the scope left in the form', async () => {
    const form = await openFlagsTab();
    type(form.flag, 'risky');
    type(form.scope, 'user');
    type(form.scopeId, 'admin-1');
    fireEvent.click(form.killSwitch);

    // The scope no longer applies, and the form says why.
    expect(form.scope).toBeDisabled();
    expect(form.scopeId).toBeDisabled();
    expect(screen.getByText(/saved for everyone/i).closest('[role="status"]')).not.toBeNull();

    fireEvent.click(form.add);
    await waitFor(() => expect(h.upserts).toHaveLength(1));
    expect(h.upserts[0]).toMatchObject({ flag: 'risky', scope: 'global', scope_id: '*', is_kill_switch: true });
    // The audit trail records where it went, not what the form happened to hold.
    expect(h.logAudit).toHaveBeenCalledWith(
      'admin-1',
      'flag_override.set',
      { type: 'feature_flag', id: 'risky' },
      { scope: 'global', scopeId: '*', killSwitch: true },
    );
    // And the list says who it applies to.
    expect(await screen.findByText('risky — everyone')).toBeInTheDocument();
    expect(screen.getByText('kill switch')).toBeInTheDocument();
  });

  it('asks for no scope id when the override is a kill switch', async () => {
    const form = await openFlagsTab();
    type(form.flag, 'risky');
    fireEvent.click(form.killSwitch);
    fireEvent.click(form.add);

    await waitFor(() => expect(h.upserts).toHaveLength(1));
    expect(h.upserts[0]).toMatchObject({ scope: 'global', scope_id: '*' });
    expect(h.notify).not.toHaveBeenCalledWith(expect.anything(), 'error');
  });

  it('still needs a flag name for a kill switch', async () => {
    const form = await openFlagsTab();
    fireEvent.click(form.killSwitch);
    fireEvent.click(form.add);

    expect(h.notify).toHaveBeenCalledWith('Flag name is required.', 'error');
    expect(h.upserts).toHaveLength(0);
  });

  it('saves an ordinary override where it was aimed, and still needs its scope id', async () => {
    const form = await openFlagsTab();
    type(form.flag, 'beta_x');
    type(form.scope, 'org');
    fireEvent.click(form.add);

    expect(h.notify).toHaveBeenCalledWith('Flag name and scope id are required.', 'error');
    expect(h.upserts).toHaveLength(0);
    expect(form.scope).toBeEnabled();
    expect(form.scopeId).toBeEnabled();

    type(form.scopeId, 'org-1');
    fireEvent.click(form.add);
    await waitFor(() => expect(h.upserts).toHaveLength(1));
    expect(h.upserts[0]).toMatchObject({ flag: 'beta_x', scope: 'org', scope_id: 'org-1', is_kill_switch: false });
    expect(await screen.findByText('beta_x — org:org-1')).toBeInTheDocument();
  });

  it('gives the scope fields back when the kill switch is unticked', async () => {
    const form = await openFlagsTab();
    type(form.scopeId, 'u1');
    fireEvent.click(form.killSwitch);
    fireEvent.click(form.killSwitch);

    expect(form.scope).toBeEnabled();
    expect(form.scopeId).toBeEnabled();
    expect(form.scopeId).toHaveValue('u1');
    expect(screen.queryByText(/saved for everyone/i)).not.toBeInTheDocument();
  });
});

describe('who can read override rows', () => {
  const ROOT = join(__dirname, '..', '..');
  /** The read policy as one file declares it, with its line breaks flattened. */
  const readPolicyIn = (file: string) =>
    readFileSync(join(ROOT, 'supabase', file), 'utf8')
      .match(/create policy "feature_flag_overrides_select"[^;]+;/)?.[0]
      ?.replace(/\s+/g, ' ') ?? '';

  it('the hand-run schema file declares the policy production runs', () => {
    const live = readPolicyIn('migrations/20261112000100_scope_feature_flag_override_reads.sql');
    expect(live).toContain("using (scope <> 'user' or scope_id = (select auth.uid())::text)");
    // The schema file drops and recreates this policy every time it is run. If
    // it still said `using (true)`, running it would hand every account every
    // other account's rows again.
    expect(readPolicyIn('careers_phase4_schema.sql')).toBe(live);
  });
});
