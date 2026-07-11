import { useState } from 'react';
import { Link } from 'react-router';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { useCurrency } from '../CurrencyContext';
import { useTheme } from '../../context/ThemeContext';
import { CURRENCY_CODES, currencySym } from '../lib/format';
import { getDataSummary, hasAnyData, exportBackup, resetAllData } from '../lib/settings';

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: desc ? 2 : 12 }}>{title}</div>
      {desc && <p className="note" style={{ marginBottom: 14 }}>{desc}</p>}
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { notify } = useToast();
  const { code, setCode } = useCurrency();
  const { theme, setTheme } = useTheme();
  const [confirmReset, setConfirmReset] = useState(false);
  const [, force] = useState(0);

  const areas = getDataSummary();
  const anyData = hasAnyData();

  const onBackup = () => {
    const ok = exportBackup();
    notify(ok ? 'Backup downloaded (JSON)' : 'No data to back up yet', ok ? 'ok' : 'info');
  };

  const onReset = () => {
    const n = resetAllData();
    setConfirmReset(false);
    force((x) => x + 1);
    notify(n > 0 ? 'All local data cleared' : 'There was nothing to clear', n > 0 ? 'ok' : 'info');
  };

  return (
    <div className="fx-page">
      <PageHead chip="Settings" chipColor="var(--gold)" chipBg="rgba(212,175,55,.1)" icon="shield" title="Settings & personalisation.">
        Personalise how FinatriX looks, choose your display currency, and manage your data — all stored
        privately on your device.
      </PageHead>

      {/* Appearance */}
      <Section title="Appearance" desc="Choose a theme. FinatriX follows your system by default until you pick one.">
        <div role="radiogroup" aria-label="Theme" style={{ display: 'flex', gap: 10 }}>
          {(['light', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              onClick={() => setTheme(t)}
              className={theme === t ? 'btn btn-sm' : 'btn btn-ghost btn-sm'}
              style={{ flex: 1, textTransform: 'capitalize', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Icon name={t === 'light' ? 'sun' : 'lifemap'} size={15} />{t}
            </button>
          ))}
        </div>
      </Section>

      {/* Currency */}
      <Section title="Display currency" desc="Applied across every tool, report and export. Amounts are converted for display only.">
        <label htmlFor="fx-set-cur" className="fl">Currency</label>
        <select
          id="fx-set-cur"
          className="fs"
          value={code}
          onChange={(e) => { setCode(e.target.value); notify(`Currency set to ${e.target.value}`, 'ok'); }}
          style={{ width: '100%' }}
        >
          {CURRENCY_CODES.map((k) => (
            <option key={k} value={k}>{currencySym(k)} {k}</option>
          ))}
        </select>
      </Section>

      {/* Data & privacy */}
      <Section title="Your data" desc="Everything you enter is stored locally on this device. Export a backup or clear it any time.">
        {anyData ? (
          <ul style={{ listStyle: 'none', margin: '0 0 14px', padding: 0 }}>
            {areas.filter((a) => a.present).map((a) => (
              <li key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--hair2)' }}>
                <Icon name="check" size={14} style={{ color: 'var(--green)' }} />
                <span style={{ flex: 1, fontSize: 13 }}>{a.label}</span>
                <span className="note" style={{ fontSize: 11 }}>{(a.bytes / 1024).toFixed(1)} KB</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="note" style={{ marginBottom: 14 }}>No saved data yet. As you use the tools, your data will appear here.</p>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm" onClick={onBackup} disabled={!anyData} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="arrow-up" size={15} />Export backup (JSON)
          </button>
          <Link to="/tools/reports" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="layers" size={15} />Branded reports
          </Link>
        </div>

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--hair2)' }}>
          {!confirmReset ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(true)} disabled={!anyData} style={{ color: 'var(--red)', borderColor: 'color-mix(in srgb, var(--red) 40%, transparent)' }}>
              Reset all data…
            </button>
          ) : (
            <div role="alertdialog" aria-label="Confirm reset" style={{ background: 'color-mix(in srgb, var(--red) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Delete all local data?</div>
              <p className="note" style={{ marginBottom: 12 }}>This permanently clears your budget, expenses, goals and other saved data on this device. Export a backup first if you want to keep it. This can’t be undone.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-sm" onClick={onReset} style={{ width: 'auto', background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }}>Yes, delete everything</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)} style={{ width: 'auto' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* About */}
      <Section title="About & trust">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Icon name="lock" size={18} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>
            FinatriX is an educational suite — not financial advice. Your data never leaves your device unless you
            sign in to sync. Read our <Link to="/privacy" style={{ color: 'var(--accent-text)' }}>Privacy Policy</Link> and{' '}
            <Link to="/terms" style={{ color: 'var(--accent-text)' }}>Terms</Link>.
          </div>
        </div>
      </Section>

      <ToolFoot>
        Educational tools — not financial advice · <a href="/privacy" target="_top">Privacy</a> ·{' '}
        <a href="/terms" target="_top">Terms</a> · Built with care by <b>FinatriX</b>
      </ToolFoot>
    </div>
  );
}
