import { useEffect, useState } from 'react';
import { Link } from 'react-router';

export default function LandingFooter() {
  const [time, setTime] = useState('00:00:00');

  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setTime(
        [n.getUTCHours(), n.getUTCMinutes(), n.getUTCSeconds()]
          .map((v) => String(v).padStart(2, '0'))
          .join(':')
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer className="relative z-10 border-t border-white/[0.06] bg-[#070707]">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="7" y="7" width="10" height="10" rx="2.5" fill="#D4AF37" />
            <circle cx="12" cy="12" r="2.1" fill="#070707" />
          </svg>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8A8A8A]">
            © 2026 FinatriX
          </span>
        </div>

        <nav className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.08em] text-[#8A8A8A]">
          <Link to="/privacy" className="hover:text-[#D4AF37] transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-[#D4AF37] transition-colors">Terms</Link>
          <a href="mailto:finatrix.hub@gmail.com" className="hover:text-[#D4AF37] transition-colors">Contact</a>
          <a
            href="https://twitter.com/finatrix_"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#D4AF37] transition-colors"
          >
            @finatrix_
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#5A5A5A]">UTC</span>
          <span className="font-mono text-[12px] text-[#D4AF37] tabular-nums">{time}</span>
        </div>
      </div>
    </footer>
  );
}
