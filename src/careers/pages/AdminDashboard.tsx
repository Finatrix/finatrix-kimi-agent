/**
 * Admin Dashboard (Phase 4, Module 4). RBAC-gated — see useRole(); the RLS
 * policies on every table here also independently enforce admin-only reads,
 * so this page is defense-in-depth, not the only guard.
 *
 * Sections backed by real data in this pass: Subscriptions, AI Usage,
 * Feature Flags, Organizations, Announcements, Support Tickets, Audit Log.
 * Sections requiring infrastructure not yet wired (Users list needs the
 * service-role admin API; Payments needs Stripe/Razorpay; Errors needs
 * Sentry; System Health needs uptime pings) are shown as explicit
 * "not yet connected" placeholders rather than faked.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { Tabs } from '../../tools/ui/Tabs';
import { EmptyState, ErrorCard, PageLoading } from '../components/states';
import { useRole } from '../hooks/useRole';
import { listAllUsage, summarizeUsage } from '../services/aiUsage';
import { createAnnouncement, listAllAnnouncements, setAnnouncementActive } from '../services/announcements';
import { listAuditLog, logAudit } from '../services/audit';
import {
  deleteFlagOverride,
  listFlagOverrides,
  listGlobalFlags,
  setFlagOverride,
} from '../services/featureFlags2';
import { listAllOrganizations } from '../services/organizations';
import { listAllTickets, setTicketStatus } from '../services/supportTickets';
import { supabase } from '../../lib/supabase';
import type { AiUsageSummary } from '../types/phase4';
import type {
  AnnouncementRow,
  AuditLogRow,
  FeatureFlagOverrideRow,
  OrganizationRow,
  SubscriptionRow,
  SupportTicketRow,
  TicketStatus,
} from '../types/phase4';
import type { FeatureFlagRow } from '../types/jobs';
import { toCareersError, type CareersError } from '../utils/errors';
import { formatDate, formatDateTime } from '../utils/format';

type Tab = 'overview' | 'subscriptions' | 'ai-usage' | 'flags' | 'organizations' | 'announcements' | 'tickets' | 'audit' | 'not-connected';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'ai-usage', label: 'AI Usage' },
  { id: 'flags', label: 'Feature Flags' },
  { id: 'organizations', label: 'Organizations' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'tickets', label: 'Support Tickets' },
  { id: 'audit', label: 'Audit Log' },
  { id: 'not-connected', label: 'Payments / Errors / System Health' },
];

export default function AdminDashboard() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>('overview');

  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [usageSummary, setUsageSummary] = useState<AiUsageSummary | null>(null);
  const [globalFlags, setGlobalFlags] = useState<FeatureFlagRow[]>([]);
  const [overrides, setOverrides] = useState<FeatureFlagOverrideRow[]>([]);
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditLogRow[]>([]);
  const [loadError, setLoadError] = useState<CareersError | null>(null);

  const [flagForm, setFlagForm] = useState({ flag: '', scope: 'user' as 'user' | 'org' | 'plan', scopeId: '', killSwitch: false });
  const [annForm, setAnnForm] = useState({ title: '', body: '' });

  const load = useCallback(async () => {
    if (!user || !isAdmin) return;
    try {
      const [s, usage, gf, ov, o, a, t, al] = await Promise.all([
        supabase.from('subscriptions').select('*').then((r) => (r.data ?? []) as SubscriptionRow[]),
        listAllUsage(30),
        listGlobalFlags(),
        listFlagOverrides(),
        listAllOrganizations(),
        listAllAnnouncements(),
        listAllTickets(),
        listAuditLog(100),
      ]);
      setSubs(s);
      setUsageSummary(summarizeUsage(usage));
      setGlobalFlags(gf);
      setOverrides(ov);
      setOrgs(o);
      setAnnouncements(a);
      setTickets(t);
      setAuditRows(al);
      setLoadError(null);
    } catch (e) {
      setLoadError(toCareersError(e));
    }
  }, [user, isAdmin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard load-on-mount pattern used across every Careers page
    void load();
  }, [load]);

  if (roleLoading) return <PageLoading />;

  if (!isAdmin) {
    return (
      <div className="fx-page">
        <PageHead chip="Admin" chipColor="#D4AF37" chipBg="rgba(212,175,55,.12)" icon="warn" title="Admin Dashboard">
          This area is restricted.
        </PageHead>
        <div className="card">
          <EmptyState icon="warn" title="Admin access required">
            Your account does not have admin or super_admin role. Roles are granted via the Supabase
            dashboard (platform_roles table) — never client-side, by design.
          </EmptyState>
        </div>
      </div>
    );
  }

  const addFlagOverride = async () => {
    if (!user || !flagForm.flag.trim() || !flagForm.scopeId.trim()) {
      notify('Flag name and scope id are required.', 'error');
      return;
    }
    try {
      await setFlagOverride(flagForm.flag.trim(), flagForm.scope, flagForm.scopeId.trim(), { isKillSwitch: flagForm.killSwitch });
      logAudit(user.id, 'flag_override.set', { type: 'feature_flag', id: flagForm.flag.trim() }, { scope: flagForm.scope, scopeId: flagForm.scopeId.trim(), killSwitch: flagForm.killSwitch });
      setFlagForm({ flag: '', scope: 'user', scopeId: '', killSwitch: false });
      await load();
      notify('Flag override saved.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  const addAnnouncement = async () => {
    if (!user || !annForm.title.trim()) return;
    try {
      await createAnnouncement(user.id, annForm);
      setAnnForm({ title: '', body: '' });
      await load();
      notify('Announcement published.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  return (
    <div className="fx-page">
      <PageHead chip="Admin" chipColor="#D4AF37" chipBg="rgba(212,175,55,.12)" icon="briefcase" title="Admin Dashboard">
        Platform-wide subscriptions, AI usage, feature flags, organizations and support — admin-only.
      </PageHead>

      {loadError && <ErrorCard error={loadError} onRetry={() => void load()} />}

      <Tabs
        variant="nav"
        label="Admin sections"
        style={{ padding: 0, marginBottom: 16, flexWrap: 'wrap' }}
        active={tab}
        onChange={setTab}
        items={TABS.map((t) => ({ key: t.id, label: t.label }))}
      />

      {tab === 'overview' && (
        <div className="dash-grid">
          <div className="metric"><div className="ml">Subscriptions</div><div className="mv">{subs.length}</div></div>
          <div className="metric" style={{ ['--metric-accent' as string]: 'var(--blue)' }}><div className="ml">Organizations</div><div className="mv">{orgs.length}</div></div>
          <div className="metric" style={{ ['--metric-accent' as string]: 'var(--green)' }}><div className="ml">Open tickets</div><div className="mv">{tickets.filter((t) => t.status === 'open').length}</div></div>
          <div className="metric" style={{ ['--metric-accent' as string]: 'var(--purple)' }}><div className="ml">AI calls (30d)</div><div className="mv">{usageSummary?.totalCalls ?? 0}</div></div>
        </div>
      )}

      {tab === 'subscriptions' && (
        <div className="card">
          {subs.map((s) => (
            <div className="act-row" key={s.id}>
              <span style={{ flex: 1 }}>{s.plan_id}</span>
              <span className="badge badge-blue">{s.status}</span>
              <span className="note">{formatDate(s.created_at)}</span>
            </div>
          ))}
          {!subs.length && <EmptyState icon="goal" title="No subscriptions yet" />}
        </div>
      )}

      {tab === 'ai-usage' && usageSummary && (
        <div className="card">
          <div className="dash-grid" style={{ marginBottom: 16 }}>
            <div className="metric"><div className="ml">Total calls</div><div className="mv">{usageSummary.totalCalls}</div></div>
            <div className="metric" style={{ ['--metric-accent' as string]: 'var(--blue)' }}><div className="ml">Total tokens</div><div className="mv">{usageSummary.totalTokens.toLocaleString()}</div></div>
            <div className="metric" style={{ ['--metric-accent' as string]: 'var(--green)' }}><div className="ml">Est. cost</div><div className="mv">${usageSummary.totalCost.toFixed(2)}</div></div>
            <div className="metric" style={{ ['--metric-accent' as string]: 'var(--purple)' }}><div className="ml">Avg latency</div><div className="mv">{usageSummary.avgLatencyMs}ms</div></div>
          </div>
          <div className="note" style={{ marginBottom: 10 }}>Cache hit rate {usageSummary.cacheHitRate}% · Failure rate {usageSummary.failureRate}%</div>
          <div className="panel-eyebrow" style={{ marginBottom: 6 }}>By model</div>
          {usageSummary.byModel.map((m) => (
            <div className="cat-row" key={m.model}>
              <span className="cat-label">{m.model || '(unknown)'}</span>
              <div className="bar"><div className="bar-fill" style={{ width: `${usageSummary.totalCalls ? (m.calls / usageSummary.totalCalls) * 100 : 0}%`, background: 'var(--gold)' }} /></div>
              <span className="cat-val">{m.calls}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'flags' && (
        <>
          <div className="card">
            <div className="panel-eyebrow" style={{ marginBottom: 8 }}>Global flags</div>
            {globalFlags.map((f) => (
              <div className="act-row" key={f.flag}>
                <span style={{ flex: 1 }}>{f.flag}</span>
                <span className={`badge ${f.enabled ? 'badge-green' : 'badge-red'}`}>{f.enabled ? 'on' : 'off'}</span>
                {f.free_limit != null && <span className="note">limit {f.free_limit}</span>}
              </div>
            ))}
          </div>
          <div className="card">
            <div className="panel-eyebrow" style={{ marginBottom: 8 }}>Scoped overrides &amp; kill switches</div>
            {overrides.map((o) => (
              <div className="act-row" key={o.id}>
                <span style={{ flex: 1 }}>{o.flag} — {o.scope}:{o.scope_id}</span>
                {o.is_kill_switch && <span className="badge badge-red">kill switch</span>}
                <span className="badge badge-blue">{o.rollout_percent}%</span>
                <button className="icon-btn danger" aria-label="Delete override" onClick={() => void deleteFlagOverride(o.id).then(load)}>✕</button>
              </div>
            ))}
            <div className="grid3" style={{ marginTop: 14 }}>
              <input className="fi" placeholder="Flag name" value={flagForm.flag} onChange={(e) => setFlagForm((f) => ({ ...f, flag: e.target.value }))} />
              <select className="fs" value={flagForm.scope} onChange={(e) => setFlagForm((f) => ({ ...f, scope: e.target.value as typeof f.scope }))}>
                <option value="user">User</option>
                <option value="org">Organization</option>
                <option value="plan">Plan</option>
              </select>
              <input className="fi" placeholder="Scope id" value={flagForm.scopeId} onChange={(e) => setFlagForm((f) => ({ ...f, scopeId: e.target.value }))} />
            </div>
            <label className="note" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
              <input type="checkbox" checked={flagForm.killSwitch} onChange={(e) => setFlagForm((f) => ({ ...f, killSwitch: e.target.checked }))} />
              Kill switch (overrides everything, everywhere)
            </label>
            <button className="btn btn-sm" onClick={() => void addFlagOverride()}>Add override</button>
          </div>
        </>
      )}

      {tab === 'organizations' && (
        <div className="card">
          {orgs.map((o) => (
            <div className="act-row" key={o.id}>
              <span style={{ flex: 1 }}>{o.name}</span>
              <span className="badge badge-mute">{o.kind}</span>
              <span className="note">{formatDate(o.created_at)}</span>
            </div>
          ))}
          {!orgs.length && <EmptyState icon="briefcase" title="No organizations yet" />}
        </div>
      )}

      {tab === 'announcements' && (
        <>
          <div className="card">
            <div className="panel-eyebrow" style={{ marginBottom: 8 }}>New announcement</div>
            <input className="fi" style={{ marginBottom: 8 }} placeholder="Title" value={annForm.title} onChange={(e) => setAnnForm((f) => ({ ...f, title: e.target.value }))} />
            <textarea className="fi" style={{ minHeight: 70, marginBottom: 8 }} placeholder="Body" value={annForm.body} onChange={(e) => setAnnForm((f) => ({ ...f, body: e.target.value }))} />
            <button className="btn btn-sm" onClick={() => void addAnnouncement()}>Publish</button>
          </div>
          <div className="card">
            {announcements.map((a) => (
              <div className="act-row" key={a.id}>
                <div style={{ flex: 1 }}><b>{a.title}</b><div className="note">{a.body}</div></div>
                <button
                  className={`badge ${a.active ? 'badge-green' : 'badge-mute'}`}
                  style={{ cursor: 'pointer', border: 'none' }}
                  aria-pressed={a.active}
                  aria-label={`${a.title} is ${a.active ? 'active' : 'inactive'} — toggle`}
                  onClick={() => void setAnnouncementActive(a.id, !a.active).then(load)}
                >
                  {a.active ? 'active' : 'inactive'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'tickets' && (
        <div className="card">
          {tickets.map((t) => (
            <div className="act-row" key={t.id}>
              <div style={{ flex: 1 }}><b>{t.subject}</b><div className="note">{t.body.slice(0, 100)}</div></div>
              <select className="fs" style={{ width: 'auto' }} value={t.status} onChange={(e) => {
                const status = e.target.value as TicketStatus;
                void setTicketStatus(t.id, status).then(() => {
                  if (user) logAudit(user.id, 'support_ticket.status_changed', { type: 'support_ticket', id: t.id }, { status });
                  return load();
                });
              }}>
                {(['open', 'pending', 'resolved', 'closed'] as TicketStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          ))}
          {!tickets.length && <EmptyState icon="check" title="No support tickets" />}
        </div>
      )}

      {tab === 'audit' && (
        <div className="card">
          {auditRows.map((a) => (
            <div className="act-row" key={a.id}>
              <span style={{ flex: 1 }}>{a.action} {a.target_type && `— ${a.target_type}:${a.target_id}`}</span>
              <span className="note">{formatDateTime(a.created_at)}</span>
            </div>
          ))}
          {!auditRows.length && <EmptyState icon="check" title="No audit events yet" />}
        </div>
      )}

      {tab === 'not-connected' && (
        <div className="card">
          <EmptyState icon="warn" title="Not yet connected">
            Users list needs the Supabase service-role admin API (not safe to call from the browser).
            Payments need Stripe/Razorpay keys. Errors need a Sentry DSN. Storage/Search/Resume analytics
            and System Health need additional instrumentation. All of these are scaffolded in the
            architecture (see the Phase 4 docs) but intentionally not faked here.
          </EmptyState>
        </div>
      )}

      <ToolFoot><b>Admin Dashboard</b> · RBAC-gated, RLS-enforced on every table</ToolFoot>
    </div>
  );
}
