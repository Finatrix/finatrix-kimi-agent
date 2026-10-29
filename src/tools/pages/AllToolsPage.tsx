import type { KeyboardEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type ThemeMode } from '../../context/ThemeContext';
import { TOOLS, type IconName } from '../../lib/tools';
import { ToolIcon } from '../../components/ToolIcon';
import { showCareersEntry } from '../../lib/careersEntry';
import { CAREERS_ROUTES } from '../../careers/constants';
import { isNativeApp } from '../../native/platform';
import { openTourHub } from '../../tour/launch';
import { useCurrency } from '../CurrencyContext';
import { useMarket } from '../MarketContext';
import { CURRENCY_CODES, currencySym } from '../lib/format';

/**
 * Every destination in the app, as one page.
 *
 * On a phone this is the fifth tab. It replaced two overlapping menus — a
 * slide-out drawer behind a hamburger and a "More" tab that opened the same
 * drawer — with a real place that has a URL, a back button and a title
 * (Apple HIG, tab-bars.md › Best practices: avoid overflow tabs; each tab is a
 * destination). Display settings live here too, because the header has no room
 * for them on a phone.
 */

type Row = { to: string; label: string; detail?: string; icon: IconName; color?: string };

/** Rows that are not a tool take the neutral ink, so colour still marks the tools. */
const NEUTRAL = 'var(--ink2)';

const EVERYDAY = ['budget', 'expenses', 'networth'];
const PLANNING = ['goals', 'lifemap', 'investmatch', 'parksmart', 'peercompare'];

function toolRows(ids: string[]): Row[] {
  return ids.flatMap((id) => {
    const t = TOOLS.find((x) => x.id === id);
    return t ? [{ to: t.href, label: t.name, detail: t.blurb, icon: t.icon, color: t.color }] : [];
  });
}

function Chevron() {
  return (
    <svg className="fx-hub-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = `hub-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section className="fx-hub-group" aria-labelledby={id}>
      <h2 id={id} className="fx-hub-title">{title}</h2>
      <ul className="fx-hub-list">{children}</ul>
    </section>
  );
}

/** Every row carries one, from the same set, so the labels line up down the list. */
function HubIcon({ name, color = NEUTRAL }: { name: IconName; color?: string }) {
  return (
    <span className="fx-hub-icon" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      <ToolIcon name={name} className="h-[18px] w-[18px]" />
    </span>
  );
}

function LinkRow({ to, label, detail, icon, color }: Row) {
  return (
    <li>
      <Link to={to} className="fx-hub-row">
        <HubIcon name={icon} color={color} />
        <span className="fx-hub-text">
          <span className="fx-hub-label">{label}</span>
          {detail && <span className="fx-hub-detail">{detail}</span>}
        </span>
        <Chevron />
      </Link>
    </li>
  );
}

const MODES: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'system', label: 'System' },
];

function AppearanceRow() {
  const { mode, setMode } = useTheme();
  // A radio group per WAI-APG: one tab stop (the checked option), arrow keys
  // move the choice.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = MODES.findIndex((m) => m.mode === mode);
    const next = MODES[(i + step + MODES.length) % MODES.length];
    setMode(next.mode);
    (e.currentTarget.querySelector(`[data-mode="${next.mode}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <li className="fx-hub-row is-static">
      <HubIcon name="appearance" />
      <span className="fx-hub-text"><span className="fx-hub-label" id="hub-appearance">Appearance</span></span>
      <div className="fx-seg" role="radiogroup" aria-labelledby="hub-appearance" onKeyDown={onKeyDown}>
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            role="radio"
            data-mode={m.mode}
            aria-checked={mode === m.mode}
            tabIndex={mode === m.mode ? 0 : -1}
            className={mode === m.mode ? 'on' : undefined}
            onClick={() => setMode(m.mode)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </li>
  );
}

function CurrencyRow() {
  const { code, setCode } = useCurrency();
  return (
    <li className="fx-hub-row is-static">
      <HubIcon name="currency" />
      <label className="fx-hub-text" htmlFor="hub-currency"><span className="fx-hub-label">Display currency</span></label>
      <select id="hub-currency" className="fx-hub-select" value={code} onChange={(e) => setCode(e.target.value)}>
        {CURRENCY_CODES.map((k) => (
          <option key={k} value={k}>{currencySym(k)} {k}</option>
        ))}
      </select>
    </li>
  );
}

export default function AllToolsPage() {
  const { user, signOut, configured } = useAuth();
  const { market } = useMarket();
  const native = isNativeApp();

  return (
    <div className="fx-hub">
      <header className="fx-hub-head">
        <h1>All tools</h1>
        <p>Everything in FinatriX, plus how it looks and which country’s rules it uses.</p>
      </header>

      <Group title="Everyday money">
        <LinkRow to="/tools/dashboard" label="Dashboard" detail="Your month at a glance." icon="grid" color="#D4AF37" />
        {toolRows(EVERYDAY).map((r) => <LinkRow key={r.to} {...r} />)}
        <LinkRow to="/tools/reports" label="Reports" detail="Print or export a month or a year." icon="reports" />
        <LinkRow to="/tools/calendar" label="Calendar" detail="Bills and scheduled spending by day." icon="calendar" />
      </Group>

      <Group title="Plan ahead">
        {toolRows(PLANNING).map((r) => <LinkRow key={r.to} {...r} />)}
      </Group>

      {showCareersEntry() && (
        <Group title="Careers">
          <LinkRow to={CAREERS_ROUTES.dashboard} label="FinatriX Careers" detail="A separate workspace for your job search." icon="careers" />
        </Group>
      )}

      <Group title="Preferences">
        <AppearanceRow />
        <CurrencyRow />
        <LinkRow to="/tools/settings" label="Market rules" detail={`${market.flag} ${market.name}`} icon="globe" />
        <LinkRow to="/tools/settings" label="Settings" detail="Data, privacy, reminders and more." icon="settings" />
        {user && <LinkRow to="/profile" label="Profile" icon="profile" />}
      </Group>

      <Group title="Help">
        <li>
          <button type="button" className="fx-hub-row" onClick={openTourHub}>
            <HubIcon name="tour" />
            <span className="fx-hub-text">
              <span className="fx-hub-label">Guided tours</span>
              <span className="fx-hub-detail">Short chapters that point at the real buttons.</span>
            </span>
            <Chevron />
          </button>
        </li>
        <LinkRow to="/learn" label="Learn" detail="Plain-language guides to money basics." icon="learn" />
        {!native && <LinkRow to="/" label="FinatriX website" icon="external" />}
        <LinkRow to="/privacy" label="Privacy" icon="privacy" />
        <LinkRow to="/terms" label="Terms" icon="terms" />
      </Group>

      <div className="fx-hub-account">
        {user ? (
          <button type="button" className="fx-hub-signout" onClick={() => void signOut()}>Sign out</button>
        ) : configured ? (
          <Link to="/login" className="btn">Sign in to sync across devices</Link>
        ) : null}
      </div>
    </div>
  );
}
