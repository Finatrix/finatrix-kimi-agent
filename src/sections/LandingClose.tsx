import { Link } from 'react-router';
import Reveal from '../components/Reveal';

const PRINCIPLES: Array<{ title: string; body: string; icon: 'lock' | 'flag' | 'spark' }> = [
  { title: 'Clear data choices', body: 'Use finance tools locally as a guest. Sign in for account sync. AI requests use an external service; privacy controls explain what is shared.', icon: 'lock' },
  // Was "Built for India". The India depth is real and stays the headline —
  // it is what makes the claim credible — but the tools now carry instrument
  // sets, tax rules and peer benchmarks for four markets, and a card that says
  // "for India" tells three quarters of that audience the product is not for
  // them.
  { title: 'Check the assumptions', body: 'India, the US, the UK, the UAE, Australia, Singapore and Mainland China have separate market settings. Tools show their assumptions and source dates so you can judge whether a result applies to you.', icon: 'flag' },
  { title: 'Free finance tools', body: 'Budgeting, expense tracking and financial planning are free. The Careers workspace has separate paid plans, listed on our pricing page.', icon: 'spark' },
];

function Glyph({ name }: { name: 'lock' | 'flag' | 'spark' }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'lock') return (<svg {...common}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>);
  if (name === 'flag') return (<svg {...common}><path d="M5 21V4" /><path d="M5 4h11l-2 3 2 3H5" /></svg>);
  return (<svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" /></svg>);
}

export default function LandingClose() {
  return (
    <section className="relative w-full bg-surface-base px-5 sm:px-8 pb-28">
      {/* Principles */}
      <div className="mx-auto max-w-[1120px] grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {PRINCIPLES.map((p, i) => (
          <Reveal key={p.title} delay={i * 80}>
            <div className="fx-glass rounded-[20px] p-7 h-full">
              <span className="grid h-11 w-11 place-items-center rounded-[13px] border border-[#D4AF37]/25 bg-[#D4AF37]/[0.08] text-accent-text">
                <Glyph name={p.icon} />
              </span>
              <h3 className="mt-5 text-[17px] font-semibold tracking-[-0.01em] text-ink">{p.title}</h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-ink-2">{p.body}</p>
            </div>
          </Reveal>
        ))}
      </div>

      {/* Closing CTA */}
      <Reveal className="mx-auto max-w-[1120px] mt-6">
        <div className="relative overflow-hidden rounded-[28px] border border-hairline px-6 sm:px-12 py-16 sm:py-20 text-center">
          <div className="pointer-events-none absolute inset-0 -z-0" style={{ background: 'radial-gradient(120% 140% at 50% 0%, rgba(212,175,55,0.16), transparent 60%), var(--surface-2)' }} />
          <div className="relative z-10">
            <h2 className="mx-auto max-w-[680px] text-[clamp(28px,4.6vw,46px)] font-semibold leading-[1.06] tracking-[-0.025em] text-ink">
              Start with this month’s money.
            </h2>
            <p className="mx-auto mt-5 max-w-[480px] text-[15px] leading-relaxed text-ink-2">
              Start as a guest in seconds. Create a free account to save and sync across every device.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link to="/tools" className="fx-btn-gold inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.1em] px-7 py-3.5 rounded-full">
                Open your dashboard <span>→</span>
              </Link>
              <Link to="/signup" className="fx-btn-ghost inline-flex items-center font-mono text-[12px] uppercase tracking-[0.1em] px-6 py-3.5 rounded-full">
                Create free account
              </Link>
            </div>
            <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
              Educational tools · not financial advice
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm text-ink-2">
              <Link to="/editorial-standards" className="underline underline-offset-4">How we check our work</Link>
              <Link to="/contact" className="underline underline-offset-4">Contact the people building FinatriX</Link>
              <Link to="/pricing" className="underline underline-offset-4">See pricing</Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
