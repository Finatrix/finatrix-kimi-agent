import { Link } from 'react-router';
import { TOOLS } from '../lib/tools';
import { ToolIcon } from '../components/ToolIcon';
import Reveal from '../components/Reveal';

export default function LandingShowcase() {
  return (
    <section id="showcase" className="relative w-full bg-[#060607] px-5 sm:px-8 py-24 sm:py-32">
      <div className="mx-auto max-w-[1120px]">
        <Reveal className="max-w-[640px]">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#D4AF37]">The toolkit</span>
          <h2 className="mt-4 text-[clamp(30px,5vw,52px)] font-semibold leading-[1.04] tracking-[-0.025em] text-white">
            Seven tools.<br />
            <span className="text-[#8A8A84]">One clear picture of your money.</span>
          </h2>
          <p className="mt-5 text-[15px] sm:text-[16px] leading-relaxed text-[#9c9c96]">
            Each one is purpose-built for India — and they all share the same data, currency
            and design, so moving between them feels like one continuous experience.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {TOOLS.map((t, i) => (
            <Reveal key={t.id} delay={i * 60}>
              <Link
                to={t.href}
                aria-label={`Open ${t.name}`}
                className="fx-glass fx-card-hover group relative flex h-full flex-col rounded-[20px] p-6 overflow-hidden"
              >
                {/* top accent line in the tool colour */}
                <span
                  className="absolute inset-x-0 top-0 h-[2px] opacity-70 transition-opacity duration-300 group-hover:opacity-100"
                  style={{ background: `linear-gradient(90deg, transparent, ${t.color}, transparent)` }}
                />
                <span
                  className="grid h-12 w-12 place-items-center rounded-[14px] text-white"
                  style={{
                    background: `linear-gradient(150deg, ${t.color}, ${t.color}99)`,
                    boxShadow: `0 10px 26px -12px ${t.color}99, inset 0 1px 0 rgba(255,255,255,0.22)`,
                  }}
                >
                  <ToolIcon name={t.icon} className="h-[22px] w-[22px]" />
                </span>
                <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.01em] text-[#F4F4EF]">{t.name}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#9c9c96] flex-grow">{t.blurb}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#8A8A84] transition-colors group-hover:text-[#D4AF37]">
                  Open
                  <span className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
                </span>
              </Link>
            </Reveal>
          ))}

          {/* All-tools card */}
          <Reveal delay={TOOLS.length * 60}>
            <Link
              to="/tools"
              className="fx-card-hover group relative flex h-full flex-col justify-between rounded-[20px] p-6 overflow-hidden"
              style={{ background: 'linear-gradient(155deg, #EAD27E, #C49B2E)', boxShadow: '0 18px 50px -20px rgba(212,175,55,0.5), inset 0 1px 0 rgba(255,255,255,0.4)' }}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#0A0A0A]/60">The full suite</span>
              <div className="mt-8">
                <h3 className="text-[22px] font-semibold tracking-[-0.01em] text-[#0A0A0A]">Open everything</h3>
                <span className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#0A0A0A]">
                  Launch tools
                  <span className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
                </span>
              </div>
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
