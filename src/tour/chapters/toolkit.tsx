import { useEffect, useRef, type CSSProperties } from 'react';
import { d, socketed, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import type { IntroArtProps, OutputProps, TourChapter } from '../types';

/**
 * Chapter: the toolkit — the small controls every page shares. Search and the
 * command bar, notifications, the menu, market, currency and theme, where your
 * data lives, the wallet, exports, statement import and backups.
 *
 * The command bar is a modal dialog that makes the page inert while it is
 * open, so its insides are described in a centred card rather than
 * spotlighted.
 *
 * ILLUSTRATIVE FIGURES ONLY. The typed spend and the wallet balance are picked
 * literals; nothing here parses, stores or computes anything.
 */
const EXAMPLE = {
  INR: { spend: '340 lunch upi', wallet: 6400 },
  GENERIC: { spend: '12 lunch card', wallet: 320 },
} as const;
const pick = (code: string) => (code === 'INR' ? EXAMPLE.INR : EXAMPLE.GENERIC);

/* ── Intro illustration: one bar that reaches everything ────────────── */

/** The orb is the search lens, sitting in the command bar. */
const LENS = { x: 42, y: 54 };
const whole = (n: number) => String(Math.round(n));
/** The shortcut as this platform writes it. */
const KEY_HINT = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || '') ? '⌘K' : 'Ctrl K';

