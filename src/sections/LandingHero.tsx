import { Link } from 'react-router';
import { TOOLS, type Tool } from '../lib/tools';
import { ToolIcon } from '../components/ToolIcon';
import { BrandLogo } from '../components/BrandLogo';
import { CURRENCY_COUNT } from '../tools/lib/format';
import { TOOL_COUNT_WORD_CAP } from '../shared/toolCount';

const byId = (id: string) => TOOLS.find((t) => t.id === id)!;

/**
 * Display name + one-line subtitle for each hero card.
 *
 * The subtitles describe what the tool does, which two of them did not: on a
 * personal-finance site "Smart parking made simple" reads as an app for finding
 * parking spaces, and PeerCompare's "Compare, decide, stay ahead" survived a
 * rebuild that changed what it compares you against.
 */
interface HeroCard {
  tool: Tool;
  name: string;
  sub: string;
}
const HERO_CARDS: HeroCard[] = [
  { tool: byId('budget'), name: 'Budget', sub: 'Plan smart, spend better' },
  { tool: byId('expenses'), name: 'Expenses', sub: 'Track everything, stay on budget' },
  { tool: byId('investmatch'), name: 'InvestMatch', sub: 'Find the right investments' },
  { tool: byId('parksmart'), name: 'ParkSmart', sub: 'Best post-tax home for idle cash' },
  { tool: byId('peercompare'), name: 'PeerCompare', sub: 'Measure against national benchmarks' },
  { tool: byId('goals'), name: 'Goals', sub: 'Set goals, achieve more' },
  { tool: byId('lifemap'), name: 'LifeMap', sub: 'Map your life, secure your future' },
  { tool: byId('networth'), name: 'Net Worth', sub: 'Track what you own and owe' },
];

/**
 * The trust strip.
 *
 * "Free forever" used to sit here unqualified, on the same viewport as the
 * gold Careers card selling a ₹199–₹2,499/month subscription. Scoped to the
 * money tools it is true and worth saying; unscoped, beside a paid upsell, it
 * is the kind of claim India's CCPA misleading-advertisement rules exist for.
 * The qualifier is three words and costs nothing.
 */
const TRUST: string[] = [
  `${CURRENCY_COUNT} currencies`,
  'Made in India 🇮🇳',
  'Privacy first',
  'Education first',
  'Money tools free forever',
  'Real-time calculations',
];

