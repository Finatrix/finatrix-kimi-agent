import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import gsap from 'gsap';
import { TOOLS, type Tool } from '../lib/tools';
import { ToolIcon } from '../components/ToolIcon';

const byId = (id: string) => TOOLS.find((t) => t.id === id)!;

// 3×3 layout mirroring the FinatriX logo: 8 tiles around a central hub.
// Order is row-major; index 4 is the hub (rendered separately).
const OUTER: Array<{ tool: Tool; cell: number }> = [
  { tool: byId('budget'), cell: 0 },
  { tool: byId('expenses'), cell: 1 },
  { tool: byId('investmatch'), cell: 2 },
  { tool: byId('goals'), cell: 3 },
  { tool: byId('peercompare'), cell: 5 },
  { tool: byId('parksmart'), cell: 6 },
  { tool: byId('lifemap'), cell: 7 },
];

// SVG connector endpoints (viewBox 0 0 300 300), hub at 150,150.
const CELL_XY: Record<number, [number, number]> = {
  0: [50, 50], 1: [150, 50], 2: [250, 50],
  3: [50, 150], 5: [250, 150],
  6: [50, 250], 7: [150, 250], 8: [250, 250],
};

export default function LandingHero() {
  const rootRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<Tool | null>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.fx-hub', { scale: 0.3, opacity: 0, duration: 0.6, ease: 'back.out(1.7)' })
        .from('.fx-line', { strokeDashoffset: 170, opacity: 0, duration: 0.7, stagger: 0.05 }, '-=0.3')
        .from(
          '.fx-tile',
          { scale: 0.45, opacity: 0, y: 16, duration: 0.5, stagger: 0.06, ease: 'back.out(1.6)', clearProps: 'transform,opacity' },
          '-=0.5'
        )
        .from('.fx-word', { y: 22, opacity: 0, duration: 0.7 }, '-=0.2')
        .from('.fx-sub', { y: 14, opacity: 0, duration: 0.6 }, '-=0.45');
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={rootRef}
      className="relative min-h-[100dvh] w-full overflow-hidden bg-[#070707] flex flex-col items-center justify-center px-5 pt-28 pb-16"
    >
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div
          className="fx-aurora absolute left-1/2 top-1/2 h-[80vh] w-[80vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px] opacity-[0.22]"
          style={{ background: 'radial-gradient(circle at 50% 50%, #D4AF37 0%, #b08a36 35%, transparent 70%)' }}
        />
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            background:
              'radial-gradient(1200px 600px at 50% 38%, rgba(212,175,55,0.06), transparent 70%), radial-gradient(800px 800px at 50% 120%, rgba(10,132,255,0.05), transparent 60%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(circle at 50% 45%, black 0%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(circle at 50% 45%, black 0%, transparent 75%)',
          }}
        />
      </div>

      {/* Constellation */}
      <div className="relative z-10 w-[clamp(280px,66vh,520px)] aspect-square">
        {/* connectors */}
        <svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {OUTER.map(({ cell }) => {
            const [x, y] = CELL_XY[cell];
            return (
              <line
                key={cell}
                className="fx-line"
                x1="150" y1="150" x2={x} y2={y}
                stroke="#D4AF37" strokeOpacity="0.32" strokeWidth="1.4"
                strokeDasharray="170"
              />
            );
          })}
          <line
            className="fx-line"
            x1="150" y1="150" x2="250" y2="250"
            stroke="#D4AF37" strokeOpacity="0.32" strokeWidth="1.4" strokeDasharray="170"
          />
        </svg>

        {/* tiles + hub on a 3×3 grid */}
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }).map((_, cell) => {
            if (cell === 4) {
              return (
                <div key="hub" className="flex items-center justify-center">
                  <div className="relative">
                    <span className="fx-hub-ring absolute inset-0 rounded-[22%] bg-[#D4AF37]/30" aria-hidden="true" />
                    <Link
                      to="/tools"
                      aria-label="Open all tools"
                      onMouseEnter={() => setActive(null)}
                      className="fx-hub fx-tile relative grid place-items-center w-[clamp(58px,19vmin,96px)] aspect-square rounded-[22%] shadow-[0_10px_40px_-8px_rgba(212,175,55,0.55)] transition-transform duration-300 hover:scale-[1.06]"
                      style={{ background: 'linear-gradient(145deg, #E9C75A, #B0852E)' }}
                    >
                      <span className="h-[26%] w-[26%] rounded-full bg-[#0A0A0A]" />
                    </Link>
                  </div>
                </div>
              );
            }
            const entry = OUTER.find((o) => o.cell === cell);
            const tool =
              entry?.tool ??
              ({ id: 'all', name: 'All tools', short: 'All', blurb: 'Open the full suite.', href: '/tools', color: '#8A8A8A', icon: 'grid' } as Tool);
            return (
              <div key={cell} className="flex items-center justify-center">
                <div className="fx-tile-breathe" style={{ animationDelay: `${cell * 0.4}s` }}>
                  <Link
                    to={tool.href}
                    aria-label={tool.name}
                    onMouseEnter={() => setActive(tool.id === 'all' ? null : tool)}
                    onFocus={() => setActive(tool.id === 'all' ? null : tool)}
                    onMouseLeave={() => setActive(null)}
                    className="fx-tile group relative grid place-items-center w-[clamp(54px,17vmin,88px)] aspect-square rounded-[22%] text-white transition-[transform,box-shadow] duration-300 hover:scale-[1.1] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                    style={{
                      background: `linear-gradient(150deg, ${tool.color}, ${tool.color}cc)`,
                      boxShadow: `0 8px 30px -10px ${tool.color}99`,
                    }}
                  >
                    <ToolIcon name={tool.icon} className="w-[42%] h-[42%]" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Wordmark + dynamic label */}
      <div className="relative z-10 mt-9 sm:mt-11 text-center">
        <h1
          className="fx-word font-extrabold italic tracking-[-0.03em] leading-none text-white"
          style={{ fontSize: 'clamp(44px,9vw,104px)' }}
        >
          Finatri<span className="text-[#D4AF37]">X</span>
        </h1>

        <div className="fx-sub mt-4 h-[22px] flex items-center justify-center">
          <p key={active?.id ?? 'tagline'} className="text-[13px] sm:text-[15px] text-[#9a9a94] transition-opacity">
            {active ? (
              <span>
                <span className="text-[#F5F5F0] font-medium">{active.name}</span>
                <span className="mx-2 text-[#3a3a3a]">·</span>
                {active.blurb}
              </span>
            ) : (
              'Blending Finance, Innovation & Insights'
            )}
          </p>
        </div>

        <div className="fx-sub mt-7 flex items-center justify-center gap-3">
          <Link
            to="/tools"
            className="group inline-flex items-center gap-2 bg-[#D4AF37] hover:bg-[#F1C40F] text-[#0A0A0A] font-mono text-[12px] uppercase tracking-[0.1em] px-6 py-3 rounded-full transition-colors"
          >
            Launch the tools
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        </div>

        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5A5A5A]">
          Free · Educational tools, not financial advice
        </p>
      </div>
    </section>
  );
}
