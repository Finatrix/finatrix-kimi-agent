import { Link } from 'react-router';

export default function NotFound() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#060607] text-[#F5F5F0] flex flex-col items-center justify-center px-6 text-center">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px] opacity-[0.16]" style={{ background: 'radial-gradient(circle, #E6C766 0%, #9c7a26 40%, transparent 70%)' }} />
      <span className="relative font-mono text-[11px] uppercase tracking-[0.18em] text-[#D4AF37] mb-4">
        Error 404
      </span>
      <h1 className="text-[52px] sm:text-[84px] font-medium tracking-[-0.03em] leading-none">
        Off the chart
      </h1>
      <p className="mt-5 max-w-[420px] text-[15px] text-[#8A8A8A] leading-relaxed">
        This page doesn&rsquo;t exist or has moved. Let&rsquo;s get you back on track.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="font-mono text-[12px] uppercase tracking-[0.08em] text-[#0A0A0A] bg-[#D4AF37] hover:bg-[#F1C40F] px-5 py-3 transition-colors"
        >
          Back to home
        </Link>
        <Link
          to="/tools"
          className="font-mono text-[12px] uppercase tracking-[0.08em] text-[#8A8A8A] border border-[#1A1A1A] hover:border-[#D4AF37] hover:text-[#F5F5F0] px-5 py-3 transition-colors"
        >
          Open the tools
        </Link>
      </div>
    </div>
  );
}
