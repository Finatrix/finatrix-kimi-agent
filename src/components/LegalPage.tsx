import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Breadcrumb } from './Breadcrumb';
import ThemeToggle from './ThemeToggle';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../shared/brand';

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
    <div className="min-h-screen bg-surface-base text-ink">
      <header className="sticky top-0 z-50 flex items-center justify-between h-14 px-4 sm:px-6 bg-[var(--nav-bg)] backdrop-blur-[14px] border-b border-hairline-2">
        <Link to="/" aria-label="FinatriX home" className="flex items-center gap-2 group">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="7" y="7" width="10" height="10" rx="2.5" fill="#D4AF37" />
            <circle cx="12" cy="12" r="2.1" fill="var(--surface-base)" />
          </svg>
          <span className="font-semibold text-[14px] tracking-[-0.01em] text-ink group-hover:text-accent-text transition-colors">
            Finatri<span className="fx-gold-text">X</span>
          </span>
        </Link>
        <div className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.08em]">
          <Link to="/" className="text-ink-3 hover:text-accent-text transition-colors">
            Home
          </Link>
          <Link to="/tools" className="text-ink-3 hover:text-accent-text transition-colors">
            Tools
          </Link>
          <Link to="/privacy" className="hidden sm:inline text-ink-3 hover:text-accent-text transition-colors">
            Privacy
          </Link>
          <Link to="/terms" className="hidden sm:inline text-ink-3 hover:text-accent-text transition-colors">
            Terms
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Not a <main>: App.tsx owns the single app-wide `main` landmark, and a
          nested one would give the page two (invalid, and it breaks landmark
          navigation for screen-reader users). */}
      <div className="mx-auto w-full max-w-[760px] px-5 sm:px-8 py-10 sm:py-16">
        <Breadcrumb current={title} className="mb-6" />
        <h1 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-ink">
          {title}
        </h1>
        <p className="mt-2 text-[13px] text-ink-3">Last updated: {updated}</p>
        <div className="legal-body mt-8 text-[15px] leading-[1.7] text-ink-2">
          {children}
        </div>

        <div className="mt-14 pt-8 border-t border-hairline text-[13px] text-ink-3">
          Questions about this policy? Email{' '}
          <a href={SUPPORT_MAILTO} className="text-accent-text hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </div>
      </div>
    </div>
  );
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      className="text-ink text-[18px] sm:text-[20px] font-medium mt-9 mb-3 tracking-[-0.01em] scroll-mt-20"
    >
      {children}
    </h2>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mb-4">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="mb-4 ml-5 list-disc space-y-2 marker:text-accent-text">{children}</ul>;
}
