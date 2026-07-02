import { useState } from 'react';
import { Link } from 'react-router';
import { TOOLS, type Tool } from '../lib/tools';
import { ToolIcon } from '../components/ToolIcon';
import { CURRENCY_COUNT } from '../tools/lib/format';

const byId = (id: string) => TOOLS.find((t) => t.id === id)!;

const OUTER: Array<{ tool: Tool; cell: number }> = [
  { tool: byId('budget'), cell: 0 },
  { tool: byId('expenses'), cell: 1 },
  { tool: byId('investmatch'), cell: 2 },
  { tool: byId('goals'), cell: 3 },
  { tool: byId('peercompare'), cell: 5 },
  { tool: byId('parksmart'), cell: 6 },
  { tool: byId('lifemap'), cell: 7 },
];

const CELL_XY: Record<number, [number, number]> = {
  0: [50, 50], 1: [150, 50], 2: [250, 50],
  3: [50, 150], 5: [250, 150],
  6: [50, 250], 7: [150, 250], 8: [250, 250],
};

const ALL_TOOL: Tool = {
  id: 'all', name: 'All tools', short: 'All', blurb: 'Open the full suite.',
  href: '/tools', color: '#9AA0A6', icon: 'grid',
};

// Meaningful trust indicators. The supported-currency count is read from the
// currency configuration (never hardcoded).
const TRUST: string[] = [
  `${CURRENCY_COUNT} currencies`,
  'Made in India 🇮🇳',
  'Privacy first',
  'Education first',
  'Free forever',
  'Real-time calculations',
];

export default function LandingHero() {
  const [active, setActive] = useState<Tool | null>(null);

  return (
    <section className="relative min-h-[100dvh] w-full overflow-hidden bg-[#060607] flex flex-col items-center justify-center px-5 pt-28 pb-20">
      {/* ── Layered ambient lighting ── */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div
          className="fx-aurora absolute left-1/2 top-[34%] h-[78vh] w-[78vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px] opacity-[0.20]"
          style={{ background: 'radial-gradient(circle at 50% 50%, #E6C766 0%, #9c7a26 38%, transparent 70%)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(1100px 560px at 50% 30%, rgba(212,175,55,0.07), transparent 70%), radial-gradient(900px 700px at 50% 118%, rgba(80,120,255,0.05), transparent 62%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
            backgroundSize: '52px 52px',
            maskImage: 'radial-gradient(circle at 50% 42%, black 0%, transparent 72%)',
            WebkitMaskImage: 'radial-gradient(circle at 50% 42%, black 0%, transparent 72%)',
          }}
        />
        {/* vignette */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 30%, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />
      </div>

      {/* ── Eyebrow ── */}
      <div className="fx-in relative z-10 mb-9 inline-flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] px-3.5 py-1.5 backdrop-blur-sm" style={{ animationDelay: '0s' }}>
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D4AF37] opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#D4AF37]" />
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#C9C9C2]">
          Money, quantified · built for India
        </span>
      </div>

      {/* ── Constellation ── */}
      <div className="relative z-10 w-[clamp(280px,62vh,500px)] aspect-square">
        <svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id="fxConnGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#D4AF37" stopOpacity="0.12" />
            </linearGradient>
          </defs>
          {[...OUTER.map((o) => o.cell), 8].map((cell, i) => {
            const [x, y] = CELL_XY[cell];
            return (
              <line
                key={cell}
                className="fx-line-in fx-conn"
                style={{ animationDelay: `${0.2 + i * 0.03}s` }}
                x1="150" y1="150" x2={x} y2={y}
                stroke="url(#fxConnGrad)" strokeWidth="1.4"
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }).map((_, cell) => {
            if (cell === 4) {
              return (
                <div key="hub" className="flex items-center justify-center">
                  <div className="relative">
                    <span className="fx-hub-ring absolute inset-0 rounded-[26%] bg-[#D4AF37]/30" aria-hidden="true" />
                    <Link
                      to="/tools"
                      aria-label="Open all tools"
                      onMouseEnter={() => setActive(null)}
                      style={{ animationDelay: '0.05s' }}
                      className="fx-in fx-card-hover relative grid place-items-center w-[clamp(60px,19vmin,98px)] aspect-square rounded-[26%]"
                    >
                      <span className="absolute inset-0 rounded-[26%]" style={{ background: 'linear-gradient(150deg, #F0D779, #C49B2E)', boxShadow: '0 14px 44px -10px rgba(212,175,55,0.65), inset 0 1px 0 rgba(255,255,255,0.55)' }} />
                      <span className="absolute inset-x-0 top-0 h-1/2 rounded-t-[26%] bg-gradient-to-b from-white/35 to-transparent" />
                      <span className="relative h-[24%] w-[24%] rounded-full bg-[#0A0A0A] ring-2 ring-black/20" />
                    </Link>
                  </div>
                </div>
              );
            }
            const entry = OUTER.find((o) => o.cell === cell);
            const tool = entry?.tool ?? ALL_TOOL;
            return (
              <div key={cell} className="flex items-center justify-center">
                <div className="fx-tile-breathe" style={{ animationDelay: `${cell * 0.4}s` }}>
                  <Link
                    to={tool.href}
                    aria-label={tool.name}
                    onMouseEnter={() => setActive(tool.id === 'all' ? null : tool)}
                    onFocus={() => setActive(tool.id === 'all' ? null : tool)}
                    onMouseLeave={() => setActive(null)}
                    style={{
                      background: `linear-gradient(155deg, ${tool.color}, ${tool.color}aa 55%, ${tool.color}66)`,
                      border: `1px solid ${tool.color}55`,
                      boxShadow: `0 12px 34px -12px ${tool.color}88, inset 0 1px 0 rgba(255,255,255,0.22)`,
                      animationDelay: `${0.28 + cell * 0.05}s`,
                    }}
                    className="fx-in fx-card-hover group relative grid place-items-center w-[clamp(56px,17vmin,92px)] aspect-square rounded-[24%] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[24%] bg-gradient-to-b from-white/25 to-transparent" />
                    <ToolIcon name={tool.icon} className="relative w-[40%] h-[40%] drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Wordmark + label + CTAs ── */}
      <div className="relative z-10 mt-9 sm:mt-11 text-center max-w-[680px]">
        <h1
          className="fx-in font-extrabold italic tracking-[-0.035em] leading-[0.92] text-white"
          style={{ fontSize: 'clamp(46px,9.5vw,108px)', animationDelay: '0.78s' }}
        >
          Finatri<span className="fx-gold-text">X</span>
        </h1>

        <div className="fx-in mt-4 h-[24px] flex items-center justify-center" style={{ animationDelay: '0.86s' }}>
          <p className="text-[13.5px] sm:text-[15px] text-[#9c9c96]">
            {active ? (
              <span>
                <span className="text-[#F4F4EF] font-medium">{active.name}</span>
                <span className="mx-2 text-[#3a3a3a]">·</span>
                {active.blurb}
              </span>
            ) : (
              'A complete money toolkit — refined into one premium experience.'
            )}
          </p>
        </div>

        <div className="fx-in mt-8 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: '0.94s' }}>
          <Link to="/tools" className="fx-btn-gold group inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] px-7 py-3.5 rounded-full">
            Launch the tools
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <a href="#showcase" className="fx-btn-ghost inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] px-6 py-3.5 rounded-full">
            Explore
          </a>
        </div>

        {/* trust strip — premium feature chips */}
        <div className="fx-in mt-11 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5" style={{ animationDelay: '1.04s' }}>
          {TRUST.map((label, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.03] px-3 py-1.5 backdrop-blur-sm"
            >
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