function ToolCard({ card, i }: { card: HeroCard; i: number }) {
  const { tool, name, sub } = card;
  return (
    <Link
      to={tool.href}
      aria-label={`${name} — ${sub}`}
      style={{ animationDelay: `${0.28 + i * 0.06}s` }}
      className="fx-in fx-card-hover group relative flex flex-col items-center gap-2.5 rounded-2xl border border-[color:var(--tile-border)] bg-[var(--tile-bg)] px-3 py-4 sm:py-5 text-center backdrop-blur-sm transition-all duration-300 hover:border-[color:var(--tile-border-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/70"
    >
      {/* per-tool colour wash + glow on hover */}
      <span
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(120% 80% at 50% 0%, ${tool.color}22, transparent 70%)`, boxShadow: `0 18px 46px -18px ${tool.color}77` }}
        aria-hidden="true"
      />
      {/* existing premium icon tile (unchanged) */}
      <span
        className="relative grid h-12 w-12 place-items-center rounded-[22%] text-white"
        style={{
          background: `linear-gradient(155deg, ${tool.color}, ${tool.color}aa 55%, ${tool.color}66)`,
          border: `1px solid ${tool.color}55`,
          boxShadow: `0 12px 30px -12px ${tool.color}88, inset 0 1px 0 rgba(255,255,255,0.22)`,
        }}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[22%] bg-gradient-to-b from-white/25 to-transparent" />
        <ToolIcon name={tool.icon} className="relative h-[46%] w-[46%] drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" />
      </span>
      <span className="relative text-[15px] font-semibold tracking-[-0.01em] text-ink">
        {name}
      </span>
      <span className="relative text-[11.5px] leading-snug text-ink-3">{sub}</span>
    </Link>
  );
}

/**
 * FinatriX Careers — a premium spotlight BELOW the tool grid, deliberately
 * styled apart from the finance tools (gold glow, AI badge) rather than
 * presented as just another tile.
 *
 * It used to occupy the eighth cell of a 4x2 grid. With eight calculators that
 * cell is spoken for, and a ninth half-width tile would either leave an orphan
 * beside a gap or force an odd column count — which is what the centre logo hub
 * is centred on. As its own full-width row it keeps the constellation's
 * crosshair intact and gives the paid product more presence, not less.
 */
function CareersSpotlightCard() {
  return (
    <Link
      to="/careers"
      aria-label="FinatriX Careers — AI-powered resume intelligence, job search, ATS optimization and career coach"
      style={{ animationDelay: `${0.28 + HERO_CARDS.length * 0.06}s` }}
      className="fx-in fx-card-hover group relative flex flex-col items-center gap-2 rounded-2xl border border-[#D4AF37]/45 px-4 py-4 text-center backdrop-blur-sm transition-all duration-300 hover:border-[#D4AF37] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/70 sm:flex-row sm:gap-4 sm:px-5 sm:text-left"
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
        style={{ background: 'linear-gradient(160deg, rgba(212,175,55,0.16), rgba(212,175,55,0.04) 60%, transparent)', boxShadow: '0 22px 60px -18px rgba(212,175,55,0.6), inset 0 1px 0 rgba(255,255,255,0.18)' }}
        aria-hidden="true"
      />
      <span
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: 'radial-gradient(120% 80% at 50% 0%, rgba(212,175,55,0.22), transparent 70%)', boxShadow: '0 26px 70px -16px rgba(212,175,55,0.75)' }}
        aria-hidden="true"
      />
      <span
        className="relative grid h-12 w-12 place-items-center rounded-[22%] transition-transform duration-300 group-hover:scale-105"
        style={{ background: 'linear-gradient(150deg, #F0D779, #C49B2E)', boxShadow: '0 12px 30px -10px rgba(212,175,55,0.7), inset 0 1px 0 rgba(255,255,255,0.5)' }}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[22%] bg-gradient-to-b from-white/25 to-transparent" />
        {/* briefcase */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1400" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          <path d="M3 12h18" />
        </svg>
      </span>
      <span className="relative flex flex-col items-center gap-1 sm:flex-1 sm:items-start">
        <span className="inline-flex items-center gap-1 rounded-full border border-[#D4AF37]/50 bg-[#D4AF37]/10 px-2 py-[2px] font-mono text-[8.5px] uppercase tracking-[0.14em] text-accent-text">
          <span className="h-1 w-1 rounded-full bg-[#D4AF37]" aria-hidden="true" />
          AI Powered
        </span>
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-accent-text [text-shadow:0_0_20px_rgba(212,175,55,0.25)]">
          FinatriX Careers
        </span>
        <span className="text-[11.5px] leading-snug text-ink-2">
          Resume intelligence, job search, ATS optimization &amp; career coach
        </span>
      </span>
      {/* Decorative: the whole banner is one link, so this is an affordance
          rather than a second target. */}
      <span
        className="relative hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent-text sm:inline-flex"
        aria-hidden="true"
      >
        Explore
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </Link>
  );
}

export default function LandingHero() {
  return (
    <section className="relative min-h-[100dvh] w-full overflow-hidden bg-surface-base flex flex-col items-center justify-center px-5 pt-28 pb-20">
      {/* ── Layered ambient lighting (theme-aware via tokens) ── */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="fx-aurora absolute left-1/2 top-[34%] h-[78vh] w-[78vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]" style={{ background: 'var(--hero-aurora)', opacity: 'var(--hero-aurora-opacity)' }} />
        <div className="absolute inset-0" style={{ background: 'var(--hero-wash)' }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'var(--hero-grid)', backgroundSize: '52px 52px', opacity: 'var(--hero-grid-opacity)', maskImage: 'radial-gradient(circle at 50% 42%, black 0%, transparent 72%)', WebkitMaskImage: 'radial-gradient(circle at 50% 42%, black 0%, transparent 72%)' }} />
        <div className="absolute inset-0" style={{ background: 'var(--hero-vignette)' }} />
      </div>

      {/* ── Eyebrow ── */}
      <div className="fx-in relative z-10 mb-8 inline-flex items-center gap-2 rounded-full border border-hairline bg-[var(--tile-bg)] px-3.5 py-1.5 backdrop-blur-sm" style={{ animationDelay: '0s' }}>
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D4AF37] opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-2">Money, quantified · built for India</span>
      </div>

      {/* ── Tool grid + centre logo hub (constellation) ── */}
      <div className="relative z-10 w-full max-w-[760px]">
        {/* The hub is centred on the GRID alone — its crosshair sits in the gap
            between the four columns and the two rows, which is why the Careers
            spotlight below is a sibling rather than another cell. */}
        <div className="relative">
        {/* decorative connectors + logo hub (desktop) */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 hidden -translate-x-1/2 -translate-y-1/2 lg:block">
          <svg width="220" height="130" viewBox="0 0 220 130" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
            <defs>
              <linearGradient id="fxConnGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#D4AF37" stopOpacity="0.1" />
              </linearGradient>
            </defs>
            {[[110, 65, 110, 0], [110, 65, 110, 130], [110, 65, 0, 65], [110, 65, 220, 65]].map(([x1, y1, x2, y2], i) => (
              <line key={i} className="fx-line-in fx-conn" style={{ animationDelay: `${0.3 + i * 0.05}s` }} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#fxConnGrad)" strokeWidth="1.4" />
            ))}
          </svg>
          <div className="relative">
            <span className="fx-hub-ring absolute inset-0 rounded-full bg-[#D4AF37]/25" aria-hidden="true" />
            <Link to="/tools" aria-label="Open all tools" className="fx-in fx-card-hover relative grid h-[74px] w-[74px] place-items-center rounded-full border border-[#D4AF37]/40 bg-surface-1" style={{ animationDelay: '0.05s', boxShadow: '0 14px 44px -10px rgba(212,175,55,0.6)' }}>
              <BrandLogo size={52} style={{ borderRadius: '50%' }} />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-4">
          {HERO_CARDS.map((c, i) => (
            <ToolCard key={c.tool.id} card={c} i={i} />
          ))}
        </div>
        </div>

        <div className="mt-3 sm:mt-3.5">
          <CareersSpotlightCard />
        </div>
      </div>

      {/* ── Wordmark + CTAs ── */}
      <div className="relative z-10 mt-9 sm:mt-10 text-center max-w-[720px]">
        {/*
          The h1 carries the proposition, not just the brand.

          It used to be the single word "FinatriX" — the strongest heading
          signal on the highest-authority page of the site, saying nothing about
          money, India, budgeting or anything a person searches for. The
          wordmark is still the visual anchor; the line under it is now inside
          the heading rather than a separate <p>, so the h1 has real text.

          It also no longer carries `fx-in`. `animation-fill-mode: backwards`
          held it at opacity 0 through a 0.78s stagger delay before a 0.62s
          fade — and at clamp(44px, 9vw, 102px) this element is almost
          certainly the LCP. That was ~1.4s of Largest Contentful Paint spent on
          choreography. The cards above still stagger; the headline paints
          immediately.
        */}
        <h1 className="font-extrabold tracking-[-0.035em] leading-[0.95] text-ink">
          <span
            className="block italic"
            style={{ fontSize: 'clamp(44px,9vw,102px)', paddingRight: '0.16em', paddingBottom: '0.06em', overflow: 'visible' }}
          >
            Finatri<span className="fx-gold-text">X</span>
          </span>
          <span className="mt-4 block text-[13.5px] font-medium not-italic tracking-normal leading-snug text-ink-2 sm:text-[15px]">
            {TOOL_COUNT_WORD_CAP} free money tools for India — budgeting, investing, benchmarking
            and a lifelong wealth simulation.
          </span>
        </h1>

        <div className="fx-in mt-8 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: '0.34s' }}>
          <Link to="/tools" className="fx-btn-gold group inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] px-7 py-3.5 rounded-full">
            Launch the tools
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <a href="#showcase" className="fx-btn-ghost inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] px-6 py-3.5 rounded-full">
            Explore
          </a>
        </div>

        {/* trust strip */}
        <div className="fx-in mt-11 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5" style={{ animationDelay: '0.42s' }}>
          {TRUST.map((label, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-[var(--tile-bg)] px-3 py-1.5 backdrop-blur-sm">
              <span className="h-1 w-1 rounded-full bg-[#D4AF37]" aria-hidden="true" />
              <span className="font-mono text-[10px] sm:text-[10.5px] uppercase tracking-[0.1em] text-ink-2">{label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* scroll cue */}
      <a href="#showcase" aria-label="Scroll to features" className="fx-scroll-cue absolute bottom-7 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-ink-3 hover:text-accent-text transition-colors">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em]">Scroll</span>
        <span className="h-7 w-[1px] bg-gradient-to-b from-[#D4AF37] to-transparent" />
      </a>
    </section>
  );
}
