/**
 * Careers settings — AI model preference, OCR and analytics toggles, AI
 * usage meter, anonymous platform stats, and data management (export /
 * delete everything).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { ConfirmDialog, ErrorCard, PageLoading } from '../components/states';
import { AI_MODEL_OPTIONS, CAREERS_HIDDEN_SECTIONS } from '../constants';
import { useCareers } from '../context/CareersContext';
import { getAggregates, getAiUsageToday, type CareersAggregates } from '../services/analytics';
import { ALERT_KINDS, alertEnabled, listAlerts, setAlert } from '../services/notifications';
import { getPushPermission, requestPushPermission, type PushPermission } from '../services/push';
import type { AlertRow } from '../types/jobs';
import { updateProfileMeta } from '../services/careerProfile';
import { deleteResume } from '../services/resumes';
import { toCareersError } from '../utils/errors';

/** Hidden nav sections worth surfacing here — excludes upload/profile (linked elsewhere) and admin (RBAC-gated, shown in the nav for admins only). */
const MORE_TOOLS = CAREERS_HIDDEN_SECTIONS.filter((s) => !['upload', 'profile', 'admin'].includes(s.id));

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

export default function CareersSettings() {
  const { user } = useAuth();
  const { loading, error, resumes, profile, settings, updateSettings, refresh, setProfile } = useCareers();
  const { notify } = useToast();

  const [usageToday, setUsageToday] = useState<number | null>(null);
  const [aggregates, setAggregates] = useState<CareersAggregates | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushPermission>(() => getPushPermission());

  const enablePush = async () => {
    const result = await requestPushPermission();
    setPushPermission(result);
    if (result === 'granted') notify('Browser push enabled.', 'ok');
    else if (result === 'denied') notify('Push was blocked — enable it in your browser site settings.', 'error');
  };

  useEffect(() => {
    if (!user) return;
    void getAiUsageToday(user.id).then(setUsageToday, () => setUsageToday(null));
    void getAggregates().then(setAggregates, () => setAggregates(null));
    void listAlerts(user.id).then(setAlerts, () => setAlerts([]));
  }, [user]);

  const toggleAlert = async (kind: string, enabled: boolean) => {
    if (!user) return;
    try {
      await setAlert(user.id, kind, enabled);
      setAlerts(await listAlerts(user.id));
      notify('Alert preference saved.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  const setSetting = async (patch: Parameters<typeof updateSettings>[0]) => {
    try {
      await updateSettings(patch);
      notify('Settings saved.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  const exportAll = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile,
      resumes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'finatrix-careers-export.json';
    a.click();
    URL.revokeObjectURL(url);
    notify('Export downloaded.', 'ok');
  };

  const wipeAll = async () => {
    if (!user) return;
    setConfirmWipe(false);
    setWiping(true);
    try {
      for (const r of resumes) {
        await deleteResume(user.id, r);
      }
      const cleared = await updateProfileMeta(user.id, { career_dna: null, suggestions: {} });
      setProfile(cleared);
      await refresh();
      notify('All Careers data deleted.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setWiping(false);
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="fx-page">
      <PageHead
        chip="Settings"
        chipColor="#D4AF37"
        chipBg="rgba(212,175,55,.12)"
        icon="shield"
        title="Careers settings"
      >
        Tune the AI engine, control OCR and analytics, and manage your data.
      </PageHead>

      {error && <ErrorCard error={error} onRetry={() => void refresh()} />}

      {!error && (
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div className="card">
            <div className="panel-eyebrow">AI engine</div>
            <div className="fg" style={{ marginTop: 14 }}>
              <label className="fl" htmlFor="set-model">Preferred model</label>
              <select
                id="set-model"
                className="fs"
                value={settings.model}
                onChange={(e) => void setSetting({ model: e.target.value })}
              >
                {AI_MODEL_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <p className="note" style={{ marginTop: 7 }}>
                “Automatic” uses the server's model chain with built-in fallbacks — if one
                provider is down, the next answers. Analyses are cached, so identical
                content never spends AI credits twice.
              </p>
            </div>
            <div className="row-line">
              <span style={{ flex: 1, fontSize: 14 }}>AI analyses used today</span>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{usageToday ?? '—'}</b>
            </div>
          </div>

          <div className="card">
            <div className="panel-eyebrow">Processing</div>
            <div className="row-line" style={{ marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>OCR fallback for scanned PDFs</div>
                <div className="note">Runs fully on your device. Only used when a PDF has no text layer.</div>
              </div>
              <Toggle checked={settings.ocrEnabled} onChange={(v) => void setSetting({ ocrEnabled: v })} label="OCR fallback" />
            </div>
            <div className="row-line">
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Anonymous analytics</div>
                <div className="note">Event counts and scores only — never your identity or resume content.</div>
              </div>
              <Toggle checked={settings.analyticsEnabled} onChange={(v) => void setSetting({ analyticsEnabled: v })} label="Anonymous analytics" />
            </div>
          </div>

          <div className="card">
            <div className="panel-eyebrow">Company Intelligence preferences</div>
            <p className="note" style={{ margin: '8px 0 10px' }}>
              Comma-separated. These gently boost matching jobs higher in your search results —
              they never hide anything. Saved companies are always boosted automatically.
            </p>
            {([
              { key: 'preferredIndustries', label: 'Preferred industries', ph: 'Banking, FinTech & Payments' },
              { key: 'preferredLocations', label: 'Preferred locations', ph: 'Mumbai, Bengaluru' },
              { key: 'preferredDepartments', label: 'Preferred departments', ph: 'risk, compliance, engineering' },
              { key: 'preferredAts', label: 'Preferred ATS platforms', ph: 'Workday, SuccessFactors' },
            ] as const).map(({ key, label, ph }) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <label className="fl" htmlFor={`pref-${key}`}>{label}</label>
                <input
                  id={`pref-${key}`}
                  className="fi"
                  type="text"
                  placeholder={ph}
                  defaultValue={(settings[key] ?? []).join(', ')}
                  onBlur={(e) => void setSetting({
                    [key]: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })}
                />
              </div>
            ))}
          </div>

          <div className="card">
            <div className="panel-eyebrow">Smart alerts</div>
            <p className="note" style={{ margin: '8px 0 4px' }}>
              Delivered in-app (bell icon). Browser push is available below; transactional
              email sends once an administrator configures the email provider.
            </p>
            {ALERT_KINDS.map(({ kind, label }) => (
              <div className="row-line" key={kind}>
                <span style={{ flex: 1, fontSize: 14 }}>{label}</span>
                <Toggle
                  checked={alertEnabled(alerts, kind)}
                  onChange={(v) => void toggleAlert(kind, v)}
                  label={label}
                />
              </div>
            ))}
            <div className="row-line">
              <span style={{ flex: 1, fontSize: 14 }}>Browser push notifications</span>
              {pushPermission === 'granted' ? (
                <span className="badge badge-green">enabled</span>
              ) : pushPermission === 'unsupported' ? (
                <span className="badge badge-mute">unsupported</span>
              ) : (
                <button className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={() => void enablePush()}>
                  {pushPermission === 'denied' ? 'Blocked — check browser settings' : 'Enable'}
                </button>
              )}
            </div>
          </div>

          {aggregates && (
            <div className="card">
              <div className="panel-eyebrow">Platform stats (anonymous)</div>
              <div className="dash-grid" style={{ marginTop: 14 }}>
                <div className="stat-cell"><div className="v">{aggregates.totalUploads}</div><div className="l">Total uploads</div></div>
                <div className="stat-cell"><div className="v">{aggregates.uploadsToday}</div><div className="l">Uploads today</div></div>
                <div className="stat-cell"><div className="v">{aggregates.avgResumeScore ?? '—'}</div><div className="l">Avg resume score</div></div>
                <div className="stat-cell"><div className="v">{aggregates.avgAtsScore ?? '—'}</div><div className="l">Avg ATS score</div></div>
                <div className="stat-cell"><div className="v">{aggregates.avgParseMs != null ? `${(aggregates.avgParseMs / 1000).toFixed(1)}s` : '—'}</div><div className="l">Avg parse time</div></div>
                <div className="stat-cell"><div className="v">{aggregates.avgAiMs != null ? `${(aggregates.avgAiMs / 1000).toFixed(1)}s` : '—'}</div><div className="l">Avg AI time</div></div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="panel-eyebrow">Your data</div>
            <div className="row-line" style={{ marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Export everything</div>
                <div className="note">Profile, resumes, versions and analyses as JSON.</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={exportAll}>Export</button>
            </div>
            <div className="row-line">
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)' }}>Delete all Careers data</div>
                <div className="note">Removes every resume, file and analysis. Cannot be undone.</div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ borderColor: 'rgba(255,90,82,.4)', color: 'var(--red)' }}
                disabled={wiping}
                onClick={() => setConfirmWipe(true)}
              >
                {wiping ? 'Deleting…' : 'Delete all'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="panel-eyebrow">More tools</div>
        <p className="note" style={{ margin: '8px 0 12px' }}>
          Kept off the main nav to keep it focused on getting you interviews — everything below
          still works exactly as before.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {MORE_TOOLS.map((t) => (
            <Link key={t.id} to={t.href} className="btn btn-ghost btn-sm" style={{ width: 'auto', textDecoration: 'none' }}>
              {t.name}
            </Link>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={confirmWipe}
        title="Delete all Careers data?"
        body={`This permanently removes ${resumes.length} resume${resumes.length === 1 ? '' : 's'}, every uploaded file, all analyses and your Career DNA. Your profile fields stay. This cannot be undone.`}
        confirmLabel="Delete everything"
        danger
        onConfirm={() => void wipeAll()}
        onCancel={() => setConfirmWipe(false)}
      />

      <ToolFoot>
        <b>FinatriX Careers</b> · private by design — your data, your account, your call
      </ToolFoot>
    </div>
  );
}
