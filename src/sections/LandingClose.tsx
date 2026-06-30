import { Link } from 'react-router';
import Reveal from '../components/Reveal';

const PRINCIPLES: Array<{ title: string; body: string; icon: 'lock' | 'flag' | 'spark' }> = [
  { title: 'Private by default', body: 'Your numbers stay on your device as a guest, or encrypted to your account when you sign in. No ads, no trackers.', icon: 'lock' },
  { title: 'Built for India', body: 'Tax slabs, SIPs, 14-city benchmarks, Lakh/Crore formatting and 40 currencies — calibrated, not generic.', icon: 'flag' },
  { title: 'Free, forever', body: 'Every tool, every feature, ₹0. FinatriX is an education-first toolkit — clarity without the paywall.', icon: 'spark' },
];

function Glyph({ name }: { name: 'lock' | 'flag' | 'spark' }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'lock') return (<svg {...common}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>);
  if (name === 'flag') return (<svg {...common}><path d="M5 21V4" /><path d="M5 4h11l-2 3 2 3H5" /></svg>);
  return (<svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" /></svg>);
}

export default function LandingClose() {
  return (
    <section className="relative w-full bg-[#060607] px-5 sm:px-8 pb-28">
      {/* Principles */}
      <div className="mx-auto max-w-[1120px] grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {PRINCIPLES.map((p, i) => (
          <Reveal key={p.title} delay={i * 80}>
            <div className="fx-glass rounded-[20px] p-7 h-full">
              <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-[#D4AF37]/25 bg-[#D4AF37]/[0.08] text-[#D4AF37]">
                <Glyph name={p.icon} />
              </span>
              <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.01em] text-[#F4F4EF]">{p.title}</h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-[#9c9c96]">{p.body}</p>
            </div>
          </Reveal>
        ))}
      </div>

      {/* Closing CTA */}
      <Reveal className="mx-auto max-w-[1120px] mt-6">
        <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] px-6 sm:px-12 py-16 sm:py-20 text-center">
          <div className="pointer-events-none absolute inset-0 -z-0" style={{ background: 'radial-gradient(120% 140% at 50% 0%, rgba(212,175,55,0.16), transparent 60%), linear-gradient(180deg, #0d0d0f, #0a0a0b)' }} />
          <div className="relative z-10">
            <h2 className="mx-auto max-w-[680px] text-[clamp(28px,4.6vw,46px)] font-semibold leading-[1.06] tracking-[-0.025em] text-white">
              Your clearest financial picture is{' '}
              <span className="fx-gold-text">one tap away.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-[480px] text-[15px] leading-relaxed text-[#a3a39d]">
              Start as a guest in seconds. Create a free account to save and sync across every device.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link to="/tools" className="fx-btn-gold inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] px-7 py-3.5 rounded-full">
                Launch the tools <span>→</span>
              </Link>
              <Link to="/signup" className="fx-btn-ghost inline-flex items-center font-mono text-[12px] uppercase tracking-[0.1em] px-6 py-3.5 rounded-full">
                Create free account
              </Link>
            </div>
            <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5A5A5A]">
              Educational tools · not financial advice
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
