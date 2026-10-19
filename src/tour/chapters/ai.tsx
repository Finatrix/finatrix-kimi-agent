import { useEffect, useRef, type CSSProperties } from 'react';
import { d, socketed, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import type { IntroArtProps, OutputProps, TourChapter } from '../types';

/**
 * Chapter: FinatriX AI — the assistant that answers from your own records,
 * checks its amounts against them afterwards, and asks before anything leaves
 * the device.
 *
 * The panel is a modal dialog that makes the rest of the page inert while it
 * is open, so the tour cannot spotlight controls INSIDE it. The steps point at
 * the real ways in (the launcher, the ✨ buttons beside figures, the consent
 * switch in Settings) and describe what the panel holds in centred cards, each
 * with a small picture of it.
 *
 * ILLUSTRATIVE FIGURES ONLY. The spend and plan below are picked literals; no
 * figure is read from storage or produced by the assistant or a calculator.
 */
const EXAMPLE = {
  INR: { spent: 9200, plan: 8000 },
  GENERIC: { spent: 460, plan: 400 },
} as const;
const pick = (code: string) => (code === 'INR' ? EXAMPLE.INR : EXAMPLE.GENERIC);

/** The dashboard's “Help me get started in chat” button. */
const SETUP_CHAT = '[data-tour="ai-setup-chat"]';

/* ── Intro illustration: a question, an answer, and the check ───────── */

const QUESTION = 'Where did my month go?';
/** The orb is the assistant's mark beside its answer, then the check's seal. */
const AVATAR = { x: 36, y: 112 };
const SEAL = { x: 40, y: 245 };
/** Record chips in "Your records"; two of them are the answer's sources. */
const RECORDS = [128, 168, 208, 248, 288] as const;
const SOURCES = [{ from: 134, to: 168 }, { from: 266, to: 288 }] as const;

export function AiArt({ clock, fmt, code }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const typedRef = useRef<SVGTextElement>(null);
  const dotsRef = useRef<SVGGElement>(null);
  useFitSvgText(svgRef);
  const ex = pick(code);
  const spent = useCountUp(clock, 1500, 900, ex.spent, fmt);
  const plan = useCountUp(clock, 1620, 900, ex.plan, fmt);

  // The question types itself out, then "reading your figures" gives way to
  // the answer — all on the scene clock, so reduced motion lands on the end.
  useEffect(() => {
    const typed = typedRef.current;
    const dots = dotsRef.current;
    if (!typed || !dots) return;
    if (!clock.instant) typed.textContent = '';
    clock.tween(150, 700, (p) => { typed.textContent = QUESTION.slice(0, Math.round(p * QUESTION.length)); }, (t) => t);
    clock.at(1250, () => { dots.style.opacity = '0'; });
  }, [clock]);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      {/* Your question. */}
      <g className="wt-pop" style={d(40)}>
        <rect x={150} y={34} width={190} height={30} rx={15} className="wt-pill wt-pill-gold" />
        <text ref={typedRef} data-fit={166} data-sample={QUESTION} x={326} y={54} className="wt-t-chip" textAnchor="end">{QUESTION}</text>
      </g>

      {/* Reading your figures… */}
      <g ref={dotsRef} className="wt-fade" style={{ ...d(900), transition: 'opacity 240ms ease' } as CSSProperties}>
        {[0, 1, 2].map((i) => <circle key={i} cx={66 + i * 10} cy={112} r={3} className="tour-a-rail" />)}
      </g>

      {/* The answer, in its own shape: a headline, then the figures as tiles. */}
      <g className="wt-card-in" style={d(1300)}>
        <path d={socketed(20, 76, 320, 104, 16, AVATAR.x, AVATAR.y, 13)} fillRule="evenodd" className="wt-pill" />
        <text data-fit={262} x={62} y={100} className="wt-t-label">Eating out ran over plan</text>
        {[
          { label: 'Spent', ref: spent, sample: fmt(ex.spent), x: 62 },
          { label: 'Planned', ref: plan, sample: fmt(ex.plan), x: 198 },
        ].map((t) => (
          <g key={t.label}>
            <rect x={t.x} y={112} width={128} height={52} rx={11} className="wt-field" />
            <text data-fit={108} x={t.x + 11} y={131} className="tour-a-tiny">{t.label}</text>
            <text ref={t.ref} data-fit={108} data-sample={t.sample} x={t.x + 11} y={153} className="tour-a-val">{t.sample}</text>
          </g>
        ))}
      </g>

      {/* Your records: every amount is traced back to them. */}
      <g className="wt-rise" style={d(1700)}>
        <rect x={20} y={192} width={320} height={34} rx={12} className="wt-pill" />
        <text data-fit={86} x={32} y={213} className="tour-a-tiny">Your records</text>
        {RECORDS.map((x) => <rect key={x} x={x} y={203} width={32} height={12} rx={6} className="tour-a-rail" />)}
      </g>
      {SOURCES.map((s, i) => (
        <g key={s.to}>
          <path
            d={`M${s.from} 164 C ${s.from} 184, ${s.to + 16} 182, ${s.to + 16} 203`}
            pathLength={1}
            className="tour-a-line tour-a-gold-s wt-draw"
            style={{ ...d(2050 + i * 160), ['--dur' as string]: '520ms' } as CSSProperties}
          />
          <rect x={s.to} y={203} width={32} height={12} rx={6} className="wt-pop" style={{ ...d(2450 + i * 160), fill: 'var(--gold)' }} />
        </g>
      ))}

      {/* The verdict on the answer, sealed by the orb. */}
      <g className="wt-card-in" style={d(2600)}>
        <path d={socketed(20, 232, 320, 30, 12, SEAL.x, SEAL.y - 2, 10)} fillRule="evenodd" className="wt-pill wt-pill-gold" />
        <text data-fit={268} x={60} y={251} className="wt-t-sub">Both amounts trace to your records</text>
      </g>
    </svg>
  );
}

