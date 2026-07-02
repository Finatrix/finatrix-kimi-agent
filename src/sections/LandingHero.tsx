import { Link } from 'react-router';
import { TOOLS, type Tool } from '../lib/tools';
import { ToolIcon } from '../components/ToolIcon';
import { BrandLogo } from '../components/BrandLogo';
import { CURRENCY_COUNT } from '../tools/lib/format';

const byId = (id: string) => TOOLS.find((t) => t.id === id)!;

// Display name + one-line subtitle for each hero card (matches the design).
interface HeroCard {
  tool: Tool;
  name: string;
  sub: string;
}
const HERO_CARDS: HeroCard[] = [
  { tool: byId('budget'), name: 'Budget', sub: 'Plan smart, spend better' },
  { tool: byId('expenses'), name: 'Expenses', sub: 'Track everything, stay on budget' },
  { tool: byId('investmatch'), name: 'InvestMatch', sub: 'Find the right investments' },
  { tool: byId('parksmart'), name: 'ParkSmart', sub: 'Smart parking made simple' },
  { tool: byId('peercompare'), name: 'PeerCompare', sub: 'Compare, decide, stay ahead' },
  { tool: byId('goals'), name: 'Goals', sub: 'Set goals, achieve more' },
  { tool: byId('lifemap'), name: 'LifeMap', sub: 'Map your life, secure your future' },
];

const TRUST: string[] = [
  `${CURRENCY_COUNT} currencies`,
  'Made in India 🇮🇳',
  'Privacy first',
  'Education first',
  'Free forever',
  'Real-time calculations',
];

function ToolCard({ card, i }: { card: HeroCard; i: number }) {
  const { tool, name, sub } = card;
  return (
    <Link
      to={tool.href}
      aria-label={`${name} — ${sub}`}
      style={{ animationDelay: `${0.28 + i * 0.06}s` }}
      className="fx-in fx-card-hover group relative flex flex-col items-center gap-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3 py-4 sm:py-5 text-center backdrop-blur-sm transition-all duration-300 hover:border-white/[0.14] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
      <span className="relative text-[15px] font-semibold tracking-[-0.01em] text-white [text-shadow:0_0_18px_rgba(255,255,255,0.18)]">
        {name}
      </span>
      <span className="relative text-[11.5px] leading-snug text-[#8f8f89]">{sub}</span>
    </Link>
  );
}

function ComingSoonCard() {
  return (
    <div
      aria-label="Coming soon"
      style={{ animationDelay: `${0.28 + 7 * 0.06}s` }}
      className="fx-in fx-card-hover group relative flex flex-col items-center gap-2.5 rounded-2xl border border-[#D4AF37]/45 px-3 py-4 sm:py-5 text-center backdrop-blur-sm transition-all duration-300 hover:border-[#D4AF37]"
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{ background: 'linear-gradient(160deg, rgba(212,175,55,0.16), rgba(212,175,55,0.04) 60%, transparent)', boxShadow: '0 22px 60px -18px rgba(212,175,55,0.6), inset 0 1px 0 rgba(255,255,255,0.18)' }}
        aria-hidden="true"
      />
      <span
        className="relative grid h-12 w-12 place-items-center rounded-[22%]"
        style={{ background: 'linear-gradient(150deg, #F0D779, #C49B2E)', boxShadow: '0 12px 30px -10px rgba(212,175,55,0.7), inset 0 1px 0 rgba(255,255,255,0.5)' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1400" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </span>
      <span className="relative text-[15px] font-semibold tracking-[-0.01em] text-[#F0D779] [text-shadow:0_0_20px_rgba(212,175,55,0.4)]">
        Coming Soon
      </span>
      <span className="relative text-[11.5px] leading-snug text-[#b9a874]">Something amazing is on the way</span>
    </div>
  );
}

export default function LandingHero() {
  return (
    <section className="relative min-h-[100dvh] w-full overflow-hidden bg-[#060607] flex flex-col items-center justify-center px-5 pt-28 pb-20">
      {/* ── Layered ambient lighting ── */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="fx-aurora absolute left-1/2 top-[34%] h-[78vh] w-[78vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px] opacity-[0.20]" style={{ background: 'radial-gradient(circle at 50% 50%, #E6C766 0%, #9c7a26 38%, transparent 70%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(1100px 560px at 50% 30%, rgba(212,175,55,0.07), transparent 70%), radial-gradient(900px 700px at 50% 118%, rgba(80,120,255,0.05), transparent 62%)' }} />
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '52px 52px', maskImage: 'radial-gradient(circle at 50% 42%, black 0%, transparent 72%)', WebkitMaskImage: 'radial-gradient(circle at 50% 42%, black 0%, transparent 72%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 30%, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />
      </div>

      {/* ── Eyebrow ── */}
      <div className="fx-in relative z-10 mb-8 inline-flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] px-3.5 py-1.5 backdrop-blur-sm" style={{ animationDelay: '0s' }}>
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D4AF37] opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#C9C9C2]">Money, quantified · built for India</span>
      </div>

      {/* ── Tool grid + centre logo hub (constellation) ── */}
      <div className="relative z-10 w-full max-w-[760px]">
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
            <Link to="/tools" aria-label="Open all tools" className="fx-in fx-card-hover relative grid h-[74px] w-[74px] place-items-center rounded-full border border-[#D4AF37]/40 bg-[#0A0A0A]" style={{ animationDelay: '0.05s', boxShadow: '0 14px 44px -10px rgba(212,175,55,0.6)' }}>
              <BrandLogo size={52} style={{ borderRadius: '50%' }} />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-4">
          {HERO_CARDS.map((c, i) => (
            <ToolCard key={c.tool.id} card={c} i={i} />
          ))}
          <ComingSoonCard />
        </div>
      </div>

      {/* ── Wordmark + CTAs ── */}
      <div className="relative z-10 mt-9 sm:mt-10 text-center max-w-[720px]">
        <h1
          className="fx-in font-extrabold italic tracking-[-0.035em] leading-[0.95] text-white"
          style={{ fontSize: 'clamp(44px,9vw,102px)', animationDelay: '0.78s', paddingRight: '0.16em', paddingBottom: '0.06em', overflow: 'visible' }}
        >
          Finatri<span className="fx-gold-text">X</span>
        </h1>

        <p className="fx-in mt-4 text-[13.5px] sm:text-[15px] text-[#9c9c96]" style={{ animationDelay: '0.86s' }}>
          A complete money toolkit — refined into one premium experience.
        </p>

        <div className="fx-in mt-8 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: '0.94s' }}>
          <Link to="/tools" className="fx-btn-gold group inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] px-7 py-3.5 rounded-full">
            Launch the tools
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <a href="#showcase" className="fx-btn-ghost inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] px-6 py-3.5 rounded-full">
            Explore
          </a>
        </div>

        {/* trust strip — unchanged */}
        <div className="fx-in mt-11 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5" style={{ animationDelay: '1.04s' }}>
          {TRUST.map((label, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.03] px-3 py-1.5 backdrop-blur-sm">
              <span className="h-1 w-1 rounded-full bg-[#D4AF37]" aria-hidden="true" />
              <span className="font-mono text-[10px] sm:text-[10.5px] uppercase tracking-[0.1em] text-[#C9C9C2]">{label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* scroll cue */}
      <a href="#showcase" aria-label="Scroll to features" className="fx-scroll-cue absolute bottom-7 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-[#6b6b70] hover:text-[#D4AF37] transition-colors">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em]">Scroll</span>
        <span className="h-7 w-[1px] bg-gradient-to-b from-[#D4AF37] to-transparent" />
      </a>
    </section>
  );
}
