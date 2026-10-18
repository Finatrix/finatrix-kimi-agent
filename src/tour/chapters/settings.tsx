import { useEffect, useRef, type CSSProperties } from 'react';
import { d, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import { easeInOutCubic } from '../../walkthrough/motion';
import type { IntroArtProps, OutputProps, TourChapter } from '../types';

/**
 * Chapter: Settings — reminders, appearance, market and currency, privacy and
 * AI permission, backups, clearing data, the tutorials, sharing.
 *
 * ILLUSTRATIVE ONLY. The backup size is a picked literal and the market label
 * is a placeholder; nothing here reads the person's real settings or data.
 */

/* ── Intro illustration: a few switches, set once ───────────────────── */

/** The orb is the reminders switch's knob: it slides from off to on. */
const KNOB_OFF = { x: 285, y: 58 };
const KNOB_ON = { x: 321, y: 58 };
const SEGMENTS = ['System', 'Light', 'Dark'] as const;
const SEG = { x: 34, y: 116, w: 96, h: 26 };
const kb = (n: number) => `${n.toFixed(1)} KB`;

export function SettingsArt({ clock, code }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const segRef = useRef<SVGRectElement>(null);
  useFitSvgText(svgRef);
  const size = useCountUp(clock, 2100, 900, 48.2, kb);

  // The theme highlight slides from System to Dark on the scene clock.
  useEffect(() => {
    const el = segRef.current;
    if (!el) return;
    clock.tween(1350, 620, (p) => { el.setAttribute('x', String(SEG.x + p * SEG.w * 2)); }, easeInOutCubic);
  }, [clock]);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      {/* Reminders: the orb flips the switch on. */}
      <g className="wt-rise" style={d(60)}>
        <rect x={20} y={34} width={320} height={48} rx={14} className="wt-pill" />
        <text data-fit={200} x={34} y={54} className="wt-t-label">Reminders</text>
        <text data-fit={200} x={34} y={71} className="wt-t-sub">Morning · midday · evening</text>
        <rect x={270} y={44} width={66} height={28} rx={14} className="tour-a-rail" />
      </g>
      <rect x={270} y={44} width={66} height={28} rx={14} className="tour-a-fill" style={{ ...d(950), fill: 'var(--gold)', fillOpacity: 0.35 }} />

      {/* Appearance: System, Light, Dark. */}
      <g className="wt-rise" style={d(380)}>
        <rect x={20} y={92} width={320} height={60} rx={14} className="wt-pill" />
        <text data-fit={200} x={34} y={110} className="tour-a-tiny">Appearance</text>
        <rect x={SEG.x} y={SEG.y} width={SEG.w * 3} height={SEG.h} rx={9} className="tour-a-rail" />
        <rect ref={segRef} x={SEG.x} y={SEG.y} width={SEG.w} height={SEG.h} rx={9} className="wt-pill wt-pill-gold" />
        {SEGMENTS.map((label, i) => (
          <text key={label} data-fit={80} x={SEG.x + SEG.w * i + SEG.w / 2} y={SEG.y + 17} className="wt-t-chip" textAnchor="middle">{label}</text>
        ))}
      </g>

      {/* Market and currency: separate, on purpose. */}
      {[
        { label: 'Market', value: 'Where you live', x: 20, delay: 700 },
        { label: 'Currency', value: code, x: 184, delay: 820 },
      ].map((t) => (
        <g key={t.label} className="wt-slide-in" style={d(t.delay)}>
          <rect x={t.x} y={162} width={156} height={44} rx={13} className="wt-pill" />
          <text data-fit={130} x={t.x + 14} y={179} className="tour-a-tiny">{t.label}</text>
          <text data-fit={130} x={t.x + 14} y={197} className="wt-t-label">{t.value}</text>
        </g>
      ))}

      {/* A backup kept, and AI that asks first. */}
      <g className="wt-card-in" style={d(1900)}>
        <rect x={20} y={216} width={156} height={44} rx={13} className="wt-pill wt-pill-gold" />
        <path d="M36 228h10l5 5v15h-15z" className="tour-a-line tour-a-gold-s" />
        <path d="M43.5 236v8M40 241l3.5 3.5 3.5-3.5" pathLength={1} className="tour-a-line tour-a-gold-s wt-draw" style={{ ...d(2150), ['--dur' as string]: '420ms' } as CSSProperties} />
        <text data-fit={104} x={60} y={233} className="tour-a-tiny">Backup · JSON</text>
        <text ref={size} data-fit={104} data-sample={kb(48.2)} x={60} y={251} className="wt-t-label">{kb(48.2)}</text>
      </g>
      <g className="wt-card-in" style={d(2050)}>
        <rect x={184} y={216} width={156} height={44} rx={13} className="wt-pill" />
        <rect x={198} y={236} width={14} height={11} rx={2.5} className="tour-a-line tour-a-gold-s" />
        <path d="M201 236v-3.5a4 4 0 0 1 8 0v3.5" className="tour-a-line tour-a-gold-s" />
        <text data-fit={112} x={222} y={233} className="tour-a-tiny">FinatriX AI</text>
        <text data-fit={112} x={222} y={251} className="wt-t-label">Asks first</text>
      </g>
      <g className="wt-pop" style={d(2600)}>
        <circle cx={326} cy={230} r={8} className="wt-ok" />
        <path d="M322.4 230.4l2.5 2.5 4.6-4.8" className="wt-ok-check" />
      </g>
    </svg>
  );
}

/* ── "What good looks like" ─────────────────────────────────────────── */

