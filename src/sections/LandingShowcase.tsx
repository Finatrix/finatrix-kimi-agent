import { Link } from 'react-router';
import { TOOLS } from '../lib/tools';
import { ToolIcon } from '../components/ToolIcon';
import Reveal from '../components/Reveal';
import { TOOL_COUNT_WORD_CAP } from '../shared/toolCount';

export default function LandingShowcase() {
  return (
    <section id="showcase" className="relative w-full bg-surface-base px-5 sm:px-8 py-24 sm:py-32">
      <div className="mx-auto max-w-[1120px]">
        <Reveal className="max-w-[640px]">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-accent-text">The toolkit</span>
          <h2 className="mt-4 text-[clamp(30px,5vw,52px)] font-semibold leading-[1.04] tracking-[-0.025em] text-ink">
            {TOOL_COUNT_WORD_CAP} tools.<br />
            <span className="text-ink-2">Use the ones you need.</span>
          </h2>
          <p className="mt-5 text-[15px] sm:text-[16px] leading-relaxed text-ink-2">
            Start with your monthly budget and expenses. Add a goal, track your net worth or
            explore an investment question when you are ready. Market-specific tools show the
            assumptions they use — and <Link to="/tools/lifemap" className="fx-prose-link">LifeMap</Link>{' '}
            carries the whole picture forward to retirement, which is the view a monthly budget
            cannot give you.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-x-12">
          {TOOLS.map((t, i) => (
            <Reveal key={t.id} delay={i * 60}>
              <Link
                to={t.href}
                aria-label={`Open ${t.name}`}
                className="group relative flex h-full flex-col border-t border-hairline py-7 pr-4"
              >
                {/* top accent line in the tool colour */}
                <span
                  className="text-accent-text"
                >
                  <ToolIcon name={t.icon} className="h-[22px] w-[22px]" />
                </span>
                <h3 className="mt-5 flex flex-wrap items-baseline gap-x-2.5 text-[18px] font-semibold tracking-[-0.01em] text-ink">
                  {t.name}
                  {t.id === 'lifemap' && (
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accent-text">
                      Flagship
                    </span>
                  )}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2 flex-grow">{t.blurb}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-ink-2 transition-colors group-hover:text-accent-text">
                  Open {t.name}
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
