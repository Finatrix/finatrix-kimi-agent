/**
 * Careers settings — AI permission and today's usage, OCR and analytics
 * toggles, search preferences, alerts, and data management (export / delete
 * everything). The Settings area draws the page header.
 */

import { useEffect, useState } from 'react';
import { downloadBlob } from '../../lib/download';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { AI_RECIPIENT, useAiConsent } from '../../lib/ai/consent';
import { ConfirmDialog, ErrorCard, PageLoading } from '../components/states';
import { useCareers } from '../context/CareersContext';
import { getAiUsageToday } from '../services/analytics';
import { ALERT_KINDS, alertEnabled, listAlerts, setAlert } from '../services/notifications';
import { getPushPermission, requestPushPermission, type PushPermission } from '../services/push';
import type { AlertRow } from '../types/jobs';
import { updateProfileMeta } from '../services/careerProfile';
import { deleteResume } from '../services/resumes';
import { toCareersError } from '../utils/errors';

/** Hidden nav sections worth surfacing here — excludes upload/profile (linked elsewhere) and admin (RBAC-gated, shown in the nav for admins only). */

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
  const [aiConsent, setAiConsent] = useAiConsent();
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

  const exportAll = async () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile,
      resumes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    try {
      const saved = await downloadBlob('finatrix-careers-export.json', blob);
      if (saved) notify('Export ready.', 'ok');
    } catch (error) {
      notify(toCareersError(error).message, 'error');
    }
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
      {error && <ErrorCard error={error} onRetry={() => void refresh()} />}

      {!error && (
        <div style={{ maxWidth: 720 }}>
          <div className="card">
            <div className="panel-eyebrow">Privacy</div>
            <div className="row-line" style={{ marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Allow FinatriX AI</div>
                <div className="note">
                  Analysing, matching, tailoring and interview practice send the resume and job text they need to {AI_RECIPIENT}. Your name, email address and account ID are never sent. Off means Careers asks before anything is sent.
                </div>
              </div>
              <Toggle checked={aiConsent} onChange={(v) => setAiConsent(v)} label="Allow FinatriX AI" />
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

      <ConfirmDialog
        open={confirmWipe}
        title="Delete all Careers data?"
        body={`This permanently removes ${resumes.length} resume${resumes.length === 1 ? '' : 's'}, every uploaded file, all analyses and your Career DNA. Your profile fields stay. This cannot be undone.`}
        confirmLabel="Delete everything"
        danger
        onConfirm={() => void wipeAll()}
        onCancel={() => setConfirmWipe(false)}
      />

      </div>
  );
}
