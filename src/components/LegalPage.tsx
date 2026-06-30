import type { ReactNode } from 'react';
import { Link } from 'react-router';

export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#060607] text-[#E8E8E3]">
      <header className="sticky top-0 z-50 flex items-center justify-between h-14 px-4 sm:px-6 bg-[#060607]/80 backdrop-blur-[14px] border-b border-white/[0.06]">
        <Link to="/" aria-label="FinatriX home" className="flex items-center gap-2 group">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="7" y="7" width="10" height="10" rx="2.5" fill="#D4AF37" />
            <circle cx="12" cy="12" r="2.1" fill="#060607" />
          </svg>
          <span className="font-semibold text-[14px] tracking-[-0.01em] text-[#F5F5F0] group-hover:text-[#D4AF37] transition-colors">
            Finatri<span className="fx-gold-text">X</span>
          </span>
        </Link>
        <div className="flex gap-5 font-mono text-[11px] uppercase tracking-[0.08em]">
          <Link to="/privacy" className="text-[#8A8A8A] hover:text-[#D4AF37] transition-colors">
            Privacy
          </Link>
          <Link to="/terms" className="text-[#8A8A8A] hover:text-[#D4AF37] transition-colors">
            Terms
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-5 sm:px-8 py-10 sm:py-16">
        <h1 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-white">
          {title}
        </h1>
        <p className="mt-2 text-[13px] text-[#8A8A8A]">Last updated: {updated}</p>
        <div className="legal-body mt-8 text-[15px] leading-[1.7] text-[#C9C9C4]">
          {children}
        </div>

        <div className="mt-14 pt-8 border-t border-white/[0.08] text-[13px] text-[#8A8A8A]">
          Questions about this policy? Email{' '}
          <a
            href="mailto:finatrix.hub@gmail.com"
            className="text-[#D4AF37] hover:underline"
          >
            finatrix.hub@gmail.com
          </a>
          .
        </div>
      </main>
    </div>
  );
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      className="text-white text-[18px] sm:text-[20px] font-medium mt-9 mb-3 tracking-[-0.01em] scroll-mt-20"
    >
      {children}
    </h2>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mb-4">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="mb-4 ml-5 list-disc space-y-2 marker:text-[#D4AF37]">{children}</ul>;
}