/* ── Pictures of what the panel holds ───────────────────────────────── */

function AnswerPicture({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <p style={{ margin: '0 0 8px', fontWeight: 650, fontSize: 13 }}>Eating out ran over plan</p>
      <div className="tour-out-grid">
        <div className="tour-out-tile"><span>Spent</span><b>{fmt(ex.spent)}</b></div>
        <div className="tour-out-tile"><span>Planned</span><b>{fmt(ex.plan)}</b></div>
      </div>
      <span className="tour-out-chip">Both amounts trace to your records</span>
    </div>
  );
}

function CheckPicture({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>{fmt(ex.spent)}</dt><dd>From your records</dd></div>
        <div><dt>{fmt(ex.plan)}</dt><dd>From your budget</dd></div>
        <div><dt>{fmt(ex.plan * 0.9)}</dt><dd>A suggestion, named</dd></div>
      </dl>
      <span className="tour-out-chip">Record coverage · how much data it used</span>
    </div>
  );
}

function StartPicture() {
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>Get my instant financial briefing</dt><dd>On device</dd></div>
        <div><dt>Create a monthly review</dt><dd>AI</dd></div>
      </dl>
      <span className="tour-out-chip">Which category costs me the most?</span>
    </div>
  );
}

function SetupPicture() {
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>How do I import expenses?</dt><dd>On device</dd></div>
        <div><dt>How do I control my privacy?</dt><dd>On device</dd></div>
      </dl>
      <span className="tour-out-chip">Written help · nothing sent</span>
    </div>
  );
}

function ConsentPicture() {
  return (
    <div>
      <p style={{ margin: '0 0 6px', fontWeight: 650, fontSize: 13 }}>Send this to an AI provider?</p>
      <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--ink2)' }}>Your question and the figures it needs. Never your name, email or account ID.</p>
      <span className="tour-out-chip">Allow and send · Not now</span>
    </div>
  );
}