function SettingsGood({ code }: OutputProps) {
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>Market</dt><dd>Where you live</dd></div>
        <div><dt>Display currency</dt><dd>{code}</dd></div>
        <div><dt>Last backup</dt><dd>This month</dd></div>
        <div><dt>FinatriX AI</dt><dd>Your choice, on purpose</dd></div>
      </dl>
      <span className="tour-out-chip">Set once · checked now and then</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const settings: TourChapter = {
  id: 'settings',
  title: 'Settings',
  route: '/tools/settings',
  tagline: 'Reminders, appearance, market, privacy and your backups.',
  minutes: 4,
  icon: 'shield',
  intro: {
    eyebrow: 'Settings',
    headline: 'Set it up once, the way you like.',
    body: 'Choose your reminders, look, market and currency, decide what may be shared, and keep a backup of your records. Every choice can be changed later.',
    Art: SettingsArt,
    orb: [
      { at: 0, x: KNOB_OFF.x, y: KNOB_OFF.y, s: 0.58 },
      { at: 900, x: KNOB_ON.x, y: KNOB_ON.y, s: 0.58 },
    ],
    duration: 3000,
  },
  steps: [
    {
      id: 'checks',
      target: '[data-tour="settings-checks"]',
      title: 'Automatic data checks',
      body: 'A live check of your saved records, such as a missing month or a balance to carry forward, with a link to each tool that needs a look.',
      hint: 'Untick “Only show tools needing review” to see every tool.',
    },
    {
      id: 'reminders',
      target: '[data-tour="settings-reminders"]',
      title: 'Reminders you choose',
      body: 'Turn reminders on, then pick which you want: morning, midday, the spending nudge, Sunday’s look at the month and bill dates. In a browser they only appear while FinatriX is open.',
      needs: ['web'],
    },
    {
      id: 'reminder-times',
      target: '[data-tour="settings-reminders"]',
      title: 'Reminder times',
      body: 'Up to three short notifications a day, none with an amount in it. Set the morning and spending times here; permission stays in your device settings.',
      needs: ['native'],
    },
    {
      id: 'appearance',
      target: '[data-tour="settings-appearance"]',
      title: 'Light, dark or system',
      body: 'System follows your device as it changes through the day. Pick Light or Dark to keep one look.',
      hint: 'Try Dark, then System to follow your device again.',
    },
    {
      id: 'market',
      target: '[data-tour="settings-market"]',
      title: 'Your market',
      body: 'Sets which country’s references and labels the tools use, and shows when they were last reviewed. If its currency differs from yours, it offers to switch rather than changing it.',
    },
    {
      id: 'currency',
      target: '[data-tour="settings-currency"]',
      title: 'Display currency',
      body: 'How amounts are shown in every tool, report and export. It is separate from the market, because you might live in one country and think in another currency.',
    },
    {
      id: 'privacy',
      target: '[data-tour="settings-privacy"]',
      title: 'Privacy control centre',
      body: 'What is saved and where: on this device, and synced to your account when you are signed in. It also says whether FinatriX AI may send anything.',
    },
    {
      id: 'analytics',
      target: '[data-tour="settings-analytics"]',
      title: 'Optional analytics',
      body: 'Switch off optional usage analytics for this device. Do Not Track and Global Privacy Control are respected either way.',
    },
    {
      id: 'ai-consent',
      target: '[data-tour="settings-ai-consent"]',
      title: 'FinatriX AI permission',
      body: 'Allow AI answers to send your question and the figures they need to the AI provider, or switch it off to be asked again. Your name and email are never sent.',
    },
    {
      id: 'chat-history',
      target: '[data-tour="settings-chat-history"]',
      title: 'Clear chat history',
      body: 'Deletes the AI conversations saved on this device, after you confirm.',
    },
    {
      id: 'account',
      target: '[data-tour="settings-account"]',
      title: 'Account and data requests',
      body: 'The privacy policy, your account (where you can delete it and everything stored with it) and how we keep things secure.',
    },
    {
      id: 'records',
      target: '[data-tour="settings-records"]',
      title: 'What is saved',
      body: 'Each kind of finance record you have saved, with its size, so you can see exactly what the app is holding.',
    },
    {
      id: 'backup',
      target: '[data-tour="settings-backup"]',
      title: 'Keep a backup',
      body: 'Export your records as a JSON file and keep it somewhere private, or open Reports for printable branded reports.',
    },
    {
      id: 'clear',
      target: '[data-tour="settings-clear"]',
      title: 'Clear finance data',
      body: 'Clears your finance records after a confirmation; your account and Careers records are separate. Export a backup first, as it cannot be undone.',
    },
    {
      id: 'tutorial',
      target: '[data-tour="settings-tutorial"]',
      title: 'Come back to the tutorial',
      body: 'Every tool’s tour in one place, with your progress and a checklist of features you have not tried yet.',
    },
    {
      id: 'replay',
      target: '[data-tour="settings-replay"]',
      title: 'Replay the intro',
      body: 'Watch the short welcome from your first visit again, any time.',
    },
    {
      id: 'share',
      target: '[data-tour="settings-share"]',
      title: 'Share FinatriX',
      body: 'Send FinatriX to a friend from your device’s share sheet, or copy a link where sharing is not available.',
    },
    {
      id: 'rate',
      target: '[data-tour="settings-rate"]',
      title: 'Rate the app',
      body: 'A rating in the app store helps other people find FinatriX.',
      needs: ['native'],
    },
    {
      id: 'about',
      target: '[data-tour="settings-about"]',
      title: 'About and trust',
      body: 'FinatriX is educational, not personal financial advice. Our editorial standards, the team’s contact page, privacy policy and terms are all here.',
    },
    {
      id: 'good',
      target: '[data-tour="settings-market"]',
      title: 'What good looks like',
      body: 'Your market and currency match your life, a recent backup is saved somewhere private, and AI permission is a choice you made on purpose. This is an example.',
      output: SettingsGood,
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default settings;
