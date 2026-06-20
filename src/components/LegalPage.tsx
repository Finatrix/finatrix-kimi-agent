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
    <div className="min-h-screen bg-[#0A0A0A] text-[#E8E8E3]">
      <header className="sticky top-0 z-50 flex items-center justify-between h-12 px-4 sm:px-6 bg-[#0A0A0A] border-b border-[#1A1A1A]">
        <Link
          to="/"
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#8A8A8A] hover:text-[#F5F5F0] transition-colors"
        >
          ← FinatriX
        </Link>
        <div className="flex gap-4 font-mono text-[11px] uppercase tracking-[0.08em]">
          <Link to="/privacy" className="text-[#8A8A8A] hover:text-[#D4AF37]">
            Privacy
          </Link>
          <Link to="/terms" className="text-[#8A8A8A] hover:text-[#D4AF37]">
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

        <div className="mt-14 pt-8 border-t border-[#1A1A1A] text-[13px] text-[#8A8A8A]">
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

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-white text-[18px] sm:text-[20px] font-medium mt-9 mb-3 tracking-[-0.01em]">
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