function GoodAnswer({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>Spent on eating out</dt><dd>{fmt(ex.spent)}</dd></div>
        <div><dt>Planned</dt><dd>{fmt(ex.plan)}</dd></div>
        <div><dt>Over plan by</dt><dd>{fmt(ex.spent - ex.plan)}</dd></div>
      </dl>
      <span className="tour-out-chip">Traced to your records · educational</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const ai: TourChapter = {
  id: 'ai',
  title: 'FinatriX AI',
  // The assistant floats over every tools page; the dashboard is its home.
  route: '/tools/dashboard',
  floating: true,
  tagline: 'Ask about your own month, with every amount checked.',
  minutes: 3,
  icon: 'sparkle',
  intro: {
    eyebrow: 'FinatriX AI',
    headline: 'Ask about your money, in plain words.',
    body: 'It answers from what you have recorded, checks every amount against your records, and asks before anything is sent. It explains; you decide.',
    Art: AiArt,
    orb: [
      { at: 0, x: AVATAR.x, y: AVATAR.y, s: 0.62 },
      { at: 2700, x: SEAL.x, y: SEAL.y - 2, s: 0.46 },
    ],
    duration: 3100,
  },
  steps: [
    {
      id: 'launcher',
      target: '[data-tour="ai-launcher"]',
      title: 'Ask AI, on any page',
      body: 'The gold button opens FinatriX AI from every tool. Minimise it to a small sparkle when you want the room, for the rest of this visit.',
      hint: 'Open it, look around, then close it to carry on.',
    },
    {
      id: 'own-month',
      title: 'Answers from your own month',
      body: 'Signed in, it reads your budget and spending fresh for every question. If something is not in your records it says so rather than guess.',
      output: AnswerPicture,
    },
    {
      id: 'checked',
      title: 'Every amount is checked',
      body: 'After it answers, each amount is checked against your records, and any that are not yours, like a suggested target, are named. A line under the answer says how much of your data it stood on.',
      output: CheckPicture,
    },
    {
      id: 'start',
      title: 'Good places to start',
      body: 'Ask for an instant briefing, worked out on your device by FinatriX’s own engine, or a written monthly review. Suggested questions and follow-ups save you from wording things.',
      output: StartPicture,
    },
    {
      id: 'explains',
      title: 'It explains money too',
      body: 'Ask how compounding works, or avalanche versus snowball for paying off debt. Answers are educational, not advice; the decision stays yours.',
    },
    {
      id: 'sign-in',
      title: 'Sign in for answers about you',
      body: 'Without an account the panel offers setup help. Sign in to ask about your own budget and spending.',
      needs: ['signedOut'],
    },
    {
      id: 'consent',
      title: 'It asks before sending',
      body: 'Before your first question about your figures, it shows what would be sent and to whom. Not now puts your question back in the box, unsent.',
      output: ConsentPicture,
      needs: ['signedIn'],
    },
    {
      id: 'report',
      title: 'Report, clear or close',
      body: 'Report flags an answer as wrong or harmful, Clear deletes the conversation saved on this device, and Esc closes the panel.',
    },
    {
      id: 'setup',
      target: SETUP_CHAT,
      title: 'Setup help, no account needed',
      body: 'This opens FinatriX AI, where Setup help answers how-do-I questions, like importing a statement. Those answers come from your device and send nothing.',
      // Coming back from another page, the dashboard may not have mounted
      // yet when this runs, so wait for the button before opening its
      // (collapsed) Getting started section.
      before: async ({ reveal }) => {
        for (let i = 0; i < 25 && !document.querySelector(SETUP_CHAT); i += 1) {
          await new Promise((r) => setTimeout(r, 60));
        }
        reveal(SETUP_CHAT);
      },
      output: SetupPicture,
    },
    {
      id: 'ask-figure',
      target: '[data-tour="ai-ask"]',
      route: '/tools/budget',
      title: 'Ask about any figure',
      body: 'A ✨ button beside a figure opens FinatriX AI already pointed at it, with questions worth asking about that figure.',
    },
    {
      id: 'permission',
      target: '[data-tour="settings-ai-consent"]',
      route: '/tools/settings',
      title: 'Change your mind any time',
      body: 'Allow or withdraw AI permission here. Withdrawing stops future requests, and the panel will ask again next time.',
    },
    {
      id: 'good',
      // Pointed at a real control on purpose: a step with no target that
      // changes route ends the tour (resuming here would do exactly that).
      target: '[data-tour="settings-ai-consent"]',
      route: '/tools/settings',
      title: 'What good looks like',
      body: 'A short answer built from your own records, with every amount traced and any estimate named. This is an example, not your data.',
      output: GoodAnswer,
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default ai;