export function ToolkitArt({ clock, fmt, code }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const typedRef = useRef<SVGTextElement>(null);
  useFitSvgText(svgRef);
  const ex = pick(code);
  const words = ex.spend.split(' ');
  const badge = useCountUp(clock, 1900, 700, 3, whole);
  const wallet = useCountUp(clock, 2000, 900, ex.wallet, fmt);

  // The typed line is recognised as a spend: amount, what, how paid.
  useEffect(() => {
    const el = typedRef.current;
    if (!el) return;
    clock.at(1050, () => el.classList.add('is-parsed'));
  }, [clock]);

  const rows = [
    { label: 'Log a spend', hint: 'Enter', active: true },
    { label: 'Switch to dark theme', hint: '', active: false },
    { label: 'Open the full tutorial', hint: '', active: false },
  ];

  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      {/* The bar, with a spend typed into it. */}
      <g className="wt-rise" style={d(40)}>
        <path d={socketed(20, 34, 320, 40, 14, LENS.x, LENS.y, 13)} fillRule="evenodd" className="wt-field" />
        {/* No data-fit here: fitting rewrites textContent, which would drop the
            token spans. The line is short and monospaced, so it always fits. */}
        <text ref={typedRef} x={66} y={60} className="wt-typed">
          {words.map((w, i) => (
            <tspan key={w} className={`wt-tok wt-tok-${i} wt-fade`} style={d(250 + i * 220)}>{i ? ` ${w}` : w}</tspan>
          ))}
        </text>
        <rect x={290} y={45} width={38} height={18} rx={5} className="tour-a-rail" />
        <text data-fit={32} x={309} y={58} className="tour-a-tiny" textAnchor="middle">{KEY_HINT}</text>
      </g>

      {/* What it offers: the spend first, then everything else. */}
      <g className="wt-card-in" style={d(700)}>
        <rect x={20} y={82} width={320} height={92} rx={14} className="wt-pill" />
        {rows.map((r, i) => (
          <g key={r.label} className="wt-slide-in" style={d(820 + i * 110)}>
            {r.active && <rect x={28} y={89 + i * 27} width={304} height={24} rx={8} className="wt-pill wt-pill-gold" />}
            <text data-fit={220} x={40} y={105 + i * 27} className={r.active ? 'wt-t-label' : 'wt-t-sub'}>{r.label}</text>
            {r.hint && <text x={322} y={105 + i * 27} className="tour-a-tiny" textAnchor="end">{r.hint}</text>}
          </g>
        ))}
      </g>

      {/* The small things every page shares. */}
      <g className="wt-pop" style={d(1500)}>
        <rect x={20} y={186} width={96} height={72} rx={14} className="wt-pill" />
        <path d="M58 222a10 10 0 0 0-20 0c0 9-4 11-4 11h28s-4-2-4-11M51 238a3 3 0 0 1-6 0" className="tour-a-line tour-a-gold-s" />
        <circle cx={66} cy={206} r={9} style={{ fill: 'var(--gold)' }} />
        <text ref={badge} x={66} y={210} className="tour-a-tiny" textAnchor="middle" style={{ fill: '#1a1400' }}>3</text>
        <text data-fit={80} x={68} y={252} className="tour-a-tiny" textAnchor="middle">Alerts</text>
      </g>
      <g className="wt-pop" style={d(1620)}>
        <rect x={124} y={186} width={112} height={72} rx={14} className="wt-pill wt-pill-gold" />
        <text data-fit={92} x={136} y={208} className="tour-a-tiny">Wallet</text>
        <text ref={wallet} data-fit={92} data-sample={fmt(ex.wallet)} x={136} y={232} className="tour-a-val">{fmt(ex.wallet)}</text>
        <text data-fit={92} x={136} y={250} className="wt-t-sub">banked</text>
      </g>
      <g className="wt-pop" style={d(1740)}>
        <rect x={244} y={186} width={96} height={72} rx={14} className="wt-pill" />
        <text data-fit={76} x={256} y={208} className="tour-a-tiny">Export</text>
        {['CSV', 'XLSX', 'PDF'].map((f, i) => (
          <g key={f} className="wt-pop" style={d(2100 + i * 120)}>
            <rect x={256 + i * 25} y={220} width={22} height={16} rx={5} className="tour-a-rail" />
            <text x={267 + i * 25} y={231.5} className="tour-a-tiny" textAnchor="middle" style={{ fontSize: 6.5, letterSpacing: 0 } as CSSProperties}>{f}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ── Pictures ───────────────────────────────────────────────────────── */

function PalettePicture({ code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>“{ex.spend}”</dt><dd>Log a spend</dd></div>
        <div><dt>Switch theme</dt><dd>Actions</dd></div>
        <div><dt>Show amounts in {code}</dt><dd>Currency</dd></div>
        <div><dt>Guides behind every calculator</dt><dd>Learn</dd></div>
      </dl>
      <span className="tour-out-chip">↑ ↓ to move · Enter to run · Esc to close</span>
    </div>
  );
}

function ToolkitGood({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <div className="tour-out-grid">
        <div className="tour-out-tile"><span>Search</span><b>{KEY_HINT}</b></div>
        <div className="tour-out-tile"><span>Currency</span><b>{code}</b></div>
        <div className="tour-out-tile"><span>Wallet</span><b>{fmt(ex.wallet)}</b></div>
        <div className="tour-out-tile"><span>Last backup</span><b>This month</b></div>
      </div>
      <span className="tour-out-chip">Alerts read · records backed up</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const toolkit: TourChapter = {
  id: 'toolkit',
  title: 'Everyday toolkit',
  // These controls live on every tools page; the dashboard is their home.
  route: '/tools/dashboard',
  floating: true,
  tagline: 'Search, alerts, wallet, exports and the controls on every page.',
  minutes: 3,
  icon: 'zap',
  intro: {
    eyebrow: 'Everyday toolkit',
    headline: 'Small tools that save you time.',
    body: 'One search for everything, alerts from your own records, a wallet for the “can I afford this?” moments, and ways to get your data in and out.',
    Art: ToolkitArt,
    orb: [{ at: 0, x: LENS.x, y: LENS.y, s: 0.62 }],
    duration: 2900,
  },
  steps: [
    // First: the planning probe is the first plain target, and it must be on
    // screen at every width.
    {
      id: 'notifications',
      target: '[data-tour="shell-notifications"]',
      title: 'Alerts from your records',
      body: 'The bell collects alerts worked out from your records, with a count of what is new. Each opens the page it is about; dismiss one, or mark them all read.',
      hint: 'Open the bell, then press Esc to close it.',
    },
    {
      id: 'search',
      target: '[data-tour="shell-search"]',
      title: 'One search for everything',
      body: 'Find any tool, page, guide or setting by name. On a keyboard, Ctrl K (⌘K on a Mac) opens it from anywhere.',
      hint: 'Open it, type “goals”, then press Esc to carry on.',
    },
    {
      id: 'palette',
      title: 'More than a search',
      body: 'Type a spend like “340 lunch upi” to log it, or switch theme or currency, open guides and start the tutorial. Arrows and Enter pick, and recent picks come first.',
      output: PalettePicture,
    },
    {
      id: 'all-tools',
      target: '[data-tour="shell-all"]',
      title: 'Everything else',
      body: 'The Tools tab lists every tool, Reports and Calendar, with your currency, market rules and appearance.',
      needs: ['narrow'],
    },
    {
      id: 'market',
      target: '[data-tour="shell-market"]',
      title: 'Market rules at a glance',
      body: 'Shows which country’s rules the tools are reading. Press it to change the market in Settings.',
      needs: ['wide'],
    },
    {
      id: 'currency',
      target: '[data-tour="shell-currency"]',
      title: 'Switch display currency',
      body: 'Changes how amounts are shown everywhere, straight away. It never changes the market’s rules.',
      needs: ['wide'],
    },
    {
      id: 'theme',
      target: '[data-tour="shell-theme"]',
      title: 'Appearance',
      body: 'Choose Light, Dark or System. System follows your device, and is where FinatriX starts.',
      needs: ['wide'],
    },
    {
      id: 'sync',
      target: '[data-tour="shell-sync"]',
      title: 'Where your data lives',
      body: 'Says whether your records are on this device only, or saving and saved to your account when you are signed in.',
      needs: ['wide'],
    },
    {
      id: 'account',
      target: '[data-tour="shell-account"]',
      title: 'Your account',
      body: 'Profile, Settings and signing out live under your initial.',
      needs: ['signedIn'],
    },
    {
      id: 'sign-in',
      target: '[data-tour="shell-account"]',
      title: 'Sign in to sync',
      body: 'Everything works without an account. Signing in keeps your records in step across devices and unlocks AI answers about your own figures.',
      needs: ['signedOut'],
    },
    {
      id: 'page-tour',
      target: '[data-tour="shell-tour"]',
      title: 'A tour of any page',
      body: 'Press this on any tools page for a short tour of just that page.',
    },
    {
      id: 'navigator',
      target: '[data-tour="dashboard-navigator"]',
      title: 'Pick up where you left off',
      body: 'Continue the tool you used last, jump to records that need a look, or search and filter every tool by what you have saved.',
    },
    {
      id: 'wallet',
      target: '[data-tour="wallet-dock"]',
      route: '/tools/budget',
      title: 'Your wallet',
      body: 'Budget left unspent across the financial year, with each category’s balance and when your year starts. It sits on Budget and Expenses.',
      hint: 'Open the wallet, then press Esc.',
    },
    {
      id: 'export',
      target: '[data-tour="budget-export"]',
      route: '/tools/budget',
      title: 'Export to keep',
      body: 'Download CSV, Excel or a PDF report from Budget, Expenses and Reports.',
    },
    {
      id: 'import',
      target: '[data-tour="expenses-io"]',
      route: '/tools/expenses',
      title: 'Import a statement',
      body: 'Bring in a CSV, Excel or PDF statement, or a screenshot of one, then check each entry before you save it. It never connects to your bank.',
    },
    {
      id: 'backup',
      target: '[data-tour="settings-backup"]',
      route: '/tools/settings',
      title: 'Back up your records',
      body: 'Export everything as a JSON file to keep somewhere private. Signed in, your records also sync to your account.',
    },
    {
      id: 'good',
      // Pointed at a real control on purpose: a step with no target that
      // changes route ends the tour (resuming here would do exactly that).
      target: '[data-tour="settings-backup"]',
      route: '/tools/settings',
      title: 'What good looks like',
      body: 'You reach things by search, read your alerts, glance at the wallet before a purchase, and keep a recent backup. This is an example.',
      output: ToolkitGood,
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default toolkit;
