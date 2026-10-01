import { useState } from 'react';
import { Link } from 'react-router';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { useCurrency } from '../CurrencyContext';
import { useMarket } from '../MarketContext';
import { useTheme } from '../../context/ThemeContext';
import { CURRENCY_CODES, currencySym } from '../lib/format';
import { MARKET_LIST } from '../lib/markets';
import { getDataSummary, hasAnyData, exportBackup, resetAllData } from '../lib/settings';
import PrivacyControls from '../ui/PrivacyControls';
import { DataReadiness } from '../ui/DataReadiness';
import { store } from '../lib/storage';
import { useAuth } from '../../context/AuthContext';

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
  const { user } = useAuth();
  const { code, setCode } = useCurrency();
  const { id: marketId, market, setMarket, detected } = useMarket();
  const { theme, setTheme } = useTheme();
  const [confirmReset, setConfirmReset] = useState(false);
  const [, force] = useState(0);

  const areas = getDataSummary();
  const anyData = hasAnyData();

  const onBackup = async () => {
    try {
      const ok = await exportBackup();
      if (ok) {
        store.set('fx_last_backup_export', new Date().toISOString());
        notify('Backup exported (JSON)', 'ok');
      } else if (!anyData) notify('No data to back up yet', 'info');
    } catch {
      notify('The backup could not be exported. Please try again.', 'error');
    }
  };

  const onReset = () => {
    const n = resetAllData();
    setConfirmReset(false);
    force((x) => x + 1);
    notify(n > 0 ? 'Finance data cleared on this device' : 'There was nothing to clear', n > 0 ? 'ok' : 'info');
  };

  return (
    <div className="fx-page fx-settings">
      <PageHead chip="Settings" chipColor="var(--gold)" chipBg="rgba(212,175,55,.1)" icon="shield" title="Settings & personalisation.">
        Personalise how FinatriX looks, tell us where you live, choose your display currency, and
        manage your data. Signed-in finance records also sync with your account.
      </PageHead>

      <DataReadiness />

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

      {/* Market — the setting that changes what the tools actually compute. */}
      <Section
        title="Your market"
        desc="Choose the local references and labels used by the tools. Australia, Singapore and Mainland China use entered cash rates and published peer summaries. Display currency is a separate setting."
      >
        <label htmlFor="fx-set-market" className="fl">Market</label>
        <select
          id="fx-set-market"
          className="fs"
          value={marketId}
          onChange={(e) => {
            const next = MARKET_LIST.find((m) => m.id === e.target.value);
            if (!next) return;
            setMarket(next.id);
            notify(`Market set to ${next.name}`, 'ok');
          }}
          style={{ width: '100%' }}
        >
          {MARKET_LIST.map((m) => (
            <option key={m.id} value={m.id}>{m.flag} {m.name}</option>
          ))}
        </select>

        {detected && (
          <p className="note" style={{ marginTop: 10 }}>
            We guessed {market.name} from your language settings. It is only a guess — picking it yourself makes
            it stick.
          </p>
        )}

        {/* Changing market never rewrites a currency the user chose. It offers. */}
        {code !== market.currency && (
          <div
            className="tip tip-info"
            style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
          >
            <span style={{ flex: 1, minWidth: 200 }}>
              {market.name} uses {market.currency}, but you are reading amounts in {code}.
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ width: 'auto' }}
              onClick={() => { setCode(market.currency); notify(`Currency set to ${market.currency}`, 'ok'); }}
            >
              Switch to {market.currency}
            </button>
          </div>
        )}

        <p className="note" style={{ marginTop: 12 }}>
          Figures for {market.name} were last reviewed {market.asOf.replace('-', '/')}. Sources:{' '}
          {market.sources.join('; ')}.
        </p>

        {/* The picker lists the markets the calculators are localised for. The
            research goes wider — deposit caps, tax schedules and price indices
            for Australia, Singapore and Mainland China are verified and dated,
            and would otherwise be invisible for want of instrument rates that
            nobody should invent. This is the door to them. */}
        <p className="note" style={{ marginTop: 8 }}>
          Want to check the sources behind your market?{' '}
          <Link to="/tools/reference" style={{ color: 'var(--accent-text)', textDecoration: 'underline' }}>
            Reference data covers seven
          </Link>{' '}
          — including Australia, Singapore and Mainland China, with dated sources and explicit limits on what the tools calculate.
        </p>
      </Section>

      {/* Currency */}
      <Section title="Display currency" desc="Applied across every tool, report and export. Set it independently of your market — you might live in one country and think in another currency.">
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
      <PrivacyControls />
      <Section title="Your finance records" desc="Export a backup of your finance records, including review notes and emergency-fund plans. Backups contain personal information; store them somewhere private.">
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
              Clear finance data…
            </button>
          ) : (
            <div role="alertdialog" aria-label="Confirm reset" style={{ background: 'color-mix(in srgb, var(--red) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Clear your finance records?</div>
              <p className="note" style={{ marginBottom: 12 }}>This clears your budget, expenses, goals, review notes and other finance data. {user ? 'Because you are signed in, this cleared state will also sync to your account when connected. Check the sync indicator; a failed sync may restore cloud records later.' : 'This affects records on this device.'} Export a backup first. This cannot be undone. Your account and Careers records are separate.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-sm" onClick={onReset} style={{ width: 'auto', background: 'var(--red)', borderColor: 'var(--red)', color: '#fff' }}>Clear finance records</button>
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
            FinatriX provides educational tools, not personal financial advice. Read our{' '}
            <Link to="/editorial-standards" style={{ color: 'var(--accent-text)' }}>editorial standards</Link>,{' '}
            <Link to="/contact" style={{ color: 'var(--accent-text)' }}>contact the team</Link>, or check our{' '}
            <Link to="/privacy" style={{ color: 'var(--accent-text)' }}>Privacy Policy</Link> and{' '}
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
